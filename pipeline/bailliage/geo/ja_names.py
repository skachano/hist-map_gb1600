"""Japanese names (optional fourth language of the web app).

- settlements: the Japanese Wikidata label of their item, when there is one;
- territories: the seat's Japanese name (else its French name) followed by the type, the
  Japanese order ('シエルク管区' for the Office of Sierck);
- data/curated/manual/names_ja.csv wins over both (holders, the bailiwick, corrections).
Output: data/curated/names_ja.csv (id, name_ja, source), read by `make build-data`.
Places and holders without a Japanese name keep their French or English one in the app."""
from __future__ import annotations

import csv
import re

import yaml

from bailliage import config
from bailliage.curate.resolve import fold
from bailliage.geo import wikidata

OUT_FILE = config.CURATED_DIR / "names_ja.csv"
MANUAL_FILE = config.CURATED_DIR / "manual" / "names_ja.csv"
BATCH = 200

_QUERY = """
SELECT ?item ?ja WHERE {
  VALUES ?item { %s }
  ?item rdfs:label ?ja FILTER(lang(?ja) = "ja")
}
"""


def wikidata_labels(qids: set[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    ordered = sorted(qids)
    for i in range(0, len(ordered), BATCH):
        values = " ".join(f"wd:{q}" for q in ordered[i:i + BATCH])
        for row in wikidata._run(_QUERY % values):
            out[row["item"]["value"].rsplit("/", 1)[-1]] = row["ja"]["value"]
    return out


def plain_label(label: str) -> str:
    """Wikidata's Japanese labels carry disambiguators: 'イリンゲン (ザールラント)' -> 'イリンゲン',
    'ディリンゲン/ザール' -> 'ディリンゲン'."""
    return re.split(r"\s*[（(/]", label)[0].strip()


def type_suffix(labels: dict) -> str:
    """'管区（アムト）' -> '管区': the short form to put after a name."""
    return re.split(r"[（(]", labels.get("ja", ""))[0].strip()


def territory_name(seat_ja: str | None, row: dict, labels: dict, by_name: dict[str, str]) -> str | None:
    """`by_name`: Japanese names of settlements by their folded French name, for territories
    without a recorded seat ('Prévôté rurale de Sierck' -> Sierck)."""
    suffix = type_suffix(labels)
    if not suffix:
        return None
    if " rurale " in row["name_fr"]:
        suffix = "農村" + suffix  # Prévôté rurale de Sierck
    # The French name without its type word ('Seigneurie de Kingertal' -> 'Kingertal').
    base = re.sub(r"^(?:\S+(?: rurale)? (?:de la |de |d'|du |des ))", "", row["name_fr"])
    seat_ja = seat_ja or by_name.get(fold(base))
    return f"{seat_ja}{suffix}" if seat_ja else f"{base} {suffix}"


def run() -> None:
    vocab = yaml.safe_load((config.CURATED_DIR / "vocab.yaml").read_text())["place_types"]
    with (config.CURATED_DIR / "places.csv").open(newline="") as f:
        places = {p["id"]: p for p in csv.DictReader(f)}
    with (config.CURATED_DIR / "geocoding.csv").open(newline="") as f:
        geo = {g["place_id"]: g for g in csv.DictReader(f)}

    manual: dict[str, str] = {}
    if MANUAL_FILE.exists():
        with MANUAL_FILE.open(newline="") as f:
            manual = {m["id"]: m["name_ja"] for m in csv.DictReader(f)}

    qids = {p["wikidata_id"] for p in places.values() if p["kind"] == "settlement" and p["wikidata_id"]}
    labels = wikidata_labels(qids)
    names: dict[str, tuple[str, str]] = {}
    for pid, p in places.items():
        if p["kind"] == "settlement" and labels.get(p["wikidata_id"]):
            names[pid] = (plain_label(labels[p["wikidata_id"]]), "wikidata")
    # Hand-written settlement names first: territories take their seat's name.
    names |= {pid: (n, "manual") for pid, n in manual.items() if places.get(pid, {}).get("kind") == "settlement"}
    by_name = {fold(places[pid]["name_fr"]): n for pid, (n, _) in names.items() if pid in places}
    for pid, p in places.items():
        if p["kind"] != "territory":
            continue
        seat = re.match(r"seat: (\S+)", geo.get(pid, {}).get("note", ""))
        seat_ja = names.get(seat.group(1), (None,))[0] if seat else None
        name = territory_name(seat_ja, p, vocab.get(p["place_type"], {}), by_name)
        if name:
            names[pid] = (name, "french + type" if " " in name else "seat + type")
    names |= {pid: (n, "manual") for pid, n in manual.items()}

    with OUT_FILE.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name_ja", "source"])
        for pid in sorted(names):
            w.writerow([pid, *names[pid]])
    settled = sum(1 for p in places.values() if p["kind"] == "settlement")
    print(f"wrote {OUT_FILE.relative_to(config.ROOT)}: {len(names)} names; "
          f"{len(labels)}/{len(qids)} Wikidata items have a Japanese label "
          f"({sum(1 for pid, (_, s) in names.items() if s == 'wikidata')}/{settled} settlements)")
