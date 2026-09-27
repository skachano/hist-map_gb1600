"""Offline tests for Stage 3 (no API calls)."""
import json

from bailliage import config
from bailliage.data.store import load_vocab
from bailliage.extract import prompt, run
from bailliage.extract.schema import build_extraction_model, output_json_schema, to_plain

VOCAB = load_vocab(config.CURATED_DIR / "vocab.yaml")
Model = build_extraction_model(VOCAB)


def test_output_schema_is_inlined_and_strict():
    schema = output_json_schema(Model)
    text = json.dumps(schema)
    assert "$ref" not in text and "$defs" not in text
    right = schema["properties"]["rights"]["items"]
    assert right["additionalProperties"] is False
    assert set(right["required"]) == set(right["properties"])
    assert "" in right["properties"]["from_precision"]["enum"]      # optional enum: "" = unknown
    assert "" not in right["properties"]["right_type"]["enum"]      # required enum
    assert "anyOf" not in text                                      # no nullable unions
    assert "title" in schema["properties"]["rulers"]["items"]["properties"]  # a field named "title" survives


def test_to_plain_turns_sentinels_into_none():
    x = Model.model_validate({
        "places": [], "entities": [], "memberships": [], "rulers": [], "events": [],
        "rights": [{"place": "Weiten", "right_type": "high_justice", "holder_id": "duchy-lorraine", "share": "",
                    "status": "held", "is_disputed": False, "disputed_with": [], "from_year": 0, "to_year": 1624,
                    "from_precision": "", "to_precision": "exact", "source_page": "49", "snippet": "…",
                    "confidence": "high", "notes": ""}],
    })
    r = to_plain(x)["rights"][0]
    assert r["from_year"] is None and r["to_year"] == 1624 and r["share"] is None
    assert r["from_precision"] is None and r["to_precision"] == "exact" and r["notes"] is None
    assert r["disputed_with"] == [] and r["is_disputed"] is False


def test_system_prompt_lists_vocab_and_known_entities():
    system = prompt.system_prompt(VOCAB, prompt.known_entities())
    for key in ("high_justice", "manorial_lord", "pledged", "attested", "condominium"):
        assert key in system
    assert "duchy-lorraine" in system and "diocese-metz" in system


def test_request_hash_is_stable_and_sensitive(tmp_path, monkeypatch):
    section = {"id": "L9-C01-S01", "file": "x.txt", "title": "T", "chapter_title": "C",
               "first_page": 12, "last_page": 13}
    (tmp_path / "x.txt").write_text("[p. 12]\n\nIII. L'office de Sierck")
    monkeypatch.setattr(run, "SECTIONS_DIR", tmp_path)
    a = run.build_jobs([section], "claude-opus-5", "high")[0]
    b = run.build_jobs([section], "claude-opus-5", "high")[0]
    c = run.build_jobs([section], "claude-opus-5", "medium")[0]
    assert a.request_hash == b.request_hash != c.request_hash
    assert a.id == "L9-C01-S01_1" and "Index entries" in a.user and "<section>" in a.user


def test_cost_formula():
    usage = {"input_tokens": 1_000_000, "output_tokens": 1_000_000,
             "cache_creation_input_tokens": 0, "cache_read_input_tokens": 1_000_000}
    assert run.cost(usage) == 5.0 + 25.0 + 0.5
    assert run.cost(usage, batch=True) == (5.0 + 25.0 + 0.5) / 2


def test_lenient_validate_fills_missing_fields():
    from bailliage.extract.schema import lenient_validate
    text = json.dumps({"places": [], "entities": [], "memberships": [], "rights": [], "events": [],
                       "rulers": [{"entity_id": "duchy-lorraine", "person_name": "Henri II", "from_year": 1608,
                                   "to_year": 1624, "from_precision": "exact", "to_precision": "exact",
                                   "source_page": "24", "confidence": "high"}]})
    x, filled = lenient_validate(Model, text)
    assert filled == ["rulers[0].title"] and to_plain(x)["rulers"][0]["title"] is None


def test_split_section_keeps_page_context():
    from bailliage.extract.chunks import split_section
    text = "# header\n\n[p. 49]\n\nChapitre VI\n\n" + "A" * 30 + "\n\n[p. 50]\n\n" + "B" * 30 + "\n\n" + "C" * 30
    chunks = split_section(text, 49, max_chars=60)
    assert [c.text for c in chunks] == ["[p. 49]\n\nChapitre VI\n\n" + "A" * 30,
                                        "[p. 50]\n\n" + "B" * 30, "[p. 50]\n\n" + "C" * 30]
    assert [(c.first_page, c.last_page) for c in chunks] == [(49, 49), (50, 50), (50, 50)]
    whole = split_section(text, 49)
    assert len(whole) == 1 and (whole[0].first_page, whole[0].last_page) == (49, 50)


def test_split_long_paragraph_at_sentences():
    from bailliage.extract.chunks import split_section
    para = " ".join(f"Phrase {i} ici." for i in range(40))
    chunks = split_section(f"[p. 12]\n\n{para}", 12, max_chars=100)
    assert all(len(c.text) <= 100 + len("[p. 12]\n\n") for c in chunks) and len(chunks) > 3
    assert "".join(c.text.replace("[p. 12]\n\n", "") + " " for c in chunks).split() == para.split()
