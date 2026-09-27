"""Look up Wikidata items by exact label (fr/de/en/lb, including alternative labels)
inside the region's bounding box. Responses are cached on disk per query."""
from __future__ import annotations

import hashlib
import json
import re
import time

import requests

from bailliage import config

ENDPOINT = "https://query.wikidata.org/sparql"
HEADERS = {"User-Agent": "hist-map/0.1 (historical atlas research project; python-requests)",
           "Accept": "application/sparql-results+json"}
CACHE_DIR = config.RAW_DIR / "geo_cache" / "wikidata"
LANGS = ("fr", "de", "en", "lb")
# Generous box around the bailliage d'Allemagne and the neighbours the book mentions
# (Moselle, Saarland, Alsace, Palatinate, Luxembourg).
BBOX = {"west": 5.5, "east": 8.4, "south": 48.0, "north": 50.3}
BATCH = 120  # names per query (x4 languages)

COUNTRIES = {"Q142": "FR", "Q183": "DE", "Q32": "LU"}

_QUERY = """
SELECT ?name ?item ?coord ?country ?inst ?fr ?de ?en WHERE {
  VALUES ?name { %s }
  ?item rdfs:label|skos:altLabel ?name ;
        wdt:P625 ?coord .
  FILTER(geof:longitude(?coord) > %f && geof:longitude(?coord) < %f &&
         geof:latitude(?coord) > %f && geof:latitude(?coord) < %f)
  OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?item wdt:P31 ?inst }
  OPTIONAL { ?item rdfs:label ?fr FILTER(lang(?fr) = "fr") }
  OPTIONAL { ?item rdfs:label ?de FILTER(lang(?de) = "de") }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
}
"""


def _literal(name: str, lang: str) -> str:
    return json.dumps(name, ensure_ascii=False) + "@" + lang


def _run(query: str) -> list[dict]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / (hashlib.sha1(query.encode()).hexdigest()[:20] + ".json")
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(5):
        r = requests.post(ENDPOINT, data={"query": query}, headers=HEADERS, timeout=120)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(int(r.headers.get("Retry-After", 10 * (attempt + 1))))
            continue
        r.raise_for_status()
        rows = r.json()["results"]["bindings"]
        path.write_text(json.dumps(rows, ensure_ascii=False))
        time.sleep(1)  # be polite to the public endpoint
        return rows
    r.raise_for_status()
    return []


def lookup(names: set[str]) -> dict[str, dict]:
    """Candidates by Wikidata id: {qid: {qid, lat, lon, country, types, fr, de, en, matched: set(names)}}."""
    items: dict[str, dict] = {}
    ordered = sorted(n for n in names if n and '"' not in n)
    for i in range(0, len(ordered), BATCH):
        chunk = ordered[i:i + BATCH]
        values = " ".join(_literal(n, lang) for n in chunk for lang in LANGS)
        query = _QUERY % (values, BBOX["west"], BBOX["east"], BBOX["south"], BBOX["north"])
        for row in _run(query):
            qid = row["item"]["value"].rsplit("/", 1)[-1]
            lon, lat = map(float, re.findall(r"-?\d+\.?\d*", row["coord"]["value"])[:2])
            item = items.setdefault(qid, {"qid": qid, "lat": lat, "lon": lon, "country": None, "types": set(),
                                          "fr": None, "de": None, "en": None, "matched": set()})
            item["matched"].add(row["name"]["value"])
            if "country" in row:
                item["country"] = COUNTRIES.get(row["country"]["value"].rsplit("/", 1)[-1], item["country"])
            if "inst" in row:
                item["types"].add(row["inst"]["value"].rsplit("/", 1)[-1])
            for lang in ("fr", "de", "en"):
                if lang in row and not item[lang]:
                    item[lang] = row[lang]["value"]
    return items
