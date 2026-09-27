"""Run per-chunk extraction against the Claude API, in realtime or as a batch.

Sections longer than chunks.MAX_CHARS are split. Every paid response is saved
raw (data/extracted/raw/<chunk>.json) before it is parsed, and parsed results go
to data/extracted/<chunk>.json with usage and cost. A request hash covers
everything that shapes the request, so re-runs skip unchanged chunks and a raw
response already paid for is re-parsed instead of re-requested.
"""
from __future__ import annotations

import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

from bailliage import config
from bailliage.data.store import load_vocab
from bailliage.extract import prompt
from bailliage.extract.chunks import split_section
from bailliage.extract.schema import build_extraction_model, lenient_validate, output_json_schema, to_plain

MODEL = "claude-opus-5"
EFFORT = "medium"
MAX_TOKENS = 64000
PROMPT_VERSION = "2"
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Livre I, chapters I (extent), VI (offices), VIII (Empire), IX (neighbours).
PRIORITY_CHAPTERS = {(1, 1), (1, 6), (1, 8), (1, 9)}

# USD per million tokens (claude-opus-5); the Batches API bills half.
PRICE = {"input": 5.00, "output": 25.00, "cache_write": 6.25, "cache_read": 0.50}
BATCH_DISCOUNT = 0.5

SECTIONS_DIR = config.RAW_DIR / "sections"
OUT_DIR = config.EXTRACTED_DIR
BATCHES_FILE = OUT_DIR / "batches.json"


@dataclass
class Job:
    chunk: dict
    system: str
    user: str
    request_hash: str

    @property
    def id(self) -> str:  # also the batch custom_id: [A-Za-z0-9_-]{1,64}
        return self.chunk["id"]

    @property
    def out_path(self):
        return OUT_DIR / f"{self.id}.json"

    @property
    def raw_path(self):
        return OUT_DIR / "raw" / f"{self.id}.json"

    def is_done(self) -> bool:
        return self.out_path.exists() and \
            json.loads(self.out_path.read_text()).get("request_hash") == self.request_hash

    def has_raw(self) -> bool:
        return self.raw_path.exists() and \
            json.loads(self.raw_path.read_text()).get("request_hash") == self.request_hash


def select_sections(which: str) -> list[dict]:
    index = json.loads((SECTIONS_DIR / "index.json").read_text())
    if which == "all":
        return index
    if which == "priority":
        return [s for s in index if (s["livre"], s["chapter"]) in PRIORITY_CHAPTERS]
    wanted = {w.strip() for w in which.split(",")}
    chosen = [s for s in index if s["id"] in wanted]
    missing = wanted - {s["id"] for s in chosen}
    if missing:
        raise SystemExit(f"unknown section ids: {sorted(missing)}")
    return chosen


def build_jobs(sections: list[dict], model: str, effort: str) -> list[Job]:
    vocab = load_vocab(config.CURATED_DIR / "vocab.yaml")
    system = prompt.system_prompt(vocab, prompt.known_entities())
    schema = json.dumps(output_json_schema(build_extraction_model(vocab)), sort_keys=True)
    jobs = []
    for s in sections:
        pieces = split_section((SECTIONS_DIR / s["file"]).read_text(), s["first_page"])
        for part, piece in enumerate(pieces, start=1):
            chunk = {"id": f"{s['id']}_{part}", "section_id": s["id"], "part": part, "parts": len(pieces),
                     "title": s["title"], "chapter_title": s["chapter_title"],
                     "first_page": piece.first_page, "last_page": piece.last_page}
            user = prompt.user_message(chunk, piece.text)
            digest = hashlib.sha256("\x00".join([PROMPT_VERSION, model, effort, system, schema, user]).encode())
            jobs.append(Job(chunk, system, user, digest.hexdigest()[:16]))
    return jobs


def _params(job: Job, model: str, effort: str, output_schema: dict) -> dict:
    return dict(
        model=model,
        max_tokens=MAX_TOKENS,
        system=[{"type": "text", "text": job.system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": job.user}],
        thinking={"type": "adaptive"},
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": output_schema}},
    )


def cost(usage: dict, batch: bool = False) -> float:
    usd = (usage.get("input_tokens", 0) * PRICE["input"]
           + usage.get("output_tokens", 0) * PRICE["output"]
           + usage.get("cache_creation_input_tokens", 0) * PRICE["cache_write"]
           + usage.get("cache_read_input_tokens", 0) * PRICE["cache_read"]) / 1e6
    return usd * (BATCH_DISCOUNT if batch else 1)


def _save_raw(job: Job, message: dict, request_id: str | None, seconds: float | None, batch: bool) -> None:
    job.raw_path.parent.mkdir(parents=True, exist_ok=True)
    job.raw_path.write_text(json.dumps({"request_hash": job.request_hash, "request_id": request_id,
                                        "seconds": seconds, "batch": batch, "message": message},
                                       ensure_ascii=False))


def _parse_raw(job: Job, effort: str, output_model) -> dict:
    """Turn a saved raw response into data/extracted/<chunk>.json."""
    raw = json.loads(job.raw_path.read_text())
    message = raw["message"]
    usage = {k: message["usage"].get(k) or 0 for k in
             ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")}
    usd = cost(usage, raw.get("batch", False))
    if message["stop_reason"] in ("refusal", "max_tokens"):
        raise RuntimeError(f"stop_reason={message['stop_reason']} (cost ${usd:.3f})")
    text = next(b["text"] for b in message["content"] if b["type"] == "text")
    extraction, filled = lenient_validate(output_model, text)
    record = {
        "chunk_id": job.id, **{k: job.chunk[k] for k in ("section_id", "part", "parts", "first_page", "last_page")},
        "request_hash": job.request_hash, "model": message["model"], "effort": effort,
        "request_id": raw["request_id"], "batch": raw.get("batch", False), "usage": usage,
        "cost_usd": round(usd, 4), "seconds": raw["seconds"], "filled_fields": filled,
        "extraction": to_plain(extraction),
    }
    job.out_path.write_text(json.dumps(record, ensure_ascii=False, indent=1))
    return record


def _report(rec: dict, running_total: float) -> None:
    x = rec["extraction"]
    print(f"  {rec['chunk_id']}: {len(x['rights'])} rights, {len(x['events'])} events, "
          f"{len(x['memberships'])} memberships, {len(x['places'])} places — ${rec['cost_usd']:.3f} "
          f"(total ${running_total:.2f})", flush=True)


def _summary(n: int, failed: list, total: float) -> None:
    print(f"done: {n - len(failed)}/{n} chunk(s) extracted, cost ${total:.2f}")
    for cid, err in failed:
        print(f"  FAILED {cid}: {err[:300]}")


def plan(jobs: list[Job], model: str, effort: str) -> None:
    """Count input tokens (free endpoint) and estimate cost from the pilot's output ratio."""
    todo = [j for j in jobs if not j.is_done()]
    if not todo:
        print("nothing to do: all selected chunks are extracted with the current prompt")
        return
    client = anthropic.Anthropic()
    schema = output_json_schema(build_extraction_model(load_vocab(config.CURATED_DIR / "vocab.yaml")))
    total_in = 0
    for j in todo:
        p = _params(j, model, effort, schema)
        total_in += client.messages.count_tokens(model=model, system=p["system"], messages=p["messages"]).input_tokens
    chars = sum(len(j.user) for j in todo)
    sections = len({j.chunk["section_id"] for j in todo})
    print(f"{len(todo)} chunk(s) from {sections} section(s) to extract ({len(jobs) - len(todo)} done); "
          f"{total_in:,} input tokens, {chars:,} chars")
    # Pilot (Opus 5, high effort): 0.05-0.30 USD per 1000 characters of section text.
    for label, per_kchar in (("narrative", 0.05), ("mixed", 0.12), ("list-heavy", 0.25)):
        usd = chars / 1000 * per_kchar
        print(f"  {label:10} realtime ≈ ${usd:.2f}, batch ≈ ${usd * BATCH_DISCOUNT:.2f} "
              f"(pilot rates at high effort; medium should come in lower)")


def run_realtime(jobs: list[Job], model: str, effort: str, workers: int) -> None:
    output_model = build_extraction_model(load_vocab(config.CURATED_DIR / "vocab.yaml"))
    schema = output_json_schema(output_model)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [j for j in jobs if not j.is_done()]
    print(f"{len(todo)} chunk(s) to extract, {len(jobs) - len(todo)} up to date")
    client = anthropic.Anthropic(max_retries=4)
    total, failed = 0.0, []

    def one(job: Job) -> dict | None:
        try:
            if not job.has_raw():
                started = time.time()
                with client.beta.messages.stream(**_params(job, model, effort, schema),
                                                 betas=[FALLBACK_BETA], fallbacks="default") as stream:
                    message = stream.get_final_message()
                _save_raw(job, json.loads(message.to_json()), getattr(message, "_request_id", None),
                          round(time.time() - started, 1), batch=False)
            return _parse_raw(job, effort, output_model)
        except Exception as e:  # one failing chunk must not stop the others
            failed.append((job.id, f"{type(e).__name__}: {e}"))
            return None

    if todo and (rec := one(todo[0])):  # the first request warms the prompt cache
        total += rec["cost_usd"]
        _report(rec, total)
    with ThreadPoolExecutor(workers) as ex:
        for fut in as_completed([ex.submit(one, j) for j in todo[1:]]):
            if rec := fut.result():
                total += rec["cost_usd"]
                _report(rec, total)
    _summary(len(todo), failed, total)


def _load_batches() -> dict:
    return json.loads(BATCHES_FILE.read_text()) if BATCHES_FILE.exists() else {}


def submit_batch(jobs: list[Job], model: str, effort: str) -> None:
    output_model = build_extraction_model(load_vocab(config.CURATED_DIR / "vocab.yaml"))
    schema = output_json_schema(output_model)
    for job in jobs:  # responses already on disk only need parsing
        if not job.is_done() and job.has_raw():
            _parse_raw(job, effort, output_model)
    batches = _load_batches()
    in_flight = {cid: h for b in batches.values() if not b.get("collected") for cid, h in b["jobs"].items()}
    todo = [j for j in jobs if not j.is_done() and in_flight.get(j.id) != j.request_hash]
    if not todo:
        print("nothing to submit (everything is extracted or already in an open batch)")
        return
    client = anthropic.Anthropic()
    batch = client.messages.batches.create(requests=[
        Request(custom_id=j.id, params=MessageCreateParamsNonStreaming(**_params(j, model, effort, schema)))
        for j in todo
    ])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    batches[batch.id] = {"created": time.strftime("%Y-%m-%d %H:%M:%S"), "model": model, "effort": effort,
                         "jobs": {j.id: j.request_hash for j in todo}}
    BATCHES_FILE.write_text(json.dumps(batches, indent=1))
    print(f"submitted batch {batch.id} with {len(todo)} request(s); collect with --collect --wait")


def collect_batches(jobs: list[Job], effort: str, wait: bool) -> None:
    output_model = build_extraction_model(load_vocab(config.CURATED_DIR / "vocab.yaml"))
    by_id = {j.id: j for j in jobs}
    batches = _load_batches()
    client = anthropic.Anthropic()
    for batch_id, info in batches.items():
        if info.get("collected"):
            continue
        while True:
            batch = client.messages.batches.retrieve(batch_id)
            c = batch.request_counts
            print(f"batch {batch_id}: {batch.processing_status} — processing {c.processing}, succeeded "
                  f"{c.succeeded}, errored {c.errored}, expired {c.expired}", flush=True)
            if batch.processing_status == "ended" or not wait:
                break
            time.sleep(60)
        if batch.processing_status != "ended":
            continue
        total, failed = 0.0, []
        for result in client.messages.batches.results(batch_id):
            job = by_id.get(result.custom_id)
            if job is None or job.request_hash != info["jobs"].get(result.custom_id):
                failed.append((result.custom_id, "request changed since submission, or not in --sections"))
                continue
            if result.result.type != "succeeded":
                failed.append((result.custom_id, f"batch result: {result.result.type}"))
                continue
            _save_raw(job, json.loads(result.result.message.to_json()), None, None, batch=True)
            try:
                rec = _parse_raw(job, effort, output_model)
                total += rec["cost_usd"]
                _report(rec, total)
            except Exception as e:
                failed.append((job.id, f"{type(e).__name__}: {e}"))
        info["collected"] = True
        BATCHES_FILE.write_text(json.dumps(batches, indent=1))
        _summary(len(info["jobs"]), failed, total)
