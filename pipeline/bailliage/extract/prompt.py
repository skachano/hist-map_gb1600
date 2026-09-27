"""Prompt construction for per-section extraction.

The system prompt is identical for every section (instructions, vocabularies,
known entities) so it is cached; the user message carries the section text and
the book-index entries whose page references fall inside the section.
"""
from __future__ import annotations

import csv

from bailliage import config

# Entity ids suggested for reuse so that sections extracted independently
# converge on the same ids. Only used when the text actually mentions them.
SUGGESTED_ENTITIES = {
    "diocese-metz": "diocèse de Metz",
    "diocese-trier": "archevêché / diocèse de Trèves (spirituel)",
    "diocese-strasbourg": "diocèse de Strasbourg",
    "duchy-zweibruecken": "duché de Deux-Ponts",
    "county-hanau-lichtenberg": "comté de Hanau-Lichtenberg",
    "county-la-petite-pierre": "comté de La Petite-Pierre (Veldenz)",
    "duchy-luxembourg": "duché de Luxembourg",
    "pays-messin": "Pays messin (cité de Metz)",
    "county-crehange": "comté / seigneurie de Créhange",
    "county-dabo": "comté de Dabo",
    "county-blamont": "comté de Blâmont",
    "county-salm": "comté de Salm",
    "kingdom-france": "royaume de France",
    "teutonic-order": "ordre teutonique",
    "electorate-palatinate": "électorat palatin",
}

SYSTEM_TEMPLATE = """\
You extract structured facts from Henri Hiegel, "Le bailliage d'Allemagne de 1600 à 1632" (1961), a French \
monograph on the German-speaking bailiwick of the duchy of Lorraine. The facts feed an interactive map showing, \
for every year 1600-1632, who held which right over each settlement and territory.

Each request gives one section of the book, or one part of a long section. The text contains page markers "[p. N]" (the printed page that \
follows), note calls "[n]", and occasional "[OCR region]" blocks. Extract only what the text states or clearly \
implies; do not add outside knowledge beyond identifying who is meant.

What to extract
- rights: who held which right over which place, when. One row per (place, right type, holder, period).
- events: changes or confirmations of a right (purchase, pledge, inheritance, treaty, judgment, occupation...).
- memberships: which settlement or territory belonged to which larger territory (office, prévôté, seigneurie, \
county...), e.g. the villages the text lists as making up an office.
- places: every settlement or territory used in a right, event or membership.
- entities: every holder or party (states, churches, families, persons) used in rights, events or rulers.
- rulers: heads of entities with their years, when the text gives them (dukes, electors, counts, bishops).
Skip what is not about rights, jurisdiction or territorial composition (anecdotes, prices, individual \
criminal cases), except where it states who held a jurisdiction.

Right types (key: meaning / typical French wording)
{right_types}

Mapping rules
- "S. A.", "Son Altesse", "le duc" = the duke of Lorraine: holder "duchy-lorraine", unless the text makes a named \
person the holder personally (an engagiste such as Henriette de Vaudémont, a prince holding in his own name such \
as François II de Vaudémont or Louis de Guise).
- "engagé(e) à X" / "engagiste": X holds the pledged rights with status "pledged"; add a "pledge" event.
- Fiefs: the lord granting the fief holds "suzerain" (dominium directum); the vassal holds "manorial_lord" \
unless the text names justice rights explicitly.
- "haute, moyenne et basse justice" gives two rows: high_justice and middle_low_justice.
- Shares: "par moitié" = "1/2" for each holder; "pour un quart" = "1/4"; "commun", "en commun", "par indivis", \
"comparsonniers" without fractions = "joint". Leave share "" for a sole holder.
- Disputes ("différend", "contesta", "revendiqua", "prétendait", "protesta", litigation at the Imperial Chamber...): \
set is_disputed=true on the rows involved and list the opposing entity ids in disputed_with. A party that claims \
but does not hold gets its own row with status "claimed".
- Years are inclusive. Fill from_year / to_year only when the text supports them. Precision: "exact" for a stated \
date, "circa" for approximate ones, "before"/"after" for "avant"/"après", "attested" when the text only shows the \
right in that year ("en 1616 ... appartient à"). A right the text describes as the standing situation gets no \
years. Include earlier facts (e.g. an acquisition in 1581) when they establish the situation of 1600-1632.
- source_page is the printed page from the nearest preceding "[p. N]" marker ("49" or "49-50"). snippet is a short \
verbatim quote (at most ~100 characters) from the text supporting the row; notes stay "" unless something \
needs explaining (e.g. two pages giving different dates).
- Unknown or not applicable: use "" for text and enum fields and 0 for years (never invent a value).
- confidence: "high" when stated outright, "medium" when inferred from context (e.g. from a section heading or a \
list), "low" when uncertain.

Places
- name_in_text: the name as written in the section (use the same string in rights, events and memberships).
- index_name: the matching entry from the "Index entries" list given with the section, copied exactly, or "".
- other_names: variant names the text gives in parentheses, e.g. "Bizing (Bisingen, Bursingen)".
- place_type from the vocabulary; kind "settlement" for inhabited places, castles, abbeys; "territory" for \
offices, prévôtés, seigneuries, counties and other districts.

Entities
- Reuse a known id when it fits. Otherwise make a new lowercase-hyphenated id: type prefix + place or family \
("abbey-mettlach", "chapter-saint-simeon-trier", "house-cronenberg", "lords-berus") or a person's name \
("louis-de-guise"), and set is_new=true. Give names in French, English and German.

Vocabularies
place_types: {place_types}
entity_types: {entity_types}
statuses: {statuses}
event_types: {event_types}
date_precisions: {precisions}

Known entities (id: name)
{entities}
"""

RIGHT_HINTS = {
    "suzerain": "souveraineté, droits régaliens, dominium directum, 'relevant de', fief granted by",
    "high_justice": "haute justice, haut justicier, signe patibulaire, droit de glaive",
    "middle_low_justice": "moyenne et basse justice",
    "manorial_lord": "seigneurie foncière, seigneur foncier, justice foncière, propriété foncière, vassal holding a fief",
    "advocate": "vouerie, avouerie, (haute) vouerie, voué, Vogtei, Kastenvogtei",
    "spiritual_lord": "diocèse, évêché (spiritual), archidiaconé, doyenné",
    "tithe": "dîmes",
    "safeguard": "sauvegarde, garde, protection",
    "tax_aide": "aide générale, aides, taille levied by a state",
    "military": "monstres, levées, revues militaires",
    "tabellionage": "tabellionage, tabellion",
    "appeal_jurisdiction": "appel à / on appelle à (court receiving appeals)",
}


def _keys(vocab: dict, name: str) -> str:
    return ", ".join(vocab[name])


def system_prompt(vocab: dict, entities: dict[str, str]) -> str:
    right_lines = "\n".join(
        f"- {key}: {labels['en']} / {labels['fr']} ({RIGHT_HINTS.get(key, '')})"
        for key, labels in vocab["right_types"].items()
    )
    entity_lines = "\n".join(f"- {eid}: {name}" for eid, name in sorted(entities.items()))
    return SYSTEM_TEMPLATE.format(
        right_types=right_lines,
        place_types=_keys(vocab, "place_types"),
        entity_types=_keys(vocab, "entity_types"),
        statuses=_keys(vocab, "statuses"),
        event_types=_keys(vocab, "event_types"),
        precisions=_keys(vocab, "date_precisions"),
        entities=entity_lines,
    )


def known_entities() -> dict[str, str]:
    """Curated entities plus the suggested ids, as id -> French name."""
    entities = dict(SUGGESTED_ENTITIES)
    path = config.CURATED_DIR / "entities.csv"
    if path.exists():
        with path.open(newline="") as f:
            entities.update({row["id"]: row["name_fr"] for row in csv.DictReader(f)})
    return entities


def index_label(row: dict) -> str:
    """How a gazetteer row is shown to the model (and echoed back as index_name)."""
    return row["raw"].split(")")[0] + ")" if "(" in row["raw"] else row["name"]


def index_entries_for(first_page: int, last_page: int) -> list[str]:
    """Book-index lines (place index) referencing a page of the section."""
    lines = []
    with (config.RAW_DIR / "gazetteer_seed.csv").open(newline="") as f:
        for row in csv.DictReader(f):
            pages = {int(p) for p in row["pages"].split()} if row["pages"] else set()
            if pages & set(range(first_page, last_page + 1)):
                lines.append(index_label(row))
    return sorted(set(lines))


def user_message(chunk: dict, text: str) -> str:
    entries = index_entries_for(chunk["first_page"], chunk["last_page"])
    part = f" (part {chunk['part']} of {chunk['parts']})" if chunk["parts"] > 1 else ""
    return (
        f"Section {chunk['section_id']}{part}: {chunk['title']}\n"
        f"Chapter: {chunk['chapter_title']} (printed pages {chunk['first_page']}-{chunk['last_page']})\n\n"
        f"Index entries (book's place index, entries citing these pages):\n"
        + ("\n".join(entries) if entries else "(none)")
        + f"\n\nSection text:\n<section>\n{text}\n</section>"
    )
