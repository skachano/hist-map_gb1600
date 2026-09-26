"""Read one PDF page's text layer into body paragraphs and endnotes."""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field

import pymupdf

from bailliage.text import clean, ocr
from bailliage.text.book import LICENCE_PREFIXES

# The OCR layer's font sizes are unreliable (body text is often tagged 6 pt), so
# endnotes are told apart by geometry: body lines sit ~7.2 pt apart with ~3.2 pt
# per character, endnote lines ~5.8 pt apart with ~2.6 pt per character.
NOTE_MAX_PITCH = 6.35
NOTE_MAX_CHAR_WIDTH = 2.85
NOTE_MAX_WIDTH_RATIO = 0.6  # endnotes are set in two columns; small full-width text is body
PARA_INDENT = 6.0          # first-line indent that opens a new paragraph
PARA_SHORT_LINE = 25.0     # a line ending this far before the right edge closes a paragraph
SUPERSCRIPT_RATIO = 0.8    # note calls are set noticeably smaller than their line
# Parts of some pages (tables, chapter titles, even whole paragraphs) are missing
# from the text layer. Any empty vertical stretch of the text area taller than
# GAP_MIN is OCR'd; results shorter than GAP_MIN_CHARS (true whitespace) are dropped.
GAP_MIN = 60.0
GAP_MIN_CHARS = 40
GAP_MIN_CONFIDENCE = 70.0  # paper show-through OCRs as gibberish with low word confidence
TEXT_TOP = 0.09     # text area, as fractions of the page height (footer number sits at ~0.93)
TEXT_BOTTOM = 0.88
BASELINE_TOLERANCE = 1.5  # pt; fragments of one justified line share a baseline


@dataclass
class PageText:
    paragraphs: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)   # endnote blocks, in reading order
    ocr_regions: list[str] = field(default_factory=list)  # OCR of stretches missing from the text layer

    @property
    def body_chars(self) -> int:
        return sum(len(p) for p in self.paragraphs)


def _line_text(line: dict) -> str:
    """Text of one line: note calls as [n], letter-spaced runs rebuilt from glyph positions."""
    spans = line["spans"]
    if not spans:
        return ""
    max_size = max(s["size"] for s in spans)
    parts: list[str] = []
    for s in spans:
        text = "".join(c["c"] for c in s["chars"])
        if s["size"] < SUPERSCRIPT_RATIO * max_size and text.strip().isdigit():
            parts.append(f" [{text.strip()}]")
        else:
            parts.append(text)
    joined = "".join(parts)
    if clean.is_letterspaced(joined):
        glyphs = [(c["c"], c["bbox"][0], c["bbox"][2]) for s in spans for c in s["chars"] if c["c"] != " "]
        joined = clean.join_letterspaced(glyphs, max_size)
    return joined


def _is_note_block(block: dict, texts: list[str], page_width: float) -> bool:
    lines = block["lines"]
    if block["bbox"][2] - block["bbox"][0] > NOTE_MAX_WIDTH_RATIO * page_width:
        return False
    ys = [l["bbox"][1] for l in lines]
    if len(ys) > 1:
        return statistics.median(b - a for a, b in zip(ys, ys[1:])) < NOTE_MAX_PITCH
    width = sum(l["bbox"][2] - l["bbox"][0] for l in lines)
    return width / max(1, len("".join(texts))) < NOTE_MAX_CHAR_WIDTH


def _paragraphs(block: dict, texts: list[str]) -> list[list[str]]:
    """Split a block's lines into paragraphs at first-line indents and short lines."""
    lines = block["lines"]
    left = statistics.median(l["bbox"][0] for l in lines)
    right = max(l["bbox"][2] for l in lines)
    paras: list[list[str]] = []
    prev_short = True
    for l, text in zip(lines, texts):
        if not text.strip():
            continue
        indented = l["bbox"][0] - left > PARA_INDENT
        if prev_short or indented or not paras:
            paras.append([])
        paras[-1].append(text)
        prev_short = right - l["bbox"][2] > PARA_SHORT_LINE
    return paras


def _merge_baselines(lines: list[dict], texts: list[str]) -> tuple[list[dict], list[str]]:
    """Join fragments that the OCR layer split off one physical line."""
    merged: list[dict] = []
    merged_texts: list[str] = []
    for l, t in zip(lines, texts):
        if merged and abs(l["bbox"][1] - merged[-1]["bbox"][1]) < BASELINE_TOLERANCE:
            a, b = merged[-1]["bbox"], l["bbox"]
            merged[-1] = {**merged[-1], "bbox": (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))}
            merged_texts[-1] = merged_texts[-1].rstrip() + " " + t.lstrip()
        else:
            merged.append(l)
            merged_texts.append(t)
    return merged, merged_texts


def _uncovered(intervals: list[tuple[float, float]], top: float, bottom: float) -> list[tuple[float, float]]:
    """Vertical stretches of [top, bottom] taller than GAP_MIN not covered by any interval."""
    gaps: list[tuple[float, float]] = []
    cursor = top
    for y0, y1 in sorted(intervals):
        if y0 - cursor > GAP_MIN:
            gaps.append((cursor, y0))
        cursor = max(cursor, y1)
    if bottom - cursor > GAP_MIN:
        gaps.append((cursor, bottom))
    return gaps


def read_page(page: pymupdf.Page, ocr_gaps: bool = True) -> PageText:
    out = PageText()
    raw = page.get_text("rawdict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    body_blocks: list[dict] = []
    note_blocks: list[dict] = []
    for b in raw["blocks"]:
        if b["type"] != 0 or not b["lines"]:
            continue
        b["lines"] = [l for l in b["lines"] if not _line_text(l).strip().startswith(LICENCE_PREFIXES)]
        lines, texts = _merge_baselines(b["lines"], [_line_text(l) for l in b["lines"]])
        if not any(t.strip() for t in texts):
            continue
        b["lines"], b["_texts"] = lines, texts
        (note_blocks if _is_note_block(b, texts, page.rect.width) else body_blocks).append(b)

    # Body flow: paragraphs of body blocks plus OCR of uncovered stretches, top to bottom.
    flow: list[tuple[float, list[str]]] = [
        (b["bbox"][1], [clean.dehyphenate(p) for p in _paragraphs(b, b["_texts"])]) for b in body_blocks
    ]
    if ocr_gaps:
        blocks = body_blocks + note_blocks
        h, w = page.rect.height, page.rect.width
        x0 = min((b["bbox"][0] for b in blocks), default=w * 0.1)
        x1 = max((b["bbox"][2] for b in blocks), default=w * 0.9)
        for y0, y1 in _uncovered([(b["bbox"][1], b["bbox"][3]) for b in blocks], h * TEXT_TOP, h * TEXT_BOTTOM):
            text, conf = ocr.ocr_region(page, pymupdf.Rect(x0 - 5, y0, x1 + 5, y1))
            text = text.strip()
            if sum(c.isalnum() for c in text) >= GAP_MIN_CHARS and conf >= GAP_MIN_CONFIDENCE:
                out.ocr_regions.append(text)
                flow.append((y0, [f"[OCR region]\n{text}\n[/OCR region]"]))
    for _, paras in sorted(flow, key=lambda f: f[0]):
        out.paragraphs.extend(paras)

    # Endnotes are set in two columns: read the left column top-down, then the right.
    if note_blocks:
        left_x = min(b["bbox"][0] for b in note_blocks)
        note_blocks.sort(key=lambda b: (b["bbox"][0] > left_x + 0.25 * page.rect.width, b["bbox"][1]))
    out.notes = [clean.dehyphenate(b["_texts"]) for b in note_blocks]
    return out
