"""Stage 7: the web data built from the committed curated dataset."""
import json

import pytest

from bailliage import web_data


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("web")
    original = web_data.OUT_DIR
    web_data.OUT_DIR = out
    try:
        sizes = web_data.build()
        first = {name: (out / name).read_bytes() for name in sizes}
        web_data.build()
        second = {name: (out / name).read_bytes() for name in sizes}
    finally:
        web_data.OUT_DIR = original
    load = lambda name: json.loads(first[name])  # noqa: E731
    return {"sizes": sizes, "first": first, "second": second, "load": load}


def test_build_is_deterministic_and_small(built):
    assert built["first"] == built["second"]
    assert sum(built["sizes"].values()) <= web_data.SIZE_BUDGET


def test_references_resolve(built):
    load = built["load"]
    places = {p["id"] for p in load("places.json")}
    entities = {e["id"] for e in load("entities.json")}
    for r in load("rights.json"):
        assert r["place"] in places and r["holder"] in entities
        assert set(r.get("against", [])) <= entities
    for e in load("events.json"):
        assert e["place"] in places
        assert {e.get("from"), e.get("to")} - {None} <= entities
    for p in load("places.json"):
        assert {x["id"] for x in p.get("parents", [])} <= places


def test_rows_are_compact(built):
    for name in ("places.json", "rights.json", "events.json", "entities.json"):
        for row in built["load"](name):
            assert all(v not in (None, "", [], False) for v in row.values()), (name, row)


def test_known_facts_survive(built):
    rights = built["load"]("rights.json")
    anzeling = [r for r in rights if r["place"] == "anzeling" and r["right"] == "high_justice"]
    assert {(r["holder"], r.get("status"), r.get("from"), r.get("to")) for r in anzeling} == {
        ("duchy-lorraine", None, None, 1624), ("henriette-vaudemont", "pledged", 1624, None)}
    saargau = {(r["holder"], r.get("share")) for r in rights if r["place"] == "saargau" and r["right"] == "suzerain"}
    assert saargau == {("duchy-lorraine", "1/2"), ("electorate-trier", "1/2")}
    meta = built["load"]("meta.json")
    assert meta["vocab"]["right_types"]["high_justice"] == {
        "en": "High justice", "fr": "Haute justice", "de": "Hochgerichtsbarkeit", "core": True}
    lorraine = next(e for e in built["load"]("entities.json") if e["id"] == "duchy-lorraine")
    assert lorraine["rank"] == 1 and any(r["name"] == "Henri II" for r in lorraine["rulers"])
