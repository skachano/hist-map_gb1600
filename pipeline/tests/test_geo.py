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
