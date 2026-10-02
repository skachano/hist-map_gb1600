"""Resolve names from the extraction to stable place and entity ids.

Settlements are identified by their book-index entry (the gazetteer), falling
back to an exact or near-exact name match against the gazetteer, then to the
name itself. Territories are identified by (place type, base name), where the
base name drops articles and type words: "L'office de Siersberg" and "office de
Siersberg" are the same territory, distinct from the castle of Siersberg.
Hand-curated places (data/curated/manual/places.csv) claim matching names first.
"""
from __future__ import annotations

import csv
import difflib
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from bailliage import config
from bailliage.extract.prompt import index_label
from bailliage.text.indexes import DEPARTMENTS

# Leading words that name a territory's type rather than the territory itself.
_TYPE_WORDS = (
    "bailliage", "office", "prevote", "sous-prevote", "grande prevote", "chatellenie", "recette", "mairie",
    "haute-mairie", "cour", "seigneurie", "terre", "terres", "comte", "marquisat", "principaute", "baronnie",
    "fief", "condominium", "vouerie", "avouerie", "ban", "franc-alleu", "domaine", "eveche temporel", "eveche",
    "duche", "electorat", "abbaye", "prieure", "commanderie",
)
_TYPE_RE = re.compile(r"^(?:(?:la|le|les|l)\s+)?(?:" + "|".join(re.escape(w) for w in _TYPE_WORDS)
                      + r")\s+(?:(?:de|du|des|d)\s+)?(?:(?:la|le|les|l)\s+)?")


# One territory is called "office", "seigneurie", "terre", "fief", "comté" or "principauté" of X
# depending on context; these types name the same domain. Nested units (prévôté,
# mairie, cour, ban) stay distinct.
DOMAIN_TYPES = {"office", "lordship", "county", "principality", "castellany", "marquisate", "barony",
                "receivership", "fief"}


# Realms the book names both as a district of the bailiwick ('l'office de Forbach') and as a fief
# ('la seigneurie de Forbach') are split in two when rules.yaml lists them (split_realms): a
# mention goes to one side by its own wording, else by its extracted type.
_ADMIN_WORD = re.compile(r"\b(office|bailliage|chatellenie|recette|receveur|officier)\b")
_FEUDAL_WORD = re.compile(r"\b(seigneurie|seigneur|comte|terre|fief|principaute|prince|marquisat|baronnie)\b")
# Units nested in a split realm keep their own entries ('la mairie de Puttelange').
_NESTED_WORD = re.compile(r"\b(mairie|prevote|cour|ban|sergenterie|vouerie|haute mairie)\b")
ADMIN_DOMAIN_TYPES = {"office", "castellany", "receivership"}


def splits_realm(name: str, place_type: str) -> bool:
    """Whether a mention names a split realm itself, not a unit nested in it."""
    return place_type in DOMAIN_TYPES and not _NESTED_WORD.search(fold(name))


def split_side(name: str, place_type: str) -> str:
    """'admin' or 'feudal': which half of a split realm a mention names."""
    folded = fold(name)
    if _ADMIN_WORD.search(folded):
        return "admin"
    if _FEUDAL_WORD.search(folded):
        return "feudal"
    return "admin" if place_type in ADMIN_DOMAIN_TYPES else "feudal"


def preferred_domain_types(place_mentions) -> dict[str, str]:
    """For each territory base name, the domain type most mentions use ('county' for Bitche)."""
    counts: dict[str, Counter] = defaultdict(Counter)
    for p in place_mentions:
        if p["kind"] == "territory" and p["place_type"] in DOMAIN_TYPES:
            counts[base_name(p["name_in_text"])][p["place_type"]] += 1
    return {base: c.most_common(1)[0][0] for base, c in counts.items()}


def fold(text: str) -> str:
    """Lowercase ASCII with single spaces: 'L'office de Sierck' -> 'l office de sierck'."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9-]+", " ", text).strip()


def slug(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", fold(text))).strip("-")


def base_name(name: str) -> str:
    """Territory name without leading article and type words."""
    folded = fold(name)
    stripped = _TYPE_RE.sub("", folded).strip()
    return stripped or folded


@dataclass
class Gazetteer:
    rows: list[dict]
    by_label: dict[str, dict] = field(default_factory=dict)
    by_name: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))

    @classmethod
    def load(cls) -> "Gazetteer":
        with (config.RAW_DIR / "gazetteer_seed.csv").open(newline="") as f:
            raw_rows = [r for r in csv.DictReader(f) if not r["see"] or r["pages"]]
        rows: list[dict] = []
        g = cls(rows)
        for r in raw_rows:
            # The index repeats some entries with an OCR slip in the canton ("Enchenberg"/"Enchenherg").
            twin = next((x for x in rows if fold(x["name"]) == fold(r["name"]) and x["dept_code"] == r["dept_code"]
                         and difflib.SequenceMatcher(None, fold(x["canton"]), fold(r["canton"])).ratio() >= 0.8), None)
            if twin is None:
                rows.append(r)
                twin = r
            g.by_label[index_label(r)] = twin
            for n in [r["name"], *filter(None, r["variants"].split("|"))]:
                if twin not in g.by_name[fold(n)]:
                    g.by_name[fold(n)].append(twin)
        g.index_equivalents()
        return g

    def index_equivalents(self) -> None:
        """'Bergweiler = Weiler im Loch': the other name finds the entry too, unless it is another
        entry's own name ('Hesser = Teting')."""
        for r in self.rows:
            for n in re.split(r", | et ", r["see"] if r["pages"] else ""):
                if n[:1].isupper() and fold(n) not in self.by_name:
                    self.by_name[fold(n)].append(r)

    def is_shared_name(self, name: str) -> bool:
        return len(self.by_name.get(fold(name), [])) > 1

    def match(self, name: str) -> dict | None:
        """Unique exact name match, else a unique close match (OCR slips like 'Biischdorf')."""
        hits = self.by_name.get(fold(name), [])
        if len(hits) == 1:
            return hits[0]
        if hits:
            return None  # ambiguous: several index entries share this name
        close = difflib.get_close_matches(fold(name), list(self.by_name), n=2, cutoff=0.88)
        if len(close) == 1 and len(self.by_name[close[0]]) == 1:
            return self.by_name[close[0]][0]
        return None


@dataclass
class ResolvedPlace:
    id: str
    kind: str
    name_fr: str
    place_types: Counter = field(default_factory=Counter)
    variants: set[str] = field(default_factory=set)
    gazetteer: dict | None = None
    mentions: int = 0
    manual: bool = False
    spellings: Counter = field(default_factory=Counter)  # how the book writes it, per mention

    @property
    def usual_name(self) -> str:
        """The spelling the book uses most ('Vaudrevange', not the index variant 'Valderfangen'),
        ignoring descriptive mentions such as 'bourg de Siersberg'."""
        plain = Counter({n: c for n, c in self.spellings.items() if n[:1].isupper() and " de " not in n})
        return plain.most_common(1)[0][0] if plain else self.name_fr

    @property
    def place_type(self) -> str:
        return self.place_types.most_common(1)[0][0] if self.place_types else "village"

    @property
    def modern_country(self) -> str | None:
        return DEPARTMENTS.get((self.gazetteer or {}).get("dept_code"), (None, None))[1]


class PlaceResolver:
    def __init__(self, gazetteer: Gazetteer, manual_places: list[dict], aliases: dict[str, str],
                 territory_types: set[str] = frozenset(), preferred_types: dict[str, str] | None = None,
                 splits: dict[str, dict] | None = None):
        self.gaz = gazetteer
        # base name -> {admin: id, feudal: id, admin_type, feudal_type} (rules.yaml split_realms)
        self.splits = {base_name(k): v for k, v in (splits or {}).items()}
        self.territory_types = territory_types  # place types that are always territories
        # base name -> the type most mentions give a "domain" territory (see DOMAIN_TYPES)
        self.preferred_types = preferred_types or {}
        # keys: 'name' or 'SECTION: name' (both folded)
        self.aliases = {": ".join(fold(part) for part in k.split(": ", 1)): v for k, v in aliases.items()}
        self.places: dict[str, ResolvedPlace] = {}
        self._by_key: dict[tuple, str] = {}
        # Hand-curated places claim their names: the full name exactly, the name without its type
        # word only when no other manual place of that kind shares it ('Marquisat de Faulquemont'
        # and 'Seigneurie de Faulquemont' both reduce to 'faulquemont').
        self._manual_full: dict[tuple[str, str], str] = {}
        self._manual_names: dict[tuple[str, str], str] = {}
        claims: dict[tuple[str, str], set[str]] = defaultdict(set)
        for m in manual_places:
            p = ResolvedPlace(m["id"], m["kind"], m["name_fr"], manual=True)
            self.places[p.id] = p
            for n in [m["name_fr"], m.get("name_de"), m.get("name_en"), *(m.get("variants") or "").split("|")]:
                if n:
                    self._manual_full.setdefault((m["kind"], fold(n)), m["id"])  # a shared name: the first row's
                    claims[(m["kind"], base_name(n))].add(m["id"])
        self._manual_names = {key: next(iter(ids)) for key, ids in claims.items() if len(ids) == 1}
    def _gazetteer_id(self, row: dict) -> str:
        pid = slug(row["name"])
        if self.gaz.is_shared_name(row["name"]):  # several places share the name: add the canton
            pid = f"{pid}-{slug(row['canton'] or row['dept_code'] or 'x')}"
        return pid

    def resolve(self, place: dict, section: str | None = None) -> str:
        """Place id for one extracted place mention (dict with name_in_text, index_name, kind, place_type).
        Aliases may be scoped to a book section ('L1-C06-S09: Hombourg') for names that mean
        different places in different parts of the book, or to a kind ('territory: X')."""
        name, kind = place["name_in_text"], place["kind"]
        if place["place_type"] in self.territory_types:
            kind = "territory"  # "comté de La Petite-Pierre" tagged as a settlement
        alias = self.aliases.get(f"{fold(section)}: {fold(name)}") if section else None
        if alias is None:  # 'territory: Marimont-lès-Albestroff' leaves the village of that name alone
            alias = self.aliases.get(f"{kind}: {fold(name)}")
        if alias is None:
            alias = self.aliases.get(fold(name))
        forced_type = None
        if alias is not None:
            pid, row = alias, None
        elif kind == "territory" and base_name(name) in self.splits and splits_realm(name, place["place_type"]):
            split = self.splits[base_name(name)]
            side = split_side(name, place["place_type"])
            pid, forced_type, row = split[side], split[f"{side}_type"], None
        elif kind == "territory":
            base = base_name(name)
            ptype = place["place_type"]
            group = "domain" if ptype in DOMAIN_TYPES else ptype
            id_type = self.preferred_types.get(base, ptype) if group == "domain" else ptype
            pid = self._manual_full.get(("territory", fold(name))) or self._manual_names.get(("territory", base)) \
                or self._by_key.get((group, base)) or f"{slug(id_type)}-{slug(base)}"
            self._by_key[(group, base)] = pid
            row = None
        else:
            row = self.gaz.by_label.get(place.get("index_name") or "") or self.gaz.match(name)
            manual = self._manual_full.get(("settlement", fold(name))) or self._manual_names.get(("settlement", base_name(name)))
            pid = manual or (self._gazetteer_id(row) if row else slug(name))
        p = self.places.get(pid)
        if p is None:
            display = row["name"] if row else re.sub(r"^(?:[Ll][ea]s? |L')", "", name).strip()
            p = self.places[pid] = ResolvedPlace(pid, kind, display[:1].upper() + display[1:], gazetteer=row)
        if not p.manual:
            p.spellings[name] += 1
            p.place_types[forced_type or place["place_type"]] += 1
            p.variants.update(n for n in [name, *place.get("other_names", [])] if fold(n) != fold(p.name_fr))
        p.mentions += 1
        return pid


@dataclass
class ResolvedEntity:
    id: str
    names_fr: Counter = field(default_factory=Counter)
    names_en: Counter = field(default_factory=Counter)
    names_de: Counter = field(default_factory=Counter)
    types: Counter = field(default_factory=Counter)
    manual: dict | None = None


class EntityResolver:
    def __init__(self, manual_entities: list[dict], aliases: dict[str, str]):
        self.aliases = aliases
        self.entities: dict[str, ResolvedEntity] = {}
        for m in manual_entities:
            self.entities[m["id"]] = ResolvedEntity(m["id"], manual=m)

    def canonical(self, eid: str | None) -> str | None:
        seen = set()
        while eid in self.aliases and eid not in seen:  # follow alias chains
            seen.add(eid)
            eid = self.aliases[eid]
        return eid

    def add(self, entity: dict) -> str:
        eid = self.canonical(slug(entity["id"]))
        e = self.entities.setdefault(eid, ResolvedEntity(eid))
        if e.manual is None:
            e.names_fr[entity["name_fr"]] += 1
            e.names_en[entity["name_en"]] += 1
            e.names_de[entity["name_de"]] += 1
            e.types[entity["entity_type"]] += 1
        return eid

    def merge_suggestions(self, usage: Counter, limit: int = 60) -> list[tuple[str, str, float]]:
        """Pairs of ids that look like the same entity (similar names or id stems)."""
        def stem(eid: str) -> str:
            return re.sub(r"^(house|county|lords|family|abbey|duchy|chapter|convent|priory|barons?)-", "", eid)
        items = [(eid, fold(e.names_fr.most_common(1)[0][0] if e.names_fr else eid)) for eid, e in
                 self.entities.items()]
        out = []
        for i, (a, na) in enumerate(items):
            for b, nb in items[i + 1:]:
                if stem(a) == stem(b):
                    score = 1.0
                else:
                    score = difflib.SequenceMatcher(None, base_name(na), base_name(nb)).ratio()
                if score >= 0.85:
                    keep, drop = (a, b) if usage[a] >= usage[b] else (b, a)
                    out.append((drop, keep, round(score, 2)))
        return sorted(out, key=lambda t: -t[2])[:limit]
