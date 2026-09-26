from bailliage.text import clean, indexes, pagemap, sections, toc


# --- clean -------------------------------------------------------------------

def test_dehyphenate_joins_split_words():
    assert clean.dehyphenate(["de Sarrebourg, Phalsbourg et Féné-", "trange dominaient"]) == \
        "de Sarrebourg, Phalsbourg et Fénétrange dominaient"


def test_dehyphenate_keeps_compound_hyphens():
    assert clean.dehyphenate(["la seigneurie de Hombourg-", "Haut"]) == "la seigneurie de Hombourg-Haut"
    assert clean.dehyphenate(["Kerling-", "lès-Sierck"]) == "Kerling-lès-Sierck"
    assert clean.dehyphenate(["pp. 50-", "52"]) == "pp. 50-52"


def test_letterspaced_detection_and_rebuild():
    assert clean.is_letterspaced("m a r c h a n d i s e")
    assert not clean.is_letterspaced("le duc de Lorraine")
    # glyph widths 4pt, 1pt letter gaps, a 4.5pt word gap before "vendue"
    glyphs, x = [], 0.0
    for word in ("pot", "de"):
        for c in word:
            glyphs.append((c, x, x + 4))
            x += 5
        x += 3.5
    assert clean.join_letterspaced(glyphs, font_size=10) == "pot de"


def test_normalize_keeps_french_spacing_before_semicolon():
    assert clean.normalize_spaces("cartes 9 et 10 ; p. 85 , fin") == "cartes 9 et 10 ; p. 85, fin"


# --- page map ----------------------------------------------------------------

def _page(pdf, cands, text=True):
    return pagemap.PageInfo(pdf, frozenset(cands), text)


def test_page_map_detects_unnumbered_plates():
    pages = [_page(10, {9}), _page(11, {10}), _page(12, {11, 7}),
             _page(13, set(), text=False), _page(14, set(), text=False),  # two plates
             _page(15, {12}), _page(16, {13}), _page(17, set()), _page(18, {15})]
    result = pagemap.fit_page_numbers(pages, start_offset=1)
    assert result == {10: 9, 11: 10, 12: 11, 13: None, 14: None, 15: 12, 16: 13, 17: 14, 18: 15}


def test_page_map_ignores_isolated_misreads():
    pages = [_page(n, {n - 1}) for n in range(10, 20)]
    pages[4] = _page(14, {719})
    result = pagemap.fit_page_numbers(pages, start_offset=1)
    assert result[14] == 13 and None not in result.values()


# --- toc ---------------------------------------------------------------------

TOC_SAMPLE = """Table des Matières
Avant-Propos.
5
LIVRE PREMIER
L'Administration du bailliage d'Allemagne
Chapitre premier. La situation et rétendue du bailliage
I. La situation du bailliage sur la Sarre et dans le Westrich.
9
IX. La terre de Sarralbe. Le comté de Sarrewerden et la vouerie de
Herbitzheim. Les terres de Phalsbourg, Lixheim, Sarreck, Féné-
trange et Sarrebourg.
18
Chapitre III. Le bailliage d'Allemagne et les Etats généraux
de Lorraine
I. Les États généraux de 1569 à 1599.
34
V. La vouerie de Herbitzheim et le comté impérial de Sarrewerden. 107
LIVRE III
Les finances et l'organisation militaire du bailliage
Chapitre IV. L'organisation militaire du bailliage
I.
L armement des châteaux et des villes.
254
II..
Les forces militaires du bailliage.
258
Conclusion.
271""".splitlines()


def test_parse_toc():
    entries = toc.parse_toc(TOC_SAMPLE)
    got = [(e.id, e.page) for e in entries]
    assert got == [("avant-propos", 5), ("L1-C01-S01", 9), ("L1-C01-S09", 18), ("L1-C03-S01", 34),
                   ("L1-C03-S05", 107), ("L3-C04-S01", 254), ("L3-C04-S02", 258), ("conclusion", 271)]
    ix = entries[2]
    assert ix.title == ("La terre de Sarralbe. Le comté de Sarrewerden et la vouerie de Herbitzheim. "
                        "Les terres de Phalsbourg, Lixheim, Sarreck, Fénétrange et Sarrebourg")
    assert entries[3].chapter_title == "Le bailliage d'Allemagne et les Etats généraux de Lorraine"
    assert entries[5].title == "L armement des châteaux et des villes"


def test_roman():
    assert [toc.roman_to_int(r) for r in ("I", "IV", "IX", "XII")] == [1, 4, 9, 12]


# --- sections ----------------------------------------------------------------

def test_split_sections_cuts_at_headings():
    e1 = toc.TocEntry("section", "La composition du bailliage", 11, 1, 1, 2)
    e2 = toc.TocEntry("section", "L'office de Sierck", 12, 1, 1, 3)
    pages = [
        sections.Page(12, 11, ["fin de la section I.", "II. La composition du bailliage", "texte A"]),
        sections.Page(13, 12, ["suite A", "III. L'office de Sierck", "texte B"]),
    ]
    s1, s2 = sections.split_sections(pages, [e1, e2])
    assert s1.heading_found and s2.heading_found
    assert s1.text == "[p. 11]\n\nII. La composition du bailliage\n\ntexte A\n\n[p. 12]\n\nsuite A"
    assert s2.text == "[p. 12]\n\nIII. L'office de Sierck\n\ntexte B"
    assert (s1.first_page, s1.last_page) == (11, 12)


# --- indexes -----------------------------------------------------------------

def test_group_and_parse_place_index():
    lines = """Table des noms de lieux
Abréviations : M., Moselle ; MM., Meurthe-et-Moselle ; B., Bas-Rhin ; S., Sarre
(Allemagne) ; R., Rhénanie-Palatinat (Allemagne).
Anzeling (M., Bouzonville) 13, 25, 50-
52, 81
Arlange, Allerange (M., Wuisse) 20,
74
Assenoncourt (M., Réchicourt-le-Châ-
teau) 20, 73-75
Albestroff (M.) 10, 66
Altroff-Léning = Francaltroff
Vorburg, Vorgebirg = faubourg (M.,
Bitche) 49
Danne-et-Quatre-Vents
(M., Phalsbourg) 19
Gandren (IVI., Beyren) 49, 129""".splitlines()
    entries = [indexes.parse_place_entry(e) for e in indexes.group_entries(lines)]
    assert [e.name for e in entries] == ["Anzeling", "Arlange", "Assenoncourt", "Albestroff",
                                         "Altroff-Léning", "Vorburg", "Danne-et-Quatre-Vents", "Gandren"]
    anz, arl, ass, alb, alt, vor, dan, gan = entries
    assert anz.pages == [13, 25, 50, 51, 52, 81] and anz.department == "Moselle" and anz.canton == "Bouzonville"
    assert arl.variants == ["Allerange"] and arl.pages == [20, 74]
    assert ass.canton == "Réchicourt-le-Château" and ass.pages == [20, 73, 74, 75]
    assert alb.dept_code == "M." and alb.canton is None
    assert alt.see == "Francaltroff" and alt.pages == []
    assert vor.see == "faubourg" and vor.canton == "Bitche" and vor.pages == [49]
    assert dan.canton == "Phalsbourg" and dan.pages == [19]
    assert gan.dept_code == "M." and gan.canton == "Beyren"


def test_parse_glossary_entry():
    assert indexes.parse_glossary_entry("Mère-cour, Oberhoff, 63, 70, 76, 84") == \
        ("Mère-cour", "Oberhoff", [63, 70, 76, 84])
    assert indexes.parse_glossary_entry("Marchise, 119, 200") == ("Marchise", "", [119, 200])


def test_split_sections_requires_matching_numeral():
    # "L'office de Siersberg" is similar to "L'office de Sierck": only the numeral tells them apart.
    e3 = toc.TocEntry("section", "L'office de Sierck", 12, 1, 1, 3)
    e4 = toc.TocEntry("section", "L'office de Siersberg. Le condominium du Saargau-Merzig", 13, 1, 1, 4)
    pages = [
        sections.Page(13, 12, ["III. L'office de Sierck", "texte Sierck"]),
        sections.Page(14, 13, ["suite", "IV. L'office de Siersberg Le condominium du Saargau-Merzig", "texte"]),
    ]
    s3, s4 = sections.split_sections(pages, [e3, e4])
    assert "texte Sierck" in s3.text and "suite" in s3.text
    assert s4.text.startswith("[p. 13]\n\nIV. L'office de Siersberg")


def test_heading_numeral_ocr_confusions():
    e = toc.TocEntry("section", "L'armement des châteaux et des villes", 254, 3, 4, 1)
    assert sections._is_heading_for("/. L'armement des châteaux et des villes", e)
    assert not sections._is_heading_for("II. L'armement des châteaux et des villes", e)


def test_uncovered_gaps():
    from bailliage.text import layout
    # blocks at 50-100 and 300-350 (overlapping 90-120 too); text area 40-400
    assert layout._uncovered([(50, 100), (90, 120), (300, 350)], 40, 400) == [(120, 300)]
    assert layout._uncovered([], 40, 400) == [(40, 400)]


def test_merge_baselines():
    from bailliage.text import layout
    lines = [{"bbox": (10, 87.1, 40, 94)}, {"bbox": (45, 87.2, 60, 94)}, {"bbox": (10, 94.5, 200, 101)}]
    merged, texts = layout._merge_baselines(lines, ["les ", "immunités", "des maisons"])
    assert texts == ["les immunités", "des maisons"] and merged[0]["bbox"] == (10, 87.1, 60, 94)
