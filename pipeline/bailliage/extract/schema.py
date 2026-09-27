"""Structured-output schema for one section's extraction.

Unlike the curated tables, extracted rows name places the way the book writes
them (plus the matching book-index entry, when there is one) and propose entity
ids; Stage 4 resolves these to curated ids. Vocabulary fields are enums built
from data/curated/vocab.yaml, so the model can only emit known keys.

Nullable fields make the compiled output grammar too large for the API, so
"unknown" is encoded as "" for strings and enums and 0 for years;
`to_plain()` turns those sentinels back into None after parsing.
"""
from __future__ import annotations

import json
import typing
from typing import Literal

import anthropic
from pydantic import BaseModel, ConfigDict

NONE_STR = ""
NONE_YEAR = 0


def _enum(vocab: dict, name: str, optional: bool = False):
    keys = tuple(vocab[name])
    return Literal[(NONE_STR,) + keys if optional else keys]


def build_extraction_model(vocab: dict) -> type[BaseModel]:
    PlaceType = _enum(vocab, "place_types")
    EntityType = _enum(vocab, "entity_types")
    RightType = _enum(vocab, "right_types")
    OptRightType = _enum(vocab, "right_types", optional=True)
    Status = _enum(vocab, "statuses")
    EventType = _enum(vocab, "event_types")
    Confidence = _enum(vocab, "confidence")
    Precision = _enum(vocab, "date_precisions", optional=True)

    class Row(BaseModel):
        model_config = ConfigDict(extra="forbid")

    class XPlace(Row):
        name_in_text: str
        index_name: str  # "" when no index entry matches
        kind: Literal["settlement", "territory"]
        place_type: PlaceType
        other_names: list[str]

    class XEntity(Row):
        id: str
        name_fr: str
        name_en: str
        name_de: str
        entity_type: EntityType
        is_new: bool
        source_page: str

    class Dated(Row):
        from_year: int  # 0 = not given
        to_year: int
        from_precision: Precision
        to_precision: Precision

    class XMembership(Row):
        child: str
        parent: str
        from_year: int  # 0 = not given
        to_year: int
        source_page: str

    class XRuler(Dated):
        entity_id: str
        person_name: str
        title: str
        source_page: str
        confidence: Confidence

    class XRight(Dated):
        place: str
        right_type: RightType
        holder_id: str
        share: str  # "", "1/2", "joint", ...
        status: Status
        is_disputed: bool
        disputed_with: list[str]
        source_page: str
        snippet: str
        confidence: Confidence
        notes: str

    class XEvent(Row):
        year: int
        place: str
        right_type: OptRightType
        from_holder: str
        to_holder: str
        event_type: EventType
        description: str
        source_page: str
        confidence: Confidence

    class SectionExtraction(Row):
        places: list[XPlace]
        entities: list[XEntity]
        memberships: list[XMembership]
        rulers: list[XRuler]
        rights: list[XRight]
        events: list[XEvent]

    return SectionExtraction


_YEAR_FIELDS = {"from_year", "to_year"}


def to_plain(extraction: BaseModel) -> dict:
    """model_dump() with the "unknown" sentinels replaced by None."""
    def clean(row: dict) -> dict:
        return {k: (None if (v == NONE_STR or (k in _YEAR_FIELDS and v == NONE_YEAR)) else v)
                for k, v in row.items()}
    return {table: [clean(r) for r in rows] for table, rows in extraction.model_dump().items()}


def output_json_schema(model: type[BaseModel]) -> dict:
    """JSON Schema for output_config.format, with every $ref inlined.

    The API compiles the schema into a grammar; with pydantic's $defs/$ref layout
    that grammar exceeds the size limit, while the same schema inlined does not.
    """
    schema = anthropic.transform_schema(model)
    defs = schema.get("$defs", {})

    def walk(node):
        if isinstance(node, list):
            return [walk(v) for v in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return walk(defs[node["$ref"].rsplit("/", 1)[-1]])
        out = {}
        for key, value in node.items():
            if key in ("$defs", "title"):  # annotations, not data
                continue
            if key == "properties":  # field names: keep all, even one called "title"
                out[key] = {name: walk(sub) for name, sub in value.items()}
            else:
                out[key] = walk(value)
        return out

    return walk(schema)


def lenient_validate(model: type[BaseModel], text: str) -> tuple[BaseModel, list[str]]:
    """Validate a response, first filling fields the model left out with their
    "unknown" sentinel. Returns the parsed extraction and the filled paths."""
    data = json.loads(text)
    filled: list[str] = []
    for table, field_info in model.model_fields.items():
        row_model = typing.get_args(field_info.annotation)[0]
        for i, row in enumerate(data.get(table, [])):
            for name, info in row_model.model_fields.items():
                if name not in row:
                    origin = typing.get_origin(info.annotation)
                    row[name] = ([] if origin is list else False if info.annotation is bool
                                 else NONE_YEAR if info.annotation is int else NONE_STR)
                    filled.append(f"{table}[{i}].{name}")
    return model.model_validate(data), filled
