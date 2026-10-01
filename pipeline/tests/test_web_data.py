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
        ("duchy-lorraine", None, None, 1615), ("andre-des-bordes", None, 1616, 1623),  # sold in 1616 (p. 25)
        ("henriette-vaudemont", "pledged", 1624, None)}
    saargau = {(r["holder"], r.get("share")) for r in rights if r["place"] == "saargau" and r["right"] == "suzerain"}
    assert saargau == {("duchy-lorraine", "1/2"), ("electorate-trier", "1/2")}
    meta = built["load"]("meta.json")
    high = dict(meta["vocab"]["right_types"]["high_justice"])
    desc = high.pop("desc")
    assert high == {"en": "High justice", "fr": "Haute justice", "de": "Hochgerichtsbarkeit", "ja": "上級裁判権",
                    "core": True}
    assert set(desc) == {"en", "fr", "de", "ja"} and "gallows" in desc["en"]
    assert all(set(v.get("desc", {})) == {"en", "fr", "de", "ja"} for v in meta["vocab"]["right_types"].values())
    lorraine = next(e for e in built["load"]("entities.json") if e["id"] == "duchy-lorraine")
    assert lorraine["rank"] == 1 and any(r["name"]["fr"] == "Henri II" for r in lorraine["rulers"])


def test_rulers_translated(built):
    """Every ruler's name and title has German, English and Japanese translations
    (data/curated/ruler_names.csv, ruler_titles.csv)."""
    rulers = [r for e in built["load"]("entities.json") for r in e.get("rulers", [])]
    for field in ("name", "title"):
        values = [r[field] for r in rulers if r.get(field)]
        missing = [v["fr"] for v in values if not all(v.get(lang) for lang in ("de", "en", "ja"))]
        assert values and not missing, (field, missing)
    duke = next(r for e in built["load"]("entities.json") if e["id"] == "duchy-lorraine"
                for r in e["rulers"] if r["name"]["fr"] == "Henri II")
    assert duke["name"]["de"] == "Heinrich II." and duke["title"] == {"fr": "duc", "de": "Herzog", "en": "Duke", "ja": "公"}


def test_ruler_dates_from_notes():
    """The source of a ruler's dates is read from the note written with reference-work reign dates."""
    assert web_data.ruler_dates("reign 1576–1612 from standard references; the book attests 1609–1609") == \
        {"reign": "1576–1612", "book": "1609"}
    assert web_data.ruler_dates("x; reign 1607–1623 from reference works: born 1575; died 1623; the book gives 1578-1623") == \
        {"reign": "1607–1623", "book": "1578–1623", "contradicts": True, "why": "born 1575; died 1623"}
    assert web_data.ruler_dates("reign 1569–1592 from standard references; the book attests …–…") == {"reign": "1569–1592"}
    assert web_data.ruler_dates("died 14 May 1608") is None and web_data.ruler_dates(None) is None


def test_rulers_show_where_their_dates_come_from(built):
    rulers = {r["name"]["fr"]: r for e in built["load"]("entities.json") for r in e.get("rulers", [])}
    assert rulers["Rodolphe II"]["dates"] == {"reign": "1576–1612", "book": "1609"}
    assert rulers["Frédéric, rhingrave de Daun"]["dates"]["book"] == "1547–1610"
    assert "dates" not in rulers["Henri II"]  # exact dates from the book itself
