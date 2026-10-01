"""Build data/curated/*.csv from extracted facts, hand-curated rows and review rules.

    data/extracted/<chunk>.json      Stage 3 output (not edited by hand)
    data/curated/manual/*.csv        hand-entered rows; win over extracted rows
    data/curated/rules.yaml          review decisions (aliases, overrides, drops)
        -> data/curated/*.csv        the dataset the app is built from (generated)
        -> data/review/report.md     what still needs a human look

Hand edits go into manual/ or rules.yaml, never into the generated tables, so
the build can be re-run whenever extraction or rules change.
"""
from __future__ import annotations

import csv
import glob
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import yaml

from bailliage import config
from bailliage.curate.resolve import (EntityResolver, Gazetteer, PlaceResolver, base_name, fold,
                                      preferred_domain_types, slug)
from bailliage.data import store, validate
from bailliage.data.models import Entity, Event, Membership, Place, Right, Ruler

MANUAL_DIR = config.CURATED_DIR / "manual"
RULES_FILE = config.CURATED_DIR / "rules.yaml"
GEOCODING_FILE = config.CURATED_DIR / "geocoding.csv"  # written by `make geocode` (Stage 5)
REPORT_FILE = config.DATA_DIR / "review" / "report.md"
CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}
SNIPPET_MAX = 300
STATE_TYPES = {"empire", "kingdom", "duchy", "electorate", "temporal_bishopric"}
TRANSFER_EVENTS = {"purchase", "pledge", "redemption", "inheritance", "enfeoffment", "exchange", "cession",
                   "occupation"}
# Feudal realms (titles held of a lord) as against the bailiwick's districts (offices, provostships...).
FEUDAL_TYPES = {"principality", "marquisate", "county", "barony", "lordship", "fief", "advocacy", "allod"}
# Where a right sits when a realm is split into an office and a fief.
FIEF_RIGHTS = {"manorial_lord", "high_justice", "middle_low_justice", "advocate"}
OFFICE_RIGHTS = {"tax_aide", "military", "appeal_jurisdiction", "tabellionage"}
_ID_LIKE = re.compile(r"^(?:county|lordship|duchy|office|barony|principality|castellany|bailiwick|provostship|"
                      r"marquisate|advocacy|condominium|ban|fief|receivership|mayoralty|court)-[a-z0-9-]+$", re.I)


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="") as f:
        return [row for row in csv.DictReader(f) if any(v.strip() for v in row.values())]


def _write_csv(model, rows: list[dict]) -> None:
    cols = model.columns()
    with (config.CURATED_DIR / f"{model.table}.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({c: _cell(r.get(c)) for c in cols})


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else ""
    if isinstance(value, (list, tuple, set)):
        return "|".join(sorted(map(str, value)))
    return str(value)


def page_ref(pages: set[int]) -> str:
    """{12, 13, 14, 49} -> '12-14;49'."""
    out, run = [], []
    for p in sorted(pages):
        if run and p == run[-1] + 1:
            run.append(p)
        else:
            if run:
                out.append(f"{run[0]}-{run[-1]}" if len(run) > 1 else str(run[0]))
            run = [p]
    if run:
        out.append(f"{run[0]}-{run[-1]}" if len(run) > 1 else str(run[0]))
    return ";".join(out)


def pages_of(ref: str | None) -> set[int]:
    """Pages from a model-written reference ('49', 'p. 49-50', '13, 52')."""
    pages: set[int] = set()
    for a, b in re.findall(r"(\d{1,3})(?:\s*-\s*(\d{1,3}))?", ref or ""):
        lo, hi = int(a), int(b or a)
        pages.update(range(lo, hi + 1) if 0 < hi - lo < 10 else [lo])
    return {p for p in pages if 1 <= p <= 310}


def _overlap(a: dict, b: dict) -> bool:
    """Periods share more than a single handover year (open ends reach 1599/1633)."""
    lo = max(a["from_year"] or 1599, b["from_year"] or 1599)
    hi = min(a["to_year"] or 1633, b["to_year"] or 1633)
    handover = hi == lo and (a["to_year"] == b["from_year"] or b["to_year"] == a["from_year"])
    return hi >= lo and not handover


def _year(y):
    return y if isinstance(y, int) and 1000 <= y <= 1800 else None


def _share(s):
    return s if s and re.fullmatch(r"\d+/\d+|joint", s) else None


class Builder:
    def __init__(self):
        self.rules = yaml.safe_load(RULES_FILE.read_text()) if RULES_FILE.exists() else {}
        self.rules = {k: v or {} for k, v in (self.rules or {}).items()}
        self.manual = {m.table: _read_csv(MANUAL_DIR / f"{m.table}.csv")
                       for m in (Place, Entity, Ruler, Membership, Right, Event)}
        vocab = store.load_vocab(config.CURATED_DIR / "vocab.yaml")
        territory_types = {k for k, v in vocab["place_types"].items() if v.get("applies_to") == "territory"}
        self.chunks = [json.loads(Path(p).read_text())
                       for p in sorted(glob.glob(str(config.EXTRACTED_DIR / "L*_*.json")))]
        mentions = [p for c in self.chunks for p in c["extraction"]["places"]]
        self.places = PlaceResolver(Gazetteer.load(), self.manual["places"], self.rules.get("place_aliases", {}),
                                    territory_types, preferred_domain_types(mentions),
                                    self.rules.get("split_realms", {}))
        self.entities = EntityResolver(self.manual["entities"], self.rules.get("entity_aliases", {}))
        self.rights: dict[tuple, dict] = {}
        self.events: dict[tuple, dict] = {}
        self.memberships: dict[tuple, dict] = {}
        self.rulers: dict[tuple, dict] = {}
        self.place_pages: dict[str, set[int]] = defaultdict(set)
        self.dropped = Counter()
        self.stats = Counter()

    # --- merging extracted chunks ----------------------------------------------
    def add_chunk(self, record: dict) -> None:
        x = record["extraction"]
        section = record["section_id"]
        pid = {p["name_in_text"]: self.places.resolve(p, section) for p in x["places"]}
        for e in x["entities"]:
            self.entities.add(e)

        def place(name):
            if name not in pid:  # not declared in the chunk: resolve by name alone
                pid[name] = self.places.resolve({"name_in_text": name, "index_name": "", "kind": "settlement",
                                                 "place_type": "village", "other_names": []}, section)
            return pid[name]

        ent = self.entities.canonical
        for r in x["rights"]:
            if not r["place"] or not r["holder_id"]:
                self.dropped["missing place or holder"] += 1
                continue
            holder = ent(slug(r["holder_id"]))
            row = {
                "place_id": place(r["place"]), "right_type": r["right_type"], "holder_id": holder,
                "share": _share(r["share"]), "status": r["status"], "is_disputed": r["is_disputed"],
                "disputed_with": {d for d in (ent(slug(d)) for d in r["disputed_with"]) if d != holder},
                "from_year": _year(r["from_year"]), "to_year": _year(r["to_year"]),
                "from_precision": r["from_precision"], "to_precision": r["to_precision"],
                "pages": pages_of(r["source_page"]), "snippet": r["snippet"], "confidence": r["confidence"],
                "notes": r["notes"],
            }
            if row["from_year"] is None:
                row["from_precision"] = None
            if row["to_year"] is None:
                row["to_precision"] = None
            if row["from_year"] and row["to_year"] and row["from_year"] > row["to_year"]:
                row["from_year"], row["to_year"] = row["to_year"], row["from_year"]
            if self._dropped(row):
                continue
            self._override(row)
            key = (row["place_id"], row["right_type"], holder, row["share"], row["status"],
                   row["from_year"], row["to_year"])
            self._merge(self.rights, key, row)
            self.place_pages[row["place_id"]] |= row["pages"]
        for e in x["events"]:
            if not _year(e["year"]) or not e["place"]:
                self.dropped["event without year or place"] += 1
                continue
            row = {"year": e["year"], "place_id": place(e["place"]), "right_type": e["right_type"],
                   "from_holder": ent(slug(e["from_holder"])) if e["from_holder"] else None,
                   "to_holder": ent(slug(e["to_holder"])) if e["to_holder"] else None,
                   "event_type": e["event_type"], "description": e["description"],
                   "pages": pages_of(e["source_page"]), "confidence": e["confidence"]}
            key = (row["year"], row["place_id"], row["right_type"], row["from_holder"], row["to_holder"],
                   row["event_type"])
            self._merge(self.events, key, row)
        for m in x["memberships"]:
            if not m["child"] or not m["parent"]:
                self.dropped["membership without child or parent"] += 1
                continue
            row = {"child_id": place(m["child"]), "parent_id": place(m["parent"]),
                   "from_year": _year(m["from_year"]), "to_year": _year(m["to_year"]),
                   "pages": pages_of(m["source_page"]), "confidence": "high"}
            if row["child_id"] == row["parent_id"]:
                continue
            if self._is_state(row["parent_id"]) or self._is_state(row["child_id"]):
                # "the county of Bitche belongs to Lorraine": allegiance, recorded as suzerainty rows
                self.dropped["membership in a political entity (not a territory)"] += 1
                continue
            if self._dropped(row, "drop_memberships", {"child": "child_id", "parent": "parent_id"}):
                continue
            self._merge(self.memberships, (row["child_id"], row["parent_id"], row["from_year"], row["to_year"]), row)
        for r in x["rulers"]:
            if not r["entity_id"] or not r["person_name"]:
                self.dropped["ruler without entity or name"] += 1
                continue
            row = {"entity_id": ent(slug(r["entity_id"])), "person_name": r["person_name"], "title": r["title"],
                   "from_year": _year(r["from_year"]), "to_year": _year(r["to_year"]),
                   "from_precision": r["from_precision"] if _year(r["from_year"]) else None,
                   "to_precision": r["to_precision"] if _year(r["to_year"]) else None,
                   "pages": pages_of(r["source_page"]), "confidence": r["confidence"]}
            key = (row["entity_id"], fold(row["person_name"]), row["from_year"], row["to_year"])
            self._merge(self.rulers, key, row)

    def _dropped(self, row: dict, rules: str = "drop_rights",
                 fields: dict | None = None) -> bool:
        fields = fields or {"place": "place_id", "holder": "holder_id"}
        for rule in self.rules.get(rules, []) or []:
            if all(str(row.get(fields.get(k, k))) == str(v)
                   for k, v in rule.items() if k != "reason"):
                self.dropped[rule.get("reason", "drop rule")] += 1
                return True
        return False

    def _is_state(self, place_id: str) -> bool:
        """A 'place' that is really a sovereign state (duchy of Lorraine, the Empire, ...).
        Counties and lordships are both holders and territories, so they stay places."""
        e = self.entities.entities.get(place_id)
        if e is None:
            return False
        types = e.types or Counter({(e.manual or {}).get("entity_type"): 1})
        return types.most_common(1)[0][0] in STATE_TYPES

    def _override(self, row: dict) -> None:
        for rule in self.rules.get("right_overrides", []) or []:
            if all(str(row.get({"place": "place_id", "holder": "holder_id"}.get(k, k))) == str(v)
                   for k, v in rule["match"].items()):
                row.update(rule["set"])
                if rule.get("reason"):
                    row["notes"] = rule["reason"]
                self.stats["rights changed by right_overrides"] += 1

    @staticmethod
    def _merge(table: dict, key: tuple, row: dict) -> None:
        old = table.get(key)
        if old is None:
            table[key] = row
            return
        old["pages"] |= row["pages"]
        if CONFIDENCE_RANK.get(row.get("confidence"), 0) > CONFIDENCE_RANK.get(old.get("confidence"), 0):
            old["confidence"] = row["confidence"]
        if "is_disputed" in row:
            old["is_disputed"] = old["is_disputed"] or row["is_disputed"]
            old["disputed_with"] |= row["disputed_with"]
        for f in ("snippet", "notes", "description", "from_precision", "to_precision", "title"):
            if f in row and not old.get(f) and row.get(f):
                old[f] = row[f]

    # --- realms split into an office and a fief (rules.yaml split_realms) ----------------
    def _split_pairs(self) -> list[tuple[str, str]]:
        return [(v["admin"], v["feudal"]) for v in (self.rules.get("split_realms") or {}).values()]

    def _type_of(self, pid: str) -> str:
        manual = next((m for m in self.manual["places"] if m["id"] == pid), None)
        if manual:
            return manual["place_type"]
        p = self.places.places.get(pid)
        return p.place_type if p else ""

    def split_rights(self) -> int:
        """The lord's rights (manorial lordship, justice, advocacy) belong to the fief; the
        bailiwick's (aids and taxes, musters, notaries, appeals) to the office. Rows and events
        the extraction put on the other half move over."""
        moves = {}
        for office, fief in self._split_pairs():
            moves |= {(office, t): fief for t in FIEF_RIGHTS} | {(fief, t): office for t in OFFICE_RIGHTS}
        moved = 0
        rights: dict[tuple, dict] = {}
        for r in self.rights.values():
            if (target := moves.get((r["place_id"], r["right_type"]))):
                r["place_id"], moved = target, moved + 1
            self._merge(rights, (r["place_id"], r["right_type"], r["holder_id"], r["share"], r["status"],
                                 r["from_year"], r["to_year"]), r)
        events: dict[tuple, dict] = {}
        for e in self.events.values():
            if (target := moves.get((e["place_id"], e["right_type"]))):
                e["place_id"], moved = target, moved + 1
            self._merge(events, (e["year"], e["place_id"], e["right_type"], e["from_holder"], e["to_holder"],
                                 e["event_type"]), e)
        self.rights, self.events = rights, events
        return moved

    def split_memberships(self) -> int:
        """An office and its fief share their lands: the fief's places are in the office, and
        the office's own places (not in another fief) are the fief's. The fief lies in its office,
        which takes the fief's place in the administrative hierarchy (the bailiwick)."""
        changed = 0

        def add(child, parent, like):
            nonlocal changed
            if any(m["child_id"] == child and m["parent_id"] == parent for m in self.memberships.values()):
                return
            row = {"child_id": child, "parent_id": parent, "from_year": like.get("from_year"),
                   "to_year": like.get("to_year"), "pages": set(like.get("pages") or ()), "confidence": "high",
                   "notes": "shared lands of an office and its fief (rules.yaml split_realms)"}
            self.memberships[(child, parent, row["from_year"], row["to_year"])] = row
            changed += 1

        def is_settlement(pid: str) -> bool:
            manual = next((m for m in self.manual["places"] if m["id"] == pid), None)
            if manual:
                return manual["kind"] == "settlement"
            p = self.places.places.get(pid)
            return bool(p) and p.kind == "settlement" and p.place_type not in self.places.territory_types

        for office, fief in self._split_pairs():
            ms = list(self.memberships.values())
            # the fief lies in its office: cite the pages that give the fief's lands
            fief_pages = set().union(*(m["pages"] for m in ms if fief in (m["child_id"], m["parent_id"])))
            in_other_fief = {m["child_id"] for m in [*ms, *self.manual["memberships"]] if m["parent_id"] != fief
                             and self._type_of(m["parent_id"]) in FEUDAL_TYPES}
            for m in ms:
                if m["parent_id"] == fief and is_settlement(m["child_id"]):
                    add(m["child_id"], office, m)
                elif m["parent_id"] == office and is_settlement(m["child_id"]) and m["child_id"] not in in_other_fief:
                    add(m["child_id"], fief, m)
            for key, m in list(self.memberships.items()):
                # 'la seigneurie de Forbach' among the units of the bailiwick: the office is. (A fief
                # listed in another office, like Faulquemont in Boulay's in 1630, stays where it is.)
                if m["child_id"] == fief and self._type_of(m["parent_id"]) == "bailiwick":
                    del self.memberships[key]
                    add(office, m["parent_id"], m)
                    changed += 1
            add(fief, office, {"pages": fief_pages})
        return changed

    # --- refinement ----------------------------------------------------------------
    def date_rights_from_events(self) -> int:
        """Use each transfer event (A -> B in year Y) to close A's open-ended row and open
        B's: the extraction often states a transfer as an event while the rights rows
        describe the holders without years."""
        changed = 0
        by_holder = defaultdict(list)
        for r in self.rights.values():
            if r["status"] in ("held", "pledged"):
                by_holder[(r["place_id"], r["right_type"], r["holder_id"])].append(r)
        for e in self.events.values():
            if not (e["right_type"] and e["from_holder"] and e["to_holder"]):
                continue
            year = e["year"]
            for r in by_holder.get((e["place_id"], e["right_type"], e["from_holder"]), []):
                if r["to_year"] is None and (r["from_year"] or 0) <= year:
                    r["to_year"], r["to_precision"] = year, "exact"
                    changed += 1
            for r in by_holder.get((e["place_id"], e["right_type"], e["to_holder"]), []):
                if r["from_year"] is None and (r["to_year"] or 9999) >= year:
                    r["from_year"], r["from_precision"] = year, "exact"
                    changed += 1
        self._rekey_rights()
        return changed

    def merge_same_holder(self) -> int:
        """Rows for the same holder of the same right whose periods overlap describe one
        holding (typically the standing situation plus a dated mention): keep one row,
        with the most specific period, and pool the pages."""
        groups = defaultdict(list)
        for r in self.rights.values():
            groups[(r["place_id"], r["right_type"], r["holder_id"], r["status"], r["share"])].append(r)
        merged = 0
        for rows in groups.values():
            rows.sort(key=lambda r: (-sum(y is not None for y in (r["from_year"], r["to_year"])),
                                     r["from_year"] or 0))
            kept: list[dict] = []
            for r in rows:
                target = next((k for k in kept if _overlap(k, r)), None)
                if target is None:
                    kept.append(r)
                    continue
                r_copy = dict(r, from_year=target["from_year"], to_year=target["to_year"],
                              from_precision=target["from_precision"], to_precision=target["to_precision"])
                self._merge({0: target}, 0, r_copy)
                merged += 1
            for r in rows:
                if not any(r is k for k in kept):
                    r["_merged"] = True
        self.rights = {k: r for k, r in self.rights.items() if not r.get("_merged")}
        return merged

    def _rekey_rights(self) -> None:
        rekeyed: dict[tuple, dict] = {}
        for r in self.rights.values():
            key = (r["place_id"], r["right_type"], r["holder_id"], r["share"], r["status"], r["from_year"], r["to_year"])
            self._merge(rekeyed, key, r)
        self.rights = rekeyed

    def normalize_memberships(self) -> int:
        """Membership years in the extraction are almost always attestations: 'in 1606 the
        haute-mairie comprised ...' comes back as 'member until 1606'. A year is kept only
        when a sovereignty or high-justice transfer of the member itself backs it (within a
        year); otherwise the membership describes the standing composition. Explicit changes
        belong in manual/memberships.csv. Overlapping rows for the same pair are then merged."""
        event_years = defaultdict(set)
        for e in self.events.values():
            # Only transfers of sovereignty or high justice move a place between territories.
            if e["event_type"] in TRANSFER_EVENTS and e["right_type"] in (None, "suzerain", "high_justice"):
                event_years[e["place_id"]].add(e["year"])

        def backed(year, m):  # an event about the member itself; one about the parent does not move villages
            return year is not None and any(abs(year - y) <= 1 for y in event_years.get(m["child_id"], ()))
        for m in self.memberships.values():
            if not backed(m["from_year"], m):
                m["from_year"] = None
            if not backed(m["to_year"], m):
                m["to_year"] = None
        groups = defaultdict(list)
        for m in self.memberships.values():
            groups[(m["child_id"], m["parent_id"])].append(m)
        kept_rows, merged = {}, 0
        for key, rows in groups.items():
            rows.sort(key=lambda r: -sum(y is not None for y in (r["from_year"], r["to_year"])))
            kept: list[dict] = []
            for r in rows:
                target = next((k for k in kept if _overlap(k, r)), None)
                if target is None:
                    kept.append(r)
                else:
                    target["pages"] |= r["pages"]
                    merged += 1
            for r in kept:
                kept_rows[(*key, r["from_year"], r["to_year"])] = r
        self.memberships = kept_rows
        return merged

    # --- output ----------------------------------------------------------------
    def _finish(self, rows: list[dict]) -> list[dict]:
        for r in rows:
            if "pages" in r:
                r["source_page"] = page_ref(r.pop("pages")) or None
            if r.get("snippet"):
                r["snippet"] = r["snippet"][:SNIPPET_MAX]
            if r.get("notes"):
                r["notes"] = r["notes"][:SNIPPET_MAX]
            if "disputed_with" in r:
                r["is_disputed"] = bool(r["is_disputed"] or r["disputed_with"])
        return rows

    def build(self) -> dict[str, list[dict]]:
        for chunk in self.chunks:
            self.add_chunk(chunk)
        self.stats["rights and events moved between an office and its fief"] = self.split_rights()
        self.stats["rights dated from events"] = self.date_rights_from_events()
        self.stats["rights merged (same holder, overlapping)"] = self.merge_same_holder()
        self.stats["memberships merged (attestation years, duplicates)"] = self.normalize_memberships()
        self.stats["memberships added or moved for split realms"] = self.split_memberships()

        # Hand-curated rows win: extracted rows for a covered (place, right) or entity are dropped.
        manual_right_keys = {(r["place_id"], r["right_type"]) for r in self.manual["rights"]}
        rights = [r for k, r in self.rights.items() if (k[0], k[1]) not in manual_right_keys]
        self.dropped["covered by manual rights"] = len(self.rights) - len(rights)
        manual_ruled = {r["entity_id"] for r in self.manual["rulers"]}
        rulers = [r for r in self.rulers.values() if r["entity_id"] not in manual_ruled]
        manual_events = {(int(e["year"]), e["place_id"], e["event_type"]) for e in self.manual["events"]}
        events = [e for e in self.events.values() if (e["year"], e["place_id"], e["event_type"]) not in manual_events]
        manual_members = {(m["child_id"], m["parent_id"]) for m in self.manual["memberships"]}
        memberships = [m for m in self.memberships.values() if (m["child_id"], m["parent_id"]) not in manual_members]

        rights = self.manual["rights"] + self._finish(rights)
        events = self.manual["events"] + self._finish(events)
        memberships = self.manual["memberships"] + self._finish(memberships)
        rulers = self.manual["rulers"] + self._finish(rulers)

        used_places = {r["place_id"] for r in rights} | {e["place_id"] for e in events} | \
            {m["child_id"] for m in memberships} | {m["parent_id"] for m in memberships}
        used_entities = {r["holder_id"] for r in rights} | {r["entity_id"] for r in rulers} | \
            {e[k] for e in events for k in ("from_holder", "to_holder") if e.get(k)} | \
            {d for r in rights for d in (r["disputed_with"] if isinstance(r["disputed_with"], set)
                                          else filter(None, r["disputed_with"].split("|")))}
        return {
            "places": self._place_rows(used_places),
            "entities": self._entity_rows(used_entities),
            "rulers": sorted(rulers, key=lambda r: (r["entity_id"], str(r.get("from_year") or ""))),
            "memberships": sorted(memberships, key=lambda m: (m["parent_id"], m["child_id"])),
            "rights": sorted(rights, key=lambda r: (r["place_id"], r["right_type"], str(r.get("from_year") or ""),
                                                    r["holder_id"])),
            "events": sorted(events, key=lambda e: (int(e["year"]), e["place_id"])),
        }

    def _place_rows(self, used: set[str]) -> list[dict]:
        rows = self._place_rows_without_geo(used)
        geo = {g["place_id"]: g for g in _read_csv(GEOCODING_FILE)}
        manual = {m["id"] for m in self.manual["places"]}
        for row in rows:  # fill only what is empty: hand-entered values win
            g = geo.get(row["id"])
            if not g:
                continue
            if g["method"] == "territory" and g["name_fr"] and row["id"] not in manual:
                row["name_fr"] = g["name_fr"]  # 'Forbach' -> 'Seigneurie de Forbach' (see geocode.territory_names)
            for field, value in (("lat", g["lat"]), ("lon", g["lon"]), ("wikidata_id", g["wikidata_id"]),
                                 ("geonames_id", g["geonames_id"]), ("name_de", g["name_de"]),
                                 ("name_en", g["name_en"])):
                if value and not row.get(field):
                    row[field] = value
        return rows

    def _place_rows_without_geo(self, used: set[str]) -> list[dict]:
        rows = [dict(m) for m in self.manual["places"]]
        for pid in sorted(used - {m["id"] for m in rows}):
            p = self.places.places.get(pid)
            if p is None:
                continue
            variants = [v for v in p.variants if v and len(v) <= 60 and v.lower() != pid]
            kind = "territory" if p.place_type in self.places.territory_types else p.kind
            name = p.usual_name if kind == "settlement" else p.name_fr
            variants = [v for v in {*variants, p.name_fr} if v != name]
            if _ID_LIKE.match(name):  # named by an id ("county-la-petite-pierre"): use a real name
                name = next((v for v in sorted(p.variants) if not _ID_LIKE.match(v)), name)
            variants = sorted(v for v in variants if v != name)[:8]
            rows.append({"id": pid, "kind": kind, "name_fr": name, "variants": variants,
                         "place_type": p.place_type, "modern_country": p.modern_country,
                         "source_page": page_ref(self.place_pages.get(pid, set())) or None,
                         "confidence": "high" if p.gazetteer else "medium"})
        # rules.yaml place_types: id -> type, where the book says what a place is ("nouveau village de X")
        for row in rows:
            if (ptype := (self.rules.get("place_types") or {}).get(row["id"])):
                row["place_type"] = ptype
                self.stats["place types set by rules"] += 1
        return rows

    def _entity_rows(self, used: set[str]) -> list[dict]:
        overrides = self.rules.get("entities", {})
        rows = [dict(m) for m in self.manual["entities"]]
        for eid in sorted(used - {m["id"] for m in rows}):
            e = self.entities.entities.get(eid)
            top = lambda c, default: c.most_common(1)[0][0] if c else default  # noqa: E731
            fallback = eid.replace("-", " ").title()
            row = {"id": eid,
                   "name_fr": top(e.names_fr, fallback) if e else fallback,
                   "name_en": top(e.names_en, fallback) if e else fallback,
                   "name_de": top(e.names_de, fallback) if e else fallback,
                   "entity_type": top(e.types, "noble_house") if e else "noble_house",
                   "confidence": "high" if e and e.names_fr else "low"}
            row.update(overrides.get(eid, {}))
            rows.append(row)
        return rows


def run() -> int:
    b = Builder()
    tables = b.build()
    for model in (Place, Entity, Ruler, Membership, Right, Event):
        _write_csv(model, tables[model.table])
    ds = store.load()
    issues = validate.validate(ds)
    write_report(b, ds, issues)
    counts = Counter(i.level for i in issues)
    print("curated: " + ", ".join(f"{k} {len(v)}" for k, v in tables.items()))
    for reason, n in b.stats.items():
        print(f"  {reason}: {n}")
    for reason, n in b.dropped.items():
        print(f"  dropped {n} extracted row(s): {reason}")
    print(f"validation: {counts['error']} error(s), {counts['warning']} warning(s), {counts['info']} info; "
          f"report: {REPORT_FILE.relative_to(config.ROOT)}")
    errors = counts["error"]
    return 1 if errors else 0


def write_report(b: Builder, ds: store.Dataset, issues: list) -> None:
    """Markdown summary of what needs review, most actionable first."""
    usage = Counter(r.holder_id for _, r in ds.rights)
    lines = ["# Stage 4 review report", "", "Generated by `make curate`; do not edit.", "",
             *[f"- {l}" for l in validate.coverage(ds)], ""]

    groups: dict[tuple, list] = defaultdict(list)
    for i in issues:
        pattern = re.sub(r"'[^']*'|\b\d{3,4}\b|line \d+", "…", i.message)
        groups[(i.level, i.table, pattern)].append(i)
    lines += ["## Validation issues", "", "| level | table | issue | count | first rows |", "|---|---|---|---|---|"]
    for (level, table, pattern), items in sorted(groups.items(), key=lambda kv: (kv[0][0] != "error", -len(kv[1]))):
        rows = ", ".join(str(i.row) for i in items[:5])
        lines.append(f"| {level} | {table} | {pattern} | {len(items)} | {rows} |")

    lines += ["", "## Entity merge suggestions", "",
              "Add confirmed pairs to `entity_aliases` in `data/curated/rules.yaml` (drop → keep).", "",
              "| drop | keep | similarity | uses (drop/keep) |", "|---|---|---|---|"]
    for drop, keep, score in b.entities.merge_suggestions(usage):
        if drop in usage or keep in usage:
            lines.append(f"| `{drop}` | `{keep}` | {score} | {usage[drop]}/{usage[keep]} |")

    by_base = defaultdict(set)
    for _, p in ds.places:
        if p.kind == "territory":
            by_base[base_name(p.name_fr)].add(p.id)
    lines += ["", "## Territories that may be one place", "",
              "Same name with different types; map duplicates with `place_aliases` if they are the same.", ""]
    lines += [f"- {base}: " + ", ".join(f"`{i}`" for i in sorted(ids)) for base, ids in sorted(by_base.items())
              if len(ids) > 1]

    unindexed = sorted(p.id for _, p in ds.places if p.kind == "settlement" and p.confidence != "high")
    lines += ["", f"## Settlements not found in the book's index ({len(unindexed)})", "",
              "Often OCR variants of an indexed name; fix with `place_aliases`.", "", ", ".join(unindexed)]

    geo = [g for g in _read_csv(GEOCODING_FILE) if g["method"] != "territory" and g["confidence"] != "high"]
    order = {"unlocated": 0, "approximate": 1}
    geo.sort(key=lambda g: (order.get(g["method"], 2), g["confidence"] != "low", g["place_id"]))
    lines += ["", f"## Geocoding to check ({len(geo)})", "",
              "Fix with the `geocode` section of `data/curated/rules.yaml` "
              "(place-id: {wikidata: Q…} or {lat: …, lon: …, note: …}), then `make geocode curate`.", "",
              "| place | method | confidence | lat, lon | wikidata / geonames | note |", "|---|---|---|---|---|---|"]
    lines += [f"| {g['place_id']} | {g['method']} | {g['confidence']} | {g['lat']}, {g['lon']} | "
              f"{g['wikidata_id'] or g['geonames_id']} | {g['note']} |" for g in geo]

    low = [(line, r) for line, r in ds.rights if r.confidence == "low"]
    lines += ["", f"## Low-confidence rights ({len(low)})", "", "| line | place | right | holder | pages | note |",
              "|---|---|---|---|---|---|"]
    lines += [f"| {line} | {r.place_id} | {r.right_type} | {r.holder_id} | {r.source_page} | "
              f"{(r.notes or r.snippet or '')[:80]} |" for line, r in low[:150]]
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text("\n".join(lines) + "\n")
