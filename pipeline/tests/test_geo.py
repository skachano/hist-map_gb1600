"""Offline tests for Stage 5 (no network)."""
from bailliage.curate.resolve import fold
from bailliage.geo import geocode
from bailliage.geo.geonames import GeoNames


def test_name_variants_split_qualifiers():
    assert {"Stat-lès-Besseringen", "Stat"} <= geocode.name_variants("Stat-lès-Besseringen")
    assert {"Bruch", "Marienfloss"} <= geocode.name_variants("Bruch alias Marienfloss")
    assert "Siersberg" in geocode.name_variants("bourg de Siersberg")
    assert {"St. Arnual", "Sankt Arnual"} <= geocode.name_variants("Saint-Arnual")
    assert "Burg Montclair" in geocode.building_names("Montclair", "castle")


def item(qid, lat, lon, types, country="FR", matched=("X",), fr=None):
    return {"qid": qid, "lat": lat, "lon": lon, "types": set(types), "country": country,
            "matched": set(matched), "fr": fr, "de": None, "en": None}


def test_candidate_scoring_prefers_communes_and_rejects_stations():
    station = item("Q1", 49.26, 6.46, {"Q55488"}, matched={"Anzeling"}, fr="Anzeling")
    commune = item("Q2", 49.26, 6.47, {"Q484170"}, matched={"Anzeling"}, fr="Anzeling")
    best, conf, _ = geocode.best_candidate({"Anzeling"}, {"Q1": station, "Q2": commune}, "FR", "village", None)
    assert best["qid"] == "Q2"
    assert geocode.score(station, {"Anzeling"}, "FR", "village") is None
    assert geocode.score(commune, {"Anzeling"}, "DE", "village") is None  # wrong country


def test_anchor_ranks_and_flags_distant_matches():
    near = item("Q1", 49.36, 6.67, {"Q253019"}, "DE", {"Büren"})
    far = item("Q2", 49.60, 6.90, {"Q253019"}, "DE", {"Büren"})
    siersburg = (49.3686, 6.6786)
    best, conf, note = geocode.best_candidate({"Büren"}, {"Q1": near, "Q2": far}, "DE", "village", siersburg)
    assert best["qid"] == "Q1" and conf == "high"
    best, conf, note = geocode.best_candidate({"Büren"}, {"Q2": far}, "DE", "village", siersburg)
    assert best["qid"] == "Q2" and "km from" in note
    both = geocode.best_candidate({"Büren"}, {"Q1": near, "Q2": far}, "DE", "village", None)
    assert both[1] == "low" and "ambiguous" in both[2]


def test_territory_names_from_type_and_seat():
    vocab = {"place_types": {"office": {"en": "office", "fr": "office", "de": "Amt"}}}
    seat = geocode.Result("sierck", name_fr="Sierck", name_de="Sierck", name_en="Sierck")
    fr, de, en = geocode.territory_names({"place_type": "office", "name_fr": "Office de Sierck"}, vocab, seat)
    assert (fr, de, en) == ("Office de Sierck", "Amt Sierck", "Office of Sierck")


def fake_geonames(*entries):
    g = GeoNames.__new__(GeoNames)
    g.entries, g.by_name = [], {}
    for gid, name, lat, lon in entries:
        e = {"geonameid": gid, "name": name, "lat": lat, "lon": lon, "country": "FR", "feature": "P.PPL",
             "names": {fold(name)}}
        g.entries.append(e)
        g.by_name.setdefault(fold(name), []).append(e)
    return g


def test_geonames_fuzzy_rules():
    g = fake_geonames((1, "Brouderdorff", 48.70, 7.10), (2, "Kerbach", 49.17, 6.96), (3, "Blies Schweyen", 49.14, 7.13))
    anchor = (48.73, 7.05)
    e, conf, note = g.match({"Brouderdorf"}, "FR", anchor)
    assert e["geonameid"] == 1 and "spelling" in note
    assert g.match({"Ackerbach"}, "FR", (49.17, 6.96))[0] is None  # different first letter
    assert g.match({"Blieschweyen"}, "FR", (49.14, 7.13))[0]["geonameid"] == 3  # spaces ignored
    assert g.match({"Brouderdorf"}, "FR", None)[0] is None  # no fuzzy search without an anchor


def test_members_by_year_follow_chains_and_dates():
    from types import SimpleNamespace as NS
    from bailliage.geo.territories import members_by_year
    ms = [NS(child_id="v1", parent_id="prevote", from_year=None, to_year=None),
          NS(child_id="prevote", parent_id="office", from_year=None, to_year=None),
          NS(child_id="v2", parent_id="office", from_year=1623, to_year=None),
          NS(child_id="office", parent_id="prevote", from_year=None, to_year=None)]  # a cycle must not hang
    by = members_by_year(ms, {"v1", "v2"})
    assert by[1622]["office"] == {"v1"} and by[1623]["office"] == {"v1", "v2"}


def test_colocated_places_share_one_cell():
    from types import SimpleNamespace as NS
    from bailliage.geo.territories import settlement_cells
    places = [NS(id="commune", lat=49.0, lon=6.5, confidence="high"),
              NS(id="hamlet", lat=49.0, lon=6.5, confidence="low"),
              NS(id="other", lat=49.1, lon=6.6, confidence="high")]
    cells, shared = settlement_cells(places)
    assert set(cells) == {"commune", "other"} and shared["commune"] == ["hamlet"]
    assert all(c.area > 0 for c in cells.values())


def test_territory_context_rematches_a_distant_namesake():
    near = item("Q9", 49.36, 6.40, {"Q484170"}, matched={"Courcelles"})
    far = item("Q1", 48.37, 6.04, {"Q484170"}, matched={"Courcelles"})
    results = {m: geocode.Result(m, lat=49.35 + i / 100, lon=6.35, confidence="high") for i, m in enumerate("abc")}
    results["courcelles"] = geocode.Result("courcelles", lat=48.37, lon=6.04, wikidata_id="Q1", confidence="high",
                                           note="no canton anchor")
    info = {"courcelles": {"names": {"Courcelles"}, "row": None,
                           "place": {"place_type": "village", "modern_country": "FR"}}}
    memberships = [{"child_id": c, "parent_id": "office"} for c in ("a", "b", "c", "courcelles")]
    geocode.refine_with_territories(results, info, memberships, {"Q1": far, "Q9": near}, fake_geonames())
    assert results["courcelles"].wikidata_id == "Q9" and results["courcelles"].confidence == "medium"
