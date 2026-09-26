"""Export JSON Schema for each curated table, with vocabulary keys as enums.

The schemas describe one parsed row (lists as arrays, not "|"-joined strings) and
are reused by Stage 3 as the structured-output format for LLM extraction.
"""
from __future__ import annotations

import json
from pathlib import Path

from bailliage import config
from bailliage.data.models import TABLES, CsvRow
from bailliage.data.store import load_vocab

SCHEMA_DIR = config.DATA_DIR / "schema"


def table_schema(model: type[CsvRow], vocab: dict) -> dict:
    schema = model.model_json_schema()
    for fld, vocab_name in model.vocab_fields.items():
        keys = list(vocab.get(vocab_name, {}))
        prop = schema["properties"][fld]
        if "anyOf" in prop:  # optional field
            prop["anyOf"] = [{"type": "string", "enum": keys}, {"type": "null"}]
        else:
            prop.pop("type", None)
            prop["enum"] = keys
    schema["title"] = model.table
    return schema


def export(out_dir: Path = SCHEMA_DIR) -> list[Path]:
    vocab = load_vocab(config.CURATED_DIR / "vocab.yaml")
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for model in TABLES:
        path = out_dir / f"{model.table}.schema.json"
        path.write_text(json.dumps(table_schema(model, vocab), ensure_ascii=False, indent=2) + "\n")
        paths.append(path)
    return paths
