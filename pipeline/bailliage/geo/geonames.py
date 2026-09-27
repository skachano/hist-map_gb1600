"""GeoNames fallback: populated places (and castles, abbeys) from the free country
dumps, for names Wikidata does not carry, matched exactly or by close spelling
('Brouderdorf' -> 'Brouderdorff') near the canton the book gives."""
from __future__ import annotations

import csv
import difflib
import io
import math
import zipfile
from collections import defaultdict

import requests

from bailliage import config
from bailliage.curate.resolve import fold
from bailliage.geo.wikidata import BBOX, HEADERS

DUMP_DIR = config.RAW_DIR / "geo_cache" / "geonames"
COUNTRIES = ("FR", "DE", "LU")
FEATURES = {("P", None), ("S", "CSTL"), ("S", "MSTY"), ("S", "ABBY"), ("L", "LCTY"), ("S", "RUIN")}
FUZZY_CUTOFF = 0.92
FUZZY_MAX_KM = 25


def _download(country: str) -> bytes:
    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    path = DUMP_DIR / f"{country}.zip"
    if not path.exists():
        r = requests.get(f"https://download.geonames.org/export/dump/{country}.zip", headers=HEADERS, timeout=300)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path.read_bytes()


def _km(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


class GeoNames:
    def __init__(self):
        self.entries: list[dict] = []
        self.by_name: dict[str, list[dict]] = defaultdict(list)
        for country in COUNTRIES:
            with zipfile.ZipFile(io.BytesIO(_download(country))) as z:
                text = io.TextIOWrapper(z.open(f"{country}.txt"), encoding="utf-8")
                for row in csv.reader(text, delimiter="\t", quoting=csv.QUOTE_NONE):
                    lat, lon = float(row[4]), float(row[5])
                    if not (BBOX["south"] < lat < BBOX["north"] and BBOX["west"] < lon < BBOX["east"]):
                        continue
                    if (row[6], None) not in FEATURES and (row[6], row[7]) not in FEATURES:
                        continue
                    names = {row[1], row[2], *filter(None, row[3].split(","))}
                    e = {"geonameid": int(row[0]), "name": row[1], "lat": lat, "lon": lon, "country": country,
                         "feature": f"{row[6]}.{row[7]}", "names": {fold(n) for n in names if n}}
                    self.entries.append(e)
                    for n in e["names"]:
                        self.by_name[n].append(e)

    def match(self, names: set[str], country: str | None, anchor: tuple[float, float] | None):
        """(entry, confidence, note) or (None, 'low', reason)."""
        folded = {fold(n) for n in names if n}

        def usable(e):
            return (not country or e["country"] == country) and \
                (anchor is None or _km(anchor, (e["lat"], e["lon"])) <= FUZZY_MAX_KM)

        exact = [e for n in folded for e in self.by_name.get(n, []) if usable(e)]
        if exact:
            exact.sort(key=lambda e: (e["feature"] != "P.PPL" and not e["feature"].startswith("P."),
                                      _km(anchor, (e["lat"], e["lon"])) if anchor else 0))
            return exact[0], ("high" if anchor else "medium"), "geonames exact"
        if anchor is None:
            return None, "low", "no candidate (and no canton for a fuzzy search)"
        near = [e for e in self.entries if usable(e)]
        best, best_ratio = None, 0.0
        squash = lambda t: t.replace(" ", "").replace("-", "")  # noqa: E731  "Blies Schweyen" = "Blieschweyen"
        for e in near:
            for n in e["names"]:
                for q in folded:
                    if not q or not n or q[0] != n[0]:  # 'Ackerbach' is not 'Kerbach'
                        continue
                    ratio = difflib.SequenceMatcher(None, squash(q), squash(n)).ratio()
                    if ratio > best_ratio:
                        best, best_ratio = e, ratio
        if best and best_ratio >= FUZZY_CUTOFF:
            return best, "medium", f"geonames spelling match {best['name']} ({best_ratio:.2f})"
        return None, "low", "no candidate"
