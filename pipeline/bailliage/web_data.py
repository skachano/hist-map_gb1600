"""Stage 7: compile the curated dataset into the files the web app loads.

    data/curated/*.csv, vocab.yaml, geocoding.csv   (Stages 2-5)
    data/geometry/*.geojson                         (Stage 6)
        -> web/public/data/meta.json         years, vocabularies (en/fr/de), counts
        -> web/public/data/places.json       names, type, point, parent territories
        -> web/public/data/entities.json     names, type, prominence rank, rulers
        -> web/public/data/rights.json       who held which right where, as year ranges
        -> web/public/data/events.json       ownership changes
        -> web/public/data/territories.geojson, cells.geojson

The output is deterministic (sorted, no timestamps) and compact: short keys and
no empty fields. Year snapshots are computed in the browser.
"""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
from collections import Counter, defaultdict

from bailliage import config
from bailliage.data import store, validate
from bailliage.data.models import YEAR_MAX, YEAR_MIN

OUT_DIR = config.WEB_DATA_DIR
SNIPPET_MAX = 200  # short quotes only (the book is a licensed copy)
SIZE_BUDGET = 2_000_000


def _compact(d: dict) -> dict:
    """Drop None, empty strings/lists and False flags; keys keep their order."""
    return {k: v for k, v in d.items() if v not in (None, "", [], False)}


def _pages(ref: str | None) -> str | None:
    return ref or None


def _dump(name: str, data) -> int:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    (OUT_DIR / name).write_text(text + "\n")
    return len(text.encode())


def build() -> dict[str, int]:
    ds = store.load()
    errors = [i for i in validate.validate(ds) if i.level == "error"]
    if errors:
        raise SystemExit(f"refusing to build web data: {len(errors)} validation error(s); run `make validate`")

    with (config.CURATED_DIR / "geocoding.csv").open(newline="") as f:
        geo = {g["place_id"]: g for g in csv.DictReader(f)}

    rights_by_holder = Counter(r.holder_id for _, r in ds.rights)
    parents = defaultdict(list)
    for _, m in sorted(ds.memberships, key=lambda lm: (lm[1].child_id, lm[1].parent_id, lm[1].from_year or 0)):
        parents[m.child_id].append(_compact({"id": m.parent_id, "from": m.from_year, "to": m.to_year}))

    places = []
    for _, p in sorted(ds.places, key=lambda lp: lp[1].id):
        g = geo.get(p.id, {})
        places.append(_compact({
            "id": p.id, "kind": p.kind, "type": p.place_type,
            "name": _compact({"fr": p.name_fr, "de": p.name_de, "en": p.name_en}),
            "variants": sorted(p.variants),
            "lat": p.lat, "lon": p.lon,
            # how sure the point is: high / medium / low; "approximate" = placed at its commune
            "geo": g.get("confidence") if p.lat is not None else None,
            "approx": g.get("method") == "approximate",
            "wd": p.wikidata_id, "country": p.modern_country,
            "parents": parents.get(p.id, []),
            "pages": _pages(p.source_page),
        }))

    rulers = defaultdict(list)
    for _, r in sorted(ds.rulers, key=lambda lr: (lr[1].entity_id, lr[1].from_year or 0, lr[1].person_name)):
        rulers[r.entity_id].append(_compact({
            "name": r.person_name, "title": r.title, "from": r.from_year, "to": r.to_year,
            "fp": r.from_precision, "tp": r.to_precision, "pages": _pages(r.source_page),
        }))
    ranked = sorted((e for _, e in ds.entities), key=lambda e: (-rights_by_holder[e.id], e.id))
    entities = [_compact({
        "id": e.id, "type": e.entity_type,
        "name": _compact({"en": e.name_en, "fr": e.name_fr, "de": e.name_de}),
        "rank": rank, "rights": rights_by_holder[e.id], "rulers": rulers.get(e.id, []),
    }) for rank, e in enumerate(ranked, start=1)]
    entities.sort(key=lambda e: e["id"])

    rights = [_compact({
        "place": r.place_id, "right": r.right_type, "holder": r.holder_id,
        "share": r.share, "status": None if r.status == "held" else r.status,
        "disputed": r.is_disputed, "against": sorted(r.disputed_with),
        "from": r.from_year, "to": r.to_year, "fp": r.from_precision, "tp": r.to_precision,
        "conf": None if r.confidence == "high" else r.confidence,
        "pages": _pages(r.source_page),
        "quote": (r.snippet or "")[:SNIPPET_MAX], "note": r.notes,
    }) for _, r in sorted(ds.rights, key=lambda lr: (lr[1].place_id, lr[1].right_type, lr[1].from_year or 0,
                                                     lr[1].holder_id))]

    events = [_compact({
        "year": e.year, "place": e.place_id, "right": e.right_type, "from": e.from_holder, "to": e.to_holder,
        "type": e.event_type, "text": e.description, "conf": None if e.confidence == "high" else e.confidence,
        "pages": _pages(e.source_page),
    }) for _, e in sorted(ds.events, key=lambda le: (le[1].year, le[1].place_id, le[1].event_type))]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sizes = {
        "places.json": _dump("places.json", places),
        "entities.json": _dump("entities.json", entities),
        "rights.json": _dump("rights.json", rights),
        "events.json": _dump("events.json", events),
    }
    for name in ("territories.geojson", "cells.geojson"):
        shutil.copyfile(config.DATA_DIR / "geometry" / name, OUT_DIR / name)
        sizes[name] = (OUT_DIR / name).stat().st_size

    digest = hashlib.sha256()
    for name in sorted(sizes):
        digest.update((OUT_DIR / name).read_bytes())
    meta = {
        "yearMin": YEAR_MIN, "yearMax": YEAR_MAX,
        "source": "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632, Sarreguemines, 1961",
        "version": digest.hexdigest()[:12],  # changes whenever any data file changes
        "counts": {"places": len(places), "entities": len(entities), "rights": len(rights), "events": len(events),
                   "territoryVersions": _count_features(OUT_DIR / "territories.geojson")},
        "vocab": {name: {k: {lang: v[lang] for lang in ("en", "fr", "de")} | ({"core": True} if v.get("core") else {})
                         | ({"desc": {lang: v["desc"][lang] for lang in ("en", "fr", "de")}} if v.get("desc") else {})
                         for k, v in terms.items()}
                  for name, terms in ds.vocab.items()},
    }
    sizes["meta.json"] = _dump("meta.json", meta)
    return sizes


def _count_features(path) -> int:
    return len(json.loads(path.read_text())["features"])


def run() -> None:
    sizes = build()
    total = sum(sizes.values())
    for name, size in sorted(sizes.items()):
        print(f"  {name:22} {size / 1000:8.1f} kB")
    print(f"web data: {total / 1e6:.2f} MB in {config.WEB_DATA_DIR.relative_to(config.ROOT)}"
          + ("" if total <= SIZE_BUDGET else f"  (over the {SIZE_BUDGET / 1e6:.0f} MB budget)"))
