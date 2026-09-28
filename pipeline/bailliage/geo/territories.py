"""Territory areas derived from settlement points (Stage 6).

1. Each located settlement gets a Voronoi cell (the area nearer to it than to any
   other settlement), clipped to CLIP_KM around the settlements, so outlying
   villages do not claim empty land.
2. A territory's area in a given year is the union of the cells of the settlements
   it contains that year, following memberships down through sub-territories
   (village -> prévôté -> office -> bailliage).
3. Years with the same member set share one geometry version, so the output has a
   version only where membership changes (e.g. Lixheim 1623, Sarrewerden 1629).

These areas are approximations: the book gives members, not boundaries.

Output: data/geometry/cells.geojson (one cell per settlement point) and
data/geometry/territories.geojson (versions with from_year/to_year).
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict

import shapely
from pyproj import Transformer
from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.ops import transform, unary_union

from bailliage import config
from bailliage.data import store

OUT_DIR = config.DATA_DIR / "geometry"
YEARS = range(1600, 1633)
CLIP_KM = 6.0          # how far a settlement's cell may reach
SIMPLIFY_M = 80        # geometry simplification tolerance
PRECISION = 5          # decimal places in output coordinates (~1 m)
CONFIDENCE_RANK = {"high": 0, "medium": 1, "low": 2}

_to_metric = Transformer.from_crs("EPSG:4326", "EPSG:3035", always_xy=True).transform
_to_lonlat = Transformer.from_crs("EPSG:3035", "EPSG:4326", always_xy=True).transform


def _round(geom):
    return shapely.set_precision(geom, 10 ** -PRECISION)


def settlement_cells(places: list, placed_elsewhere: set[str] = frozenset()) -> tuple[dict[str, object], dict[str, list[str]]]:
    """Voronoi cells in metres, keyed by the place that owns the point; places placed
    at the same point (hamlets placed at their commune) share their commune's cell, and
    the commune owns it: `placed_elsewhere` (approximate places) never own a shared cell."""
    by_point: dict[tuple[float, float], list] = defaultdict(list)
    for p in places:
        by_point[(round(p.lon, 5), round(p.lat, 5))].append(p)
    owners, points = [], []
    shared: dict[str, list[str]] = {}
    for (lon, lat), group in by_point.items():
        group.sort(key=lambda p: (p.id in placed_elsewhere, CONFIDENCE_RANK.get(p.confidence or "high", 0), p.id))
        owner = group[0]
        owners.append(owner.id)
        shared[owner.id] = [p.id for p in group[1:]]
        points.append(Point(_to_metric(lon, lat)))
    multipoint = MultiPoint(points)
    region = unary_union([pt.buffer(CLIP_KM * 1000, 24) for pt in points])
    cells = shapely.voronoi_polygons(multipoint, extend_to=region.envelope, ordered=True)
    return ({pid: cell.intersection(region) for pid, cell in zip(owners, cells.geoms)}, shared)


def attach_to_cells(cells: dict[str, object], shared: dict[str, list[str]], places: list) -> dict[str, str]:
    """Places that add no land get no cell of their own (it would be a hole in the territory
    around them): each joins the cell its point falls in, like a hamlet placed at its commune.
    Returns {place id: owner of its cell}."""
    cell_of = {}
    for p in places:
        pt = Point(_to_metric(p.lon, p.lat))
        owner = next((pid for pid, cell in cells.items() if cell.contains(pt)), None)
        if owner is not None:
            cell_of[p.id] = owner
            shared.setdefault(owner, []).append(p.id)
    return cell_of


def excluded_from_areas(geocoding_rows) -> set[str]:
    """Places whose point must not add land to territory areas:
    - placed approximately at their commune (a lost village such as Dittlingen, placed at
      Bousbach, would otherwise pull the whole commune of Bousbach into the lordship of Forbach);
    - flagged far from their territory's other members (probably mislocated);
    - matched only by a doubtful spelling (the lost Ruchling was matched to Rouhling).
    They remain members (lists, panels) and keep their point on the map."""
    return {g["place_id"] for g in geocoding_rows
            if g["method"] == "approximate"
            or (g["confidence"] == "low" and "from its territory" in g["note"])
            or (g["confidence"] == "low" and "spelling match" in g["note"])}


def members_by_year(memberships: list, settlements: set[str]) -> dict[int, dict[str, frozenset[str]]]:
    """{year: {territory id: settlements inside it that year}}."""
    out = {}
    for year in YEARS:
        children = defaultdict(set)
        for m in memberships:
            if (m.from_year or 0) <= year <= (m.to_year or 9999):
                children[m.parent_id].add(m.child_id)

        def descend(tid: str) -> frozenset[str]:
            # Breadth-first, per territory: a memo shared across territories would cache
            # results cut short by membership cycles.
            found, seen, queue = set(), {tid}, [tid]
            while queue:
                for child in children.get(queue.pop(), ()):
                    if child in settlements:
                        found.add(child)
                    elif child not in seen:
                        seen.add(child)
                        queue.append(child)
            return frozenset(found)

        out[year] = {tid: descend(tid) for tid in children}
    return out


def _feature(geom, props: dict) -> dict:
    geom = _round(transform(_to_lonlat, geom.simplify(SIMPLIFY_M)))
    return {"type": "Feature", "properties": props, "geometry": mapping(geom)}


def run() -> None:
    ds = store.load()
    places = {p.id: p for _, p in ds.places}
    located = [p for p in places.values() if p.kind == "settlement" and p.lat is not None]
    with (config.CURATED_DIR / "geocoding.csv").open(newline="") as f:
        rows = list(csv.DictReader(f))
    approximate = {g["place_id"] for g in rows if g["method"] == "approximate"}
    no_land = excluded_from_areas(rows)
    cells, shared = settlement_cells([p for p in located if p.id not in no_land], approximate)
    cell_of = {pid: pid for pid in cells}
    for owner, others in shared.items():
        for o in others:
            cell_of[o] = owner
    cell_of |= attach_to_cells(cells, shared, [p for p in located if p.id in no_land])

    by_year = members_by_year([m for _, m in ds.memberships], {p.id for p in located} - no_land)
    territories = [p for p in places.values() if p.kind == "territory"]
    features, empty = [], []
    for t in sorted(territories, key=lambda t: t.id):
        versions: list[tuple[int, int, frozenset[str]]] = []
        for year in YEARS:
            members = by_year[year].get(t.id, frozenset())
            if versions and versions[-1][2] == members:
                versions[-1] = (versions[-1][0], year, members)
            else:
                versions.append((year, year, members))
        versions = [v for v in versions if v[2]]
        if not versions:
            empty.append(t.id)
            continue
        for start, end, members in versions:
            geom = unary_union([cells[cell_of[m]] for m in {cell_of[m] for m in members}])
            features.append(_feature(geom, {"id": t.id, "from_year": start, "to_year": end,
                                            "settlements": len(members), "place_type": t.place_type}))

    cell_features = [_feature(geom, {"id": pid, "also": shared.get(pid, [])}) for pid, geom in sorted(cells.items())]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, feats in (("cells", cell_features), ("territories", features)):
        path = OUT_DIR / f"{name}.geojson"
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False,
                                   separators=(",", ":")))
        print(f"wrote {path.relative_to(config.ROOT)}: {len(feats)} features, {path.stat().st_size / 1e6:.1f} MB")
    multi = sum(1 for tid in {f["properties"]["id"] for f in features}
                if sum(f["properties"]["id"] == tid for f in features) > 1)
    print(f"territories with an area: {len({f['properties']['id'] for f in features})}/{len(territories)} "
          f"({multi} change shape during 1600-1632); without located members: {len(empty)}")


def preview(year: int, ids: list[str], path) -> None:
    """PNG of cells plus the given territories in `year` (for checking by eye)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cells = json.loads((OUT_DIR / "cells.geojson").read_text())["features"]
    terr = [f for f in json.loads((OUT_DIR / "territories.geojson").read_text())["features"]
            if f["properties"]["id"] in ids and f["properties"]["from_year"] <= year <= f["properties"]["to_year"]]
    fig, ax = plt.subplots(figsize=(9, 9))
    for f in cells:
        g = shape(f["geometry"])
        for poly in getattr(g, "geoms", [g]):
            ax.plot(*poly.exterior.xy, color="#cccccc", linewidth=0.3)
    colors = plt.get_cmap("tab20")
    for i, f in enumerate(terr):
        g = shape(f["geometry"])
        for poly in getattr(g, "geoms", [g]):
            ax.fill(*poly.exterior.xy, color=colors(i % 20), alpha=0.55, linewidth=0)
        c = g.representative_point()
        ax.annotate(f["properties"]["id"], (c.x, c.y), fontsize=6, ha="center")
    ax.set_title(f"{year}")
    ax.set_aspect(1 / 0.66)
    fig.savefig(path, dpi=110, bbox_inches="tight")
