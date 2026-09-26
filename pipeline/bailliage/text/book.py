"""Facts about this particular edition (FeniXX reissue of Hiegel 1961) that are
not worth detecting automatically."""

# First PDF page of the numbered body (printed p. 9, "Chapitre premier").
BODY_FIRST_PDF = 10
# Last PDF page that belongs to the printed book (end of the Table des matières).
BODY_LAST_PDF = 317

# Unnumbered or non-text pages we know about (PDF numbering).
MAP_PAGES = {
    261: "Châteaux et villes fortifiées du bailliage (1/2)",
    262: "Châteaux et villes fortifiées du bailliage (2/2)",
    319: "Le bailliage d'Allemagne en 1630",
}

# Lines stamped on every page by the e-book distributor.
LICENCE_PREFIXES = ("Licence eden-", "7460114@")

# Back matter (bibliography, indexes) starts here; its text layer is used as is.
BACK_MATTER_FIRST_PRINTED = 273

# Back-matter indexes, as printed page ranges (inclusive).
PLACE_INDEX_PAGES = (283, 298)
PERSON_INDEX_PAGES = (299, 302)
GLOSSARY_PAGES = (303, 304)
TOC_PAGES = (307, 310)
