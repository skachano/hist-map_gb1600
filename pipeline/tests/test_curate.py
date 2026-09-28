from collections import Counter

from bailliage.curate import build
from bailliage.curate.resolve import EntityResolver, Gazetteer, PlaceResolver, base_name, fold


def test_page_refs_round_trip():
    assert build.page_ref({12, 13, 14, 49, 52}) == "12-14;49;52"
    assert build.pages_of("p. 49-50") == {49, 50}
    assert build.pages_of("13, 52") == {13, 52}
    assert build.pages_of("49-1200") == {49}  # absurd ranges keep only the start


def test_base_name_strips_articles_and_type_words():
    assert base_name("L'office de Siersberg") == "siersberg"
    assert base_name("la seigneurie de Forbach") == "forbach"
    assert base_name("comté de Sarrewerden") == "sarrewerden"
    assert base_name("Saargau") == "saargau"
    assert fold("Chémery-la-Vieille") == "chemery-la-vieille"


def gazetteer(*rows):
    g = Gazetteer([])
    for name, canton in rows:
        raw = {"name": name, "variants": "", "see": "", "dept_code": "M.", "canton": canton, "pages": "1",
               "raw": f"{name} (M., {canton}) 1"}
        g.rows.append(raw)
        g.by_label[f"{name} (M., {canton})"] = raw
        g.by_name[fold(name)].append(raw)
    return g


def test_place_resolution():
    g = gazetteer(("Anzeling", "Bouzonville"), ("Bizing", "Sierck"), ("Bizing", "Waldwisse"))
    r = PlaceResolver(g, [{"id": "office-sierck", "kind": "territory", "name_fr": "Office de Sierck"}],
                      {}, territory_types={"office", "county"})
    mention = lambda name, kind="settlement", ptype="village", index="": {  # noqa: E731
        "name_in_text": name, "index_name": index, "kind": kind, "place_type": ptype, "other_names": []}
    assert r.resolve(mention("Anzeling", index="Anzeling (M., Bouzonville)")) == "anzeling"
    assert r.resolve(mention("Anzelling")) == "anzeling"                       # OCR slip, close match
    assert r.resolve(mention("Bizing", index="Bizing (M., Sierck)")) == "bizing-sierck"  # shared name
    assert r.resolve(mention("L'office de Sierck", "territory", "office")) == "office-sierck"  # manual place
    assert r.resolve(mention("comté de Bitche", "settlement", "county")) == "county-bitche"   # kind from type
    assert r.places["county-bitche"].kind == "territory"


def test_entity_aliases_follow_chains():
    e = EntityResolver([], {"a": "b", "b": "c"})
    assert e.canonical("a") == "c" and e.canonical("x") == "x"


def _right(holder, frm=None, to=None, status="held"):
    return {"place_id": "p", "right_type": "high_justice", "holder_id": holder, "share": None, "status": status,
            "from_year": frm, "to_year": to, "from_precision": None, "to_precision": None, "pages": {1},
            "is_disputed": False, "disputed_with": set(), "snippet": None, "confidence": "medium", "notes": None}


def _builder_with(rights, events=()):
    b = build.Builder.__new__(build.Builder)
    b.rights = {i: r for i, r in enumerate(rights)}
    b.events = {i: e for i, e in enumerate(events)}
    b.stats, b.dropped = Counter(), Counter()
    return b


def test_events_date_open_ended_rights():
    event = {"year": 1624, "place_id": "p", "right_type": "high_justice", "from_holder": "a", "to_holder": "b"}
    b = _builder_with([_right("a"), _right("b", status="pledged")], [event])
    assert b.date_rights_from_events() == 2
    rows = {r["holder_id"]: r for r in b.rights.values()}
    assert (rows["a"]["to_year"], rows["b"]["from_year"]) == (1624, 1624)


def test_same_holder_overlaps_merge_into_the_dated_row():
    b = _builder_with([_right("a"), _right("a", 1616, 1620)])
    b.rights[0]["pages"], b.rights[1]["pages"] = {49}, {51}
    assert b.merge_same_holder() == 1
    (row,) = b.rights.values()
    assert (row["from_year"], row["to_year"], row["pages"]) == (1616, 1620, {49, 51})
    disjoint = _builder_with([_right("a", 1600, 1605), _right("a", 1620, 1625)])
    assert disjoint.merge_same_holder() == 0 and len(disjoint.rights) == 2


def test_section_scoped_alias_and_domain_merge():
    from bailliage.curate.resolve import preferred_domain_types
    mentions = [{"name_in_text": "Lixheim", "kind": "territory", "place_type": t, "other_names": [], "index_name": ""}
                for t in ("principality", "principality", "office", "lordship")]
    r = PlaceResolver(gazetteer(), [], {"Hombourg": "office-hombourg-haut",
                                        "L1-C06-S09: Hombourg": "lordship-hombourg-sur-canner"},
                      territory_types={"office", "principality", "lordship"},
                      preferred_types=preferred_domain_types(mentions))
    assert {r.resolve(m) for m in mentions} == {"principality-lixheim"}  # office/lordship/principality merged
    hombourg = {"name_in_text": "Hombourg", "kind": "territory", "place_type": "lordship", "other_names": [],
                "index_name": ""}
    assert r.resolve(hombourg, "L1-C06-S05") == "office-hombourg-haut"
    assert r.resolve(hombourg, "L1-C06-S09") == "lordship-hombourg-sur-canner"


def test_membership_years_need_a_transfer_of_the_member():
    b = _builder_with([])
    m = lambda child, frm, to: {"child_id": child, "parent_id": "office", "from_year": frm, "to_year": to,  # noqa: E731
                                "pages": {1}, "confidence": "high"}
    b.memberships = {0: m("sold", 1621, None), 1: m("listed", None, 1606), 2: m("listed", None, None)}
    b.events = {0: {"year": 1621, "place_id": "sold", "event_type": "exchange", "right_type": "suzerain"},
                1: {"year": 1606, "place_id": "office", "event_type": "purchase", "right_type": "suzerain"}}
    b.normalize_memberships()
    rows = {(r["child_id"], r["from_year"], r["to_year"]) for r in b.memberships.values()}
    assert rows == {("sold", 1621, None), ("listed", None, None)}  # the parent's event does not date 'listed'


def test_kind_scoped_alias_leaves_the_village_alone():
    r = PlaceResolver(gazetteer(("Marimont-lès-Albestroff", "Albestroff")), [],
                      {"territory: Marimont-lès-Albestroff": "lordship-marimont"}, territory_types={"office"})
    as_territory = {"name_in_text": "Marimont-lès-Albestroff", "kind": "territory", "place_type": "office",
                    "other_names": [], "index_name": ""}
    as_village = {**as_territory, "kind": "settlement", "place_type": "village"}
    assert r.resolve(as_territory) == "lordship-marimont"
    assert r.resolve(as_village) == "marimont-les-albestroff"
