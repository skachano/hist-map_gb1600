import csv

import pytest
from pydantic import ValidationError

from bailliage import config
from bailliage.data import schema, store, validate
from bailliage.data.models import Entity, Event, Membership, Place, Right, parse_pages, share_value

VOCAB = store.load_vocab(config.CURATED_DIR / "vocab.yaml")


def dataset(**tables) -> store.Dataset:
    ds = store.Dataset(vocab=VOCAB)
    for name, rows in tables.items():
        setattr(ds, name, [(i + 2, r) for i, r in enumerate(rows)])
    return ds


def base(**extra):
    """Two places and three entities that the rule tests build on."""
    tables = dict(
        places=[Place(id="p", kind="settlement", name_fr="P", place_type="village"),
                Place(id="t", kind="territory", name_fr="T", place_type="office")],
        entities=[Entity(id=e, name_en=e, name_fr=e, name_de=e, entity_type="duchy") for e in ("a", "b", "c")],
    )
    tables.update(extra)
    return dataset(**tables)


def right(**kw):
    return Right(**{"place_id": "p", "right_type": "high_justice", "holder_id": "a", "source_page": "1", **kw})


def messages(ds, level=None):
    return [i.message for i in validate.validate(ds) if level is None or i.level == level]


# --- parsing -------------------------------------------------------------------

def test_csv_cells_parse_lists_defaults_and_bools():
    r = Right.model_validate({"place_id": "p", "right_type": "high_justice", "holder_id": "a", "share": "",
                              "status": "", "is_disputed": "true", "disputed_with": "b| c", "from_year": "1624",
                              "confidence": "", "source_page": "50-52;13"})
    assert r.status == "held" and r.confidence == "high" and r.share is None
    assert r.is_disputed is True and r.disputed_with == ["b", "c"] and r.from_year == 1624
    assert parse_pages(r.source_page) == [50, 51, 52, 13]


def test_row_level_constraints():
    with pytest.raises(ValidationError):
        right(from_year=1630, to_year=1620)
    with pytest.raises(ValidationError):
        right(share="half")
    with pytest.raises(ValidationError):
        right(from_precision="exact")  # precision without a year
    with pytest.raises(ValidationError):
        Place(id="Bad Id", kind="settlement", name_fr="x", place_type="village")
    assert share_value("1/2") * 2 == 1 and share_value("joint") is None


def test_load_reports_unknown_columns(tmp_path):
    (tmp_path / "vocab.yaml").write_text((config.CURATED_DIR / "vocab.yaml").read_text())
    with (tmp_path / "places.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "kind", "name_fr", "place_type", "colour"])
        w.writerow(["p", "settlement", "P", "village", "red"])
    ds = store.load(tmp_path)
    assert any("unknown columns" in i.message for i in ds.issues)


# --- rules ---------------------------------------------------------------------

def test_clean_base_has_no_issues():
    assert messages(base(rights=[right()])) == []


def test_foreign_keys_and_vocab():
    ds = base(rights=[right(holder_id="nobody", right_type="banvin")])
    msgs = messages(ds, "error")
    assert any("holder_id 'nobody' not found" in m for m in msgs)
    assert any("right_type 'banvin' is not in vocab.right_types" in m for m in msgs)


def test_source_page_required_for_facts():
    ds = base(rights=[Right(place_id="p", right_type="high_justice", holder_id="a")])
    assert "source_page is required for facts" in messages(ds, "error")


def test_handover_year_is_not_an_overlap():
    ds = base(rights=[right(to_year=1624), right(holder_id="b", from_year=1624, status="pledged")])
    assert messages(ds) == []


def test_unexplained_overlap_warns_and_dispute_explains_it():
    ds = base(rights=[right(to_year=1625), right(holder_id="b", from_year=1620)])
    assert any("without shares, a claim or a dispute flag" in m for m in messages(ds, "warning"))
    ds = base(rights=[right(), right(holder_id="b", status="claimed", is_disputed=True, disputed_with=["a"])])
    assert messages(ds) == []


def test_shares_must_not_exceed_whole():
    ok = base(rights=[right(share="1/2"), right(holder_id="b", share="1/2")])
    assert messages(ok) == []
    bad = base(rights=[right(share="1/2"), right(holder_id="b", share="2/3")])
    assert any("add up to 7/6" in m for m in messages(bad, "error"))
    joint = base(rights=[right(share="joint"), right(holder_id="b", share="joint"), right(holder_id="c", share="joint")])
    assert messages(joint) == []


def test_dispute_flags_consistency():
    ds = base(rights=[right(is_disputed=True)])
    assert any("disputed_with is empty" in m for m in messages(ds, "warning"))
    ds = base(rights=[right(is_disputed=True, disputed_with=["a"])])
    assert any("own disputed_with" in m for m in messages(ds, "error"))


def test_membership_cycles_and_direction():
    ds = base(memberships=[Membership(child_id="t", parent_id="p", source_page="1")])
    assert any("territory cannot belong to a settlement" in m for m in messages(ds, "error"))
    ds = base(memberships=[Membership(child_id="t", parent_id="t", source_page="1")])
    assert any("cycle" in m for m in messages(ds, "error"))


def test_events_must_match_rights():
    transfer = Event(year=1624, place_id="p", right_type="high_justice", from_holder="a", to_holder="b",
                     event_type="pledge", description="x", source_page="1")
    ok = base(rights=[right(to_year=1624), right(holder_id="b", from_year=1624, status="pledged")], events=[transfer])
    assert messages(ok) == []
    contradicted = base(rights=[right()], events=[transfer])  # a's row never ends
    assert any("ends around 1624" in m for m in messages(contradicted, "warning"))
    assert any("starts around 1624" in m for m in messages(contradicted, "info"))  # b has no rows at all


def test_periods_outside_app_range_warn():
    ds = base(rights=[right(from_year=1500, to_year=1550)])
    assert any("outside 1600-1632" in m for m in messages(ds, "info"))
    assert messages(ds, "warning") == []


# --- the real curated data and the schema export --------------------------------

def test_curated_dataset_is_valid():
    ds = store.load()
    errors = [str(i) for i in validate.validate(ds) if i.level == "error"]
    assert errors == []
    assert ds.rights, "sample rows are present"


def test_schema_export_injects_vocab_enums(tmp_path):
    paths = schema.export(tmp_path)
    assert len(paths) == 6
    rights = schema.table_schema(Right, VOCAB)
    assert "suzerain" in rights["properties"]["right_type"]["enum"]
    assert {"type": "null"} in rights["properties"]["from_precision"]["anyOf"]


def test_shared_manorial_lordship_is_information_only():
    ds = base(rights=[right(right_type="manorial_lord"), right(right_type="manorial_lord", holder_id="b")])
    assert messages(ds, "warning") == []
    assert any("co-lordship presumed" in m for m in messages(ds, "info"))


def test_event_without_any_rights_rows_is_information():
    transfer = Event(year=1624, place_id="p", right_type="high_justice", from_holder="a", to_holder="b",
                     event_type="pledge", description="x", source_page="1")
    ds = base(events=[transfer])
    assert messages(ds, "warning") == [] and any("no rows for this holder" in m for m in messages(ds, "info"))
