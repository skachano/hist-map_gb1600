"""Geocode curated places and give them French, German and English names.

Settlements: Wikidata items whose label or alternative label equals one of the
place's names (book name, variants, index entry), scored by place class, country
and distance to the canton the book's index gives ("Anzeling (M., Bouzonville)").
Territories: named from their type ("office" -> Office de / Amt / Office of) and
their seat, and placed at the seat when a settlement of the same name is located.

Output: data/curated/geocoding.csv (read by `make curate`); manual decisions go in
the `geocode` section of data/curated/rules.yaml.
"""
from __future__ import annotations

import csv
import difflib
import math
from collections import Counter
from dataclasses import dataclass

import yaml

from bailliage import config
from bailliage.curate.build import Builder
from bailliage.curate.resolve import base_name, fold
from bailliage.data.store import load_vocab
import re

from bailliage.geo import wikidata
from bailliage.geo.geonames import GeoNames

OUT_FILE = config.CURATED_DIR / "geocoding.csv"
COLUMNS = ["place_id", "lat", "lon", "wikidata_id", "geonames_id", "name_fr", "name_de", "name_en", "method",
           "confidence", "note"]

# Wikidata classes (P31) that are settlements, and ones that are never what we want.
SETTLEMENT_CLASSES = {
    "Q484170",    # commune of France
    "Q26714626",  # former commune of France
    "Q2989454",   # associated commune of France
    "Q262166",    # municipality of Germany
    "Q116457956", "Q42744322", "Q15632617",  # German municipality variants
    "Q253019",    # Ortsteil
    "Q2785216",   # municipal district (Stadtteil)
    "Q486972", "Q532", "Q5084", "Q3957", "Q515", "Q1549591", "Q3257686",  # settlement, village, hamlet, town...
    "Q2919801", "Q1637706",  # commune / locality of Luxembourg
    "Q1133961",   # deserted medieval village
}
CASTLE_ABBEY_CLASSES = {"Q23413", "Q751876", "Q160742", "Q44613", "Q1070990", "Q2977", "Q16560"}
EXCLUDED_CLASSES = {
    "Q55488", "Q1339195", "Q928830", "Q2175765", "Q55491",  # stations, stops
    "Q16970", "Q108325", "Q2031836", "Q56242215",            # churches, chapels
    "Q79007", "Q34442", "Q12280",                            # street, road, bridge
    "Q4022", "Q47521", "Q23397", "Q8502", "Q54050", "Q4421",  # river, stream, lake, mountain, hill, forest
    "Q39614", "Q33506", "Q4830453", "Q820477", "Q3914",      # cemetery, museum, company, mine, school
    "Q102496", "Q192611",                                    # parish, electoral unit
}
MAX_ANCHOR_KM = 25


@dataclass
class Result:
    place_id: str
    lat: float | None = None
    lon: float | None = None
    wikidata_id: str | None = None
    geonames_id: int | None = None
    name_fr: str | None = None
    name_de: str | None = None
    name_en: str | None = None
    method: str = "unlocated"
    confidence: str = "low"
    note: str = ""


_QUALIFIERS = re.compile(r"\s*(?:-l[eè]s-| près de | proche | lez | sur | alias | ou ).*$", re.I)
_PREFIXES = re.compile(r"^(?:bourg|château|chateau|village|cense|ville|abbaye|prieuré|faubourg) (?:de |d')", re.I)


def name_variants(name: str) -> set[str]:
    """'Stat-lès-Besseringen' -> {itself, 'Stat'}; 'Bruch alias Marienfloss' -> {.., 'Bruch', 'Marienfloss'};
    'bourg de Siersberg' -> {.., 'Siersberg'}."""
    out = {name}
    stripped = _PREFIXES.sub("", name).strip()
    out.add(stripped)
    for part in re.split(r"\s+(?:alias|ou)\s+", stripped):
        out.add(part.strip())
        out.add(_QUALIFIERS.sub("", part).strip())
    for n in list(out):  # "Saint-Arnual" is "St. Arnual" / "Sankt Arnual" in German data
        m = re.match(r"^(?:Saint|Sankt|St\.?)[- ](.+)$", n)
        if m:
            out |= {f"Saint-{m.group(1)}", f"Sankt {m.group(1)}", f"St. {m.group(1)}"}
    return {n for n in out if len(n) >= 3}


def building_names(base: str, place_type: str) -> set[str]:
    """Castles and abbeys are labelled by their building: 'Château de Montclair', 'Burg Montclair'."""
    if place_type == "castle":
        return {f"Château de {base}", f"Burg {base}", f"Schloss {base}", f"Château {base}"}
    if place_type in ("abbey", "priory"):
        return {f"Abbaye de {base}", f"Abtei {base}", f"Kloster {base}", f"Prieuré de {base}"}
    return set()


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def score(item: dict, names: set[str], country: str | None, place_type: str) -> float | None:
    """Higher is better; None excludes the candidate."""
    if item["types"] & EXCLUDED_CLASSES and not item["types"] & (SETTLEMENT_CLASSES | CASTLE_ABBEY_CLASSES):
        return None
    if country and item["country"] and item["country"] != country:
        return None
    s = 0.0
    if item["types"] & SETTLEMENT_CLASSES:
        s += 3
    if place_type in ("castle", "abbey", "priory") and item["types"] & CASTLE_ABBEY_CLASSES:
        s += 3
    folded = {fold(n) for n in names}
    if any(fold(item[lang] or "") in folded for lang in ("fr", "de")):
        s += 1  # the item's own label (not only an alternative label) is one of our names
    return s


def best_candidate(names: set[str], items: dict, country: str | None, place_type: str,
                   anchor: tuple[float, float] | None) -> tuple[dict | None, str, str]:
    """(item, confidence, note) for the best-matching Wikidata item."""
    folded = {fold(n) for n in names}
    cands = []
    for it in items.values():
        if not {fold(m) for m in it["matched"]} & folded:
            continue
        s = score(it, names, country, place_type)
        if s is None:
            continue
        dist = km(anchor, (it["lat"], it["lon"])) if anchor else None
        cands.append((s, -(dist or 0), it))
    if not cands:
        return None, "low", "no candidate"
    # The anchor ranks candidates; the index's "canton" is sometimes a more distant arrondissement.
    cands.sort(key=lambda c: (c[0], c[1]), reverse=True)
    top = cands[0]
    if anchor and -top[1] > MAX_ANCHOR_KM:
        return top[2], "medium", f"{-top[1]:.0f} km from the index's canton"
    rivals = [c for c in cands[1:] if c[0] == top[0] and km((c[2]["lat"], c[2]["lon"]), (top[2]["lat"], top[2]["lon"])) > 3]
    if rivals and anchor is None:
        others = ", ".join(c[2]["qid"] for c in rivals[:3])
        return top[2], "low", f"ambiguous without canton; also {others}"
    confidence = "high" if top[0] >= 3 and (anchor is not None or not rivals) else "medium"
    return top[2], confidence, "" if anchor else "no canton anchor"


def territory_names(place, vocab: dict, seat: Result | None) -> tuple[str, str, str]:
    """Names in French, German and English. A name without a type word ('Forbach') gets the
    type in every language: ('Seigneurie de Forbach', 'Herrschaft Forbach', 'Lordship of
    Forbach'), using the seat's German and English names when it is located. A name that
    starts with its own type word ('Prévôté d'Amance', 'Prévôté rurale de Sierck') keeps its
    French and is translated the same way. Any other name that already says what it is is
    kept as it is in every language: translating only its type word gives nonsense."""
    fr = place["name_fr"]
    labels = vocab["place_types"].get(place["place_type"], {})
    if not labels:
        return fr, fr, fr
    de_type = labels["de"].split(" (")[0].split(" / ")[0]
    en_type = labels["en"]
    rest = fr
    if base_name(fr) != fold(fr):  # the name has a type word
        typed = re.match(rf"{re.escape(labels['fr'])}( rurale)? (?:de la |de |d'|du |des )(.+)$", fr, re.I)
        if not typed:
            return fr, fr, fr
        if typed.group(1):
            de_type, en_type = "Land" + de_type.lower(), "rural " + en_type
        rest = typed.group(2)
    seat_de = (seat.name_de if seat else None) or rest
    seat_en = (seat.name_en if seat else None) or rest
    if rest is not fr:
        return fr, f"{de_type} {seat_de}", f"{en_type.capitalize()} of {seat_en}"
    fr_type = labels["fr"][:1].upper() + labels["fr"][1:]
    link = "d'" if fold(fr)[:1] in "aeiouy" else "de "
    return f"{fr_type} {link}{fr}", f"{de_type} {seat_de}", f"{en_type.capitalize()} of {seat_en}"


CONTEXT_KM = 35  # a member this far from its territory's other members is suspect


def apply_placement_rules(results: dict, rules: dict[str, dict]) -> None:
    """Rules for places the databases cannot locate (lost villages):
         place-id: {approximate: other-place-id, note: ...}   placed at that place, like a hamlet at its commune
                                                              (optional name_de, name_en)
         place-id: {unlocated: true, note: ...}               no point at all (site unknown)"""
    for pid, rule in rules.items():
        res = results[pid]
        res.lat = res.lon = res.wikidata_id = res.geonames_id = None
        res.confidence = "low"
        target = results.get(rule.get("approximate", ""))
        if target is not None and target.lat is not None:
            res.lat, res.lon, res.method = target.lat, target.lon, "approximate"
            res.name_de, res.name_en = rule.get("name_de"), rule.get("name_en")
            res.note = rule.get("note") or f"placed at {target.place_id} (rules.yaml)"
        else:
            res.method = "unlocated"
            res.note = rule.get("note") or "site unknown (rules.yaml)"


def refine_with_territories(results: dict, info: dict, memberships: list[dict], items: dict, geonames) -> None:
    """Second pass: the other members of a place's territory give the context the book's
    index sometimes lacks. A place matched without a canton, flagged ambiguous, or lying
    far from its territory is matched again near the territory's centre."""
    reliable = {pid: r for pid, r in results.items() if r.lat is not None and r.confidence != "low"}
    members: dict[str, list[str]] = {}
    parents: dict[str, set[str]] = {}
    for m in memberships:
        members.setdefault(m["parent_id"], []).append(m["child_id"])
        parents.setdefault(m["child_id"], set()).add(m["parent_id"])

    def centre(tid: str, exclude: str):
        if (info.get(tid) or {}).get("place", {}).get("place_type") == "bailiwick":
            return None  # its direct members span the whole region: no useful centre
        pts =[(reliable[c].lat, reliable[c].lon) for c in members.get(tid, []) if c in reliable and c != exclude]
        if len(pts) < 3:
            return None
        lats, lons = sorted(a for a, _ in pts), sorted(b for _, b in pts)
        return lats[len(lats) // 2], lons[len(lons) // 2]  # median: robust to other misplaced members

    changed = flagged = 0
    for pid, res in results.items():
        if res.method == "override":  # placed by hand in rules.yaml
            continue
        centres = [c for t in parents.get(pid, ()) if (c := centre(t, pid))]
        if not centres:  # members of small fiefs: use the territories those fiefs belong to
            centres = [c for t in parents.get(pid, ()) for g in parents.get(t, ()) if (c := centre(g, pid))]
        if not centres:
            continue
        context = (sum(a for a, _ in centres) / len(centres), sum(b for _, b in centres) / len(centres))
        far = res.lat is None or km(context, (res.lat, res.lon)) > CONTEXT_KM
        weak = res.confidence == "low" or "no canton" in res.note or "ambiguous" in res.note
        if not (far or weak):
            continue
        d = info[pid]
        p, row = d["place"], d["row"]
        country = (row or {}).get("country") or p.get("modern_country") or None
        if res.method == "approximate" and far and row and row["canton"]:
            # Placed at the index's commune, but the wrong namesake (Puttelange-lès-Thionville for
            # Puttelange-aux-Lacs): resolve the commune's name near the territory instead.
            it, _, _ = best_candidate({row["canton"]}, items, country, "village", context)
            if it and km(context, (it["lat"], it["lon"])) <= CONTEXT_KM:
                res.lat, res.lon = round(it["lat"], 5), round(it["lon"], 5)
                res.note = f"not in Wikidata/GeoNames; placed at {row['canton']} (index location, resolved near its territory)"
                changed += 1
            continue
        it, conf, note = best_candidate(d["names"], items, country, p["place_type"], context)
        if it and km(context, (it["lat"], it["lon"])) <= CONTEXT_KM and it["qid"] != res.wikidata_id:
            res.lat, res.lon, res.wikidata_id, res.geonames_id = round(it["lat"], 5), round(it["lon"], 5), it["qid"], None
            res.name_de, res.name_en = it["de"], it["en"]
            res.method, res.confidence, res.note = "wikidata", "medium", "chosen near its territory's other members"
            changed += 1
            continue
        e, conf, note = geonames.match(d["names"], country, context)
        if e and (far or res.lat is None):
            res.lat, res.lon, res.geonames_id, res.wikidata_id = round(e["lat"], 5), round(e["lon"], 5), e["geonameid"], None
            res.method, res.confidence = "geonames", "medium" if "exact" in note else "low"
            res.note = f"{note}; chosen near its territory's other members"
            changed += 1
        elif far and res.lat is not None:
            res.confidence = "low"
            res.note = (res.note + "; " if res.note else "") + \
                f"{km(context, (res.lat, res.lon)):.0f} km from its territory's other members"
            flagged += 1
    print(f"territory context: {changed} place(s) re-matched, {flagged} flagged as far from their territory")


def run() -> None:
    vocab = load_vocab(config.CURATED_DIR / "vocab.yaml")
    rules = (yaml.safe_load((config.CURATED_DIR / "rules.yaml").read_text()) or {}).get("geocode") or {}
    b = Builder()
    tables = b.build()
    places = tables["places"]
    resolved = b.places.places
    gaz = b.places.gaz

    # Names to query: each settlement's names plus the canton names used as anchors.
    info: dict[str, dict] = {}
    all_names: set[str] = set()
    for p in places:
        rp = resolved.get(p["id"])
        row = rp.gazetteer if rp and rp.gazetteer else gaz.match(p["name_fr"])
        variants = p["variants"] if isinstance(p["variants"], list) else [v for v in (p["variants"] or "").split("|") if v]
        names = {p["name_fr"], *variants}
        if row:
            names |= {row["name"], *filter(None, row["variants"].split("|"))}
        names = {v for n in names if n and len(n) < 60 for v in name_variants(n)}
        names |= {b for n in list(names) for b in building_names(_PREFIXES.sub("", n), p["place_type"])}
        info[p["id"]] = {"names": names, "row": row, "place": p}
        all_names |= names
        if row and row["canton"]:
            all_names.add(row["canton"])
    print(f"querying Wikidata for {len(all_names)} names ...")
    items = wikidata.lookup(all_names)
    print(f"  {len(items)} candidate items in the region")

    print("loading GeoNames dumps (FR, DE, LU) ...")
    geonames = GeoNames()
    anchors: dict[str, tuple[float, float] | None] = {}

    def anchor_for(row: dict | None) -> tuple[float, float] | None:
        if not row or not row["canton"]:
            return None
        key = (row["canton"], row["country"])
        if key not in anchors:
            it, conf, _ = best_candidate({row["canton"]}, items, row["country"] or None, "village", None)
            if it and conf != "low":
                anchors[key] = (it["lat"], it["lon"])
            else:
                e, conf, _ = geonames.match({row["canton"]}, row["country"] or None, None)
                anchors[key] = (e["lat"], e["lon"]) if e else None
        return anchors[key]

    results: dict[str, Result] = {}
    deferred: dict[str, dict] = {}
    for pid, d in info.items():
        p, row = d["place"], d["row"]
        if p["kind"] != "settlement":
            continue
        res = Result(pid, name_fr=p["name_fr"])
        override = rules.get(pid)
        if override and ("approximate" in override or override.get("unlocated")):
            deferred[pid] = override  # needs the other places' results first
            results[pid] = res
            continue
        if override:
            res.lat, res.lon = override.get("lat"), override.get("lon")
            res.wikidata_id = override.get("wikidata")
            res.method, res.confidence, res.note = "override", "high", override.get("note", "")
            res.name_de, res.name_en = override.get("name_de"), override.get("name_en")
            if res.wikidata_id and res.wikidata_id in items:
                it = items[res.wikidata_id]
                res.lat, res.lon = res.lat or it["lat"], res.lon or it["lon"]
                res.name_de, res.name_en = res.name_de or it["de"], res.name_en or it["en"]
            results[pid] = res
            continue
        country = (row or {}).get("country") or p.get("modern_country") or None
        anchor = anchor_for(row)
        it, conf, note = best_candidate(d["names"], items, country, p["place_type"], anchor)
        if it and "km from" in note:
            # Far from the canton the book gives: a same-named place near the canton wins if GeoNames has one.
            e, g_conf, g_note = geonames.match(d["names"], country, anchor)
            if e:
                it = None
            else:
                conf = "low"
        if it:
            res.lat, res.lon, res.wikidata_id = round(it["lat"], 5), round(it["lon"], 5), it["qid"]
            res.name_de, res.name_en = it["de"], it["en"]
            res.method, res.confidence, res.note = "wikidata", conf, note
        else:
            e, conf, note = geonames.match(d["names"], country, anchor)
            if e:
                res.lat, res.lon, res.geonames_id = round(e["lat"], 5), round(e["lon"], 5), e["geonameid"]
                if "spelling" in note and float(note.rsplit("(", 1)[1].rstrip(")")) < 0.95:
                    conf = "low"
                res.method, res.confidence, res.note = "geonames", conf, note
            elif anchor and any(difflib.SequenceMatcher(None, fold(n), fold(row["canton"])).ratio() >= 0.85
                                for n in d["names"]):
                # The index gives the modern name of the same place: "Siersberg (S., Siersburg)".
                res.lat, res.lon = round(anchor[0], 5), round(anchor[1], 5)
                res.name_de = res.name_en = row["canton"]
                res.method, res.confidence = "index-modern-name", "medium"
                res.note = f"the book's index names it {row['canton']}"
            elif anchor:
                # Hamlets, farms and lost villages: the index names the commune they belong to.
                res.lat, res.lon = round(anchor[0], 5), round(anchor[1], 5)
                res.method, res.confidence = "approximate", "low"
                res.note = f"not in Wikidata/GeoNames; placed at {row['canton']} (index location)"
            else:
                res.note = note
        results[pid] = res

    refine_with_territories(results, info, tables["memberships"], items, geonames)
    apply_placement_rules(results, deferred)

    # Territories: names from type + seat; a point at the seat settlement, else at the centre of
    # the located settlements the memberships put inside it (only used to place labels).
    by_base = {base_name(r.name_fr or ""): r for r in results.values() if r.lat is not None}
    children: dict[str, list[str]] = {}
    for m in tables["memberships"]:
        children.setdefault(m["parent_id"], []).append(m["child_id"])
    for pid, d in info.items():
        p = d["place"]
        if p["kind"] != "territory":
            continue
        seat = by_base.get(base_name(p["name_fr"]))
        # Name from the book, as resolved in Stage 4: the curated row may already carry the
        # names of an earlier geocoding run ('Seigneurie de Forbach'), which must not feed back.
        rp = resolved.get(pid)
        fr, de, en = territory_names({**p, "name_fr": rp.name_fr if rp and not rp.manual else p["name_fr"]}, vocab, seat)
        res = Result(pid, name_fr=fr, name_de=de, name_en=en, method="territory", confidence="medium")
        if seat:
            res.lat, res.lon, res.note = seat.lat, seat.lon, f"seat: {seat.place_id}"
        else:
            pts = [(results[c].lat, results[c].lon) for c in children.get(pid, [])
                   if c in results and results[c].lat is not None and results[c].method != "territory"]
            if pts:
                res.lat = round(sum(a for a, _ in pts) / len(pts), 5)
                res.lon = round(sum(b for _, b in pts) / len(pts), 5)
                res.note = f"centre of {len(pts)} member settlement(s)"
            else:
                res.note = "no seat or located members"
        results[pid] = res

    with OUT_FILE.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in sorted(results.values(), key=lambda r: r.place_id):
            w.writerow({c: ("" if getattr(r, c) is None else getattr(r, c)) for c in COLUMNS})

    settlements = [r for r in results.values() if r.method != "territory"]
    stats = Counter((r.method, r.confidence) for r in settlements)
    located = sum(r.lat is not None for r in settlements)
    print(f"settlements located: {located}/{len(settlements)} ({100 * located / max(1, len(settlements)):.0f}%)")
    for (method, conf), n in sorted(stats.items()):
        print(f"  {method:9} {conf:6} {n}")
    terr = [r for r in results.values() if r.method == "territory"]
    print(f"territories: {len(terr)}, with a label point (seat or member centre): {sum(r.lat is not None for r in terr)}")
