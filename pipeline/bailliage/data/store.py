"""Load the curated dataset (vocab.yaml + one CSV per table)."""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError

from bailliage import config
from bailliage.data.models import TABLES, CsvRow, Entity, Event, Membership, Place, Right, Ruler

LANGS = ("en", "fr", "de")


@dataclass
class Issue:
    level: str  # "error" | "warning"
    table: str
    row: int | None  # CSV line number (header is line 1)
    message: str

    def __str__(self) -> str:
        where = f"{self.table}.csv:{self.row}" if self.row else f"{self.table}"
        return f"{self.level.upper():7} {where}: {self.message}"


@dataclass
class Dataset:
    vocab: dict[str, dict[str, dict]]
    places: list[tuple[int, Place]] = field(default_factory=list)
    entities: list[tuple[int, Entity]] = field(default_factory=list)
    rulers: list[tuple[int, Ruler]] = field(default_factory=list)
    memberships: list[tuple[int, Membership]] = field(default_factory=list)
    rights: list[tuple[int, Right]] = field(default_factory=list)
    events: list[tuple[int, Event]] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)  # parse errors found while loading


def load_vocab(path: Path) -> dict[str, dict[str, dict]]:
    return yaml.safe_load(path.read_text())


def csv_columns(model: type[CsvRow]) -> list[str]:
    return list(model.model_fields)


def load(directory: Path = config.CURATED_DIR) -> Dataset:
    ds = Dataset(vocab=load_vocab(directory / "vocab.yaml"))
    for model in TABLES:
        path = directory / f"{model.table}.csv"
        if not path.exists():
            ds.issues.append(Issue("warning", model.table, None, "file missing (treated as empty)"))
            continue
        with path.open(newline="") as f:
            reader = csv.DictReader(f)
            unknown = set(reader.fieldnames or []) - set(model.model_fields)
            if unknown:
                ds.issues.append(Issue("error", model.table, 1, f"unknown columns: {sorted(unknown)}"))
                continue
            rows = getattr(ds, model.table)
            for line, raw in enumerate(reader, start=2):
                if not any((v or "").strip() for v in raw.values()):
                    continue  # blank line
                try:
                    rows.append((line, model.model_validate(raw)))
                except ValidationError as e:
                    for err in e.errors():
                        loc = ".".join(map(str, err["loc"])) or "row"
                        ds.issues.append(Issue("error", model.table, line, f"{loc}: {err['msg']}"))
    return ds
