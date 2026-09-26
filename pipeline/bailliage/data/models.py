"""Row models for the curated tables (data/curated/*.csv).

Conventions
- Periods are inclusive: a right held "1608-1624" has from_year=1608, to_year=1624.
  In a transfer year both the old and the new holder appear; the app shows the new one.
- An empty from_year means "since before the source says"; an empty to_year means
  "still held at the end of what the source covers".
- Fields taking vocabulary keys (place_type, right_type, status, ...) are plain strings
  here and are checked against data/curated/vocab.yaml by the validator, so the
  vocabularies can grow without code changes.
- In CSV, list fields are "|"-separated and empty cells mean "none".
"""
from __future__ import annotations

import re
import typing
from fractions import Fraction
from typing import Annotated, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
# "49", "49-50", "13;52", "107-110;21"
PageRef = Annotated[str, StringConstraints(pattern=r"^\d{1,3}(?:-\d{1,3})?(?:;\s*\d{1,3}(?:-\d{1,3})?)*$")]
Year = Annotated[int, Field(ge=1000, le=1800)]
# A fraction such as "1/2", or "joint" for undivided co-holding with unknown shares.
Share = Annotated[str, StringConstraints(pattern=r"^(?:\d+/\d+|joint)$")]

YEAR_MIN, YEAR_MAX = 1600, 1632


def parse_pages(ref: str) -> list[int]:
    pages: list[int] = []
    for part in re.split(r";\s*", ref):
        a, _, b = part.partition("-")
        pages.extend(range(int(a), int(b or a) + 1))
    return pages


def share_value(share: str | None) -> Fraction | None:
    """Numeric share, or None for "joint"/unspecified."""
    if not share or share == "joint":
        return None
    num, den = share.split("/")
    return Fraction(int(num), int(den))


class CsvRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # Vocabulary each field must come from (checked by the validator).
    vocab_fields: ClassVar[dict[str, str]] = {}

    @classmethod
    def columns(cls) -> list[str]:
        """CSV column order: the row's own fields first, dates next, provenance last."""
        tail = ["from_year", "to_year", "from_precision", "to_precision",
                "snippet", "source_page", "confidence", "notes"]
        own = [f for f in cls.model_fields if f not in tail]
        return own + [f for f in tail if f in cls.model_fields]

    @classmethod
    def list_fields(cls) -> set[str]:
        hints = typing.get_type_hints(cls, include_extras=True)
        return {name for name in cls.model_fields if typing.get_origin(hints[name]) is list}

    @model_validator(mode="before")
    @classmethod
    def _from_csv(cls, data):
        if not isinstance(data, dict):
            return data
        lists = cls.list_fields()
        out = {}
        for key, value in data.items():
            if isinstance(value, str):
                value = value.strip()
                if key in lists:
                    value = [v.strip() for v in value.split("|") if v.strip()]
                elif value == "":
                    value = None
            if value is None and key in lists:
                value = []
            if value is not None:  # empty cell: let the field default apply
                out[key] = value
        return out


class Provenance(CsvRow):
    source_page: PageRef | None = None
    confidence: str = "high"
    notes: str | None = None


class Period(Provenance):
    from_year: Year | None = None
    to_year: Year | None = None
    from_precision: str | None = None
    to_precision: str | None = None

    @model_validator(mode="after")
    def _check_period(self):
        if self.from_year is not None and self.to_year is not None and self.from_year > self.to_year:
            raise ValueError(f"from_year {self.from_year} is after to_year {self.to_year}")
        if self.from_precision and self.from_year is None:
            raise ValueError("from_precision given without from_year")
        if self.to_precision and self.to_year is None:
            raise ValueError("to_precision given without to_year")
        return self

    def overlaps(self, other: "Period") -> int:
        """Number of years both periods cover (open ends reach the app's range limits)."""
        lo = max(self.from_year or YEAR_MIN - 1, other.from_year or YEAR_MIN - 1)
        hi = min(self.to_year or YEAR_MAX + 1, other.to_year or YEAR_MAX + 1)
        return max(0, hi - lo + 1)

    def touches_app_range(self) -> bool:
        return (self.from_year or YEAR_MIN) <= YEAR_MAX and (self.to_year or YEAR_MAX) >= YEAR_MIN


class Place(Provenance):
    table: ClassVar[str] = "places"
    vocab_fields: ClassVar[dict[str, str]] = {"place_type": "place_types", "confidence": "confidence"}

    id: Slug
    kind: Literal["settlement", "territory"]
    name_fr: str
    name_de: str | None = None
    name_en: str | None = None
    variants: list[str] = Field(default_factory=list)
    place_type: str
    lat: Annotated[float, Field(ge=-90, le=90)] | None = None
    lon: Annotated[float, Field(ge=-180, le=180)] | None = None
    wikidata_id: Annotated[str, StringConstraints(pattern=r"^Q\d+$")] | None = None
    geonames_id: int | None = None
    modern_country: Literal["FR", "DE", "LU"] | None = None


class Entity(Provenance):
    table: ClassVar[str] = "entities"
    vocab_fields: ClassVar[dict[str, str]] = {"entity_type": "entity_types", "confidence": "confidence"}

    id: Slug
    name_en: str
    name_fr: str
    name_de: str
    entity_type: str
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] | None = None


_PERIOD_VOCAB = {"confidence": "confidence", "from_precision": "date_precisions", "to_precision": "date_precisions"}


class Ruler(Period):
    table: ClassVar[str] = "rulers"
    vocab_fields: ClassVar[dict[str, str]] = _PERIOD_VOCAB

    entity_id: Slug
    person_name: str
    title: str | None = None


class Membership(Period):
    table: ClassVar[str] = "memberships"
    vocab_fields: ClassVar[dict[str, str]] = _PERIOD_VOCAB

    child_id: Slug
    parent_id: Slug


class Right(Period):
    table: ClassVar[str] = "rights"
    vocab_fields: ClassVar[dict[str, str]] = {**_PERIOD_VOCAB, "right_type": "right_types", "status": "statuses"}

    place_id: Slug
    right_type: str
    holder_id: Slug
    share: Share | None = None
    status: str = "held"
    is_disputed: bool = False
    disputed_with: list[Slug] = Field(default_factory=list)
    snippet: Annotated[str, StringConstraints(max_length=300)] | None = None


class Event(Provenance):
    table: ClassVar[str] = "events"
    vocab_fields: ClassVar[dict[str, str]] = {
        "confidence": "confidence", "right_type": "right_types", "event_type": "event_types",
    }

    year: Year
    place_id: Slug
    right_type: str | None = None
    from_holder: Slug | None = None
    to_holder: Slug | None = None
    event_type: str
    description: str


TABLES: list[type[CsvRow]] = [Place, Entity, Ruler, Membership, Right, Event]
