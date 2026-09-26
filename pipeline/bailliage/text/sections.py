"""Split the page stream into TOC sections with inline [p. N] citation markers."""
from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass, field

from bailliage.text.toc import TocEntry, roman_to_int

# OCR renders the roman numeral "I" of headings as "/" or "1" at times.
_HEADING = re.compile(r"^\s*([IVXl/1]{1,5})\s*[.,]+\s*(.+)", re.S)
_CHAPTER_START = re.compile(r"^\s*(Chapitre\s+(premier|[IVX]+)|Livre\s+(premier|deuxième|troisième))\b", re.I)
MATCH_RATIO = 0.6         # title similarity when the numeral matches
STRICT_MATCH_RATIO = 0.85  # title similarity when the numeral is unreadable


@dataclass
class Page:
    pdf: int
    printed: int
    paragraphs: list[str]
    notes: list[str] = field(default_factory=list)


@dataclass
class Section:
    entry: TocEntry
    first_page: int
    last_page: int
    text: str
    heading_found: bool


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _numeral(raw: str) -> int | None:
    """Section numeral as printed, tolerating OCR confusions of I with / 1 l."""
    fixed = re.sub(r"[/1l]", "I", raw)
    return roman_to_int(fixed) if re.fullmatch(r"[IVX]+", fixed) else None


def _is_heading_for(paragraph: str, entry: TocEntry) -> bool:
    m = _HEADING.match(paragraph)
    if not m:
        return False
    title = _norm(entry.title)
    probe = min(len(title), 30)
    ratio = difflib.SequenceMatcher(None, _norm(m.group(2))[:probe], title[:probe]).ratio()
    number = _numeral(m.group(1))
    if number is None:  # numeral unreadable: rely on the title alone
        return ratio >= STRICT_MATCH_RATIO
    return number == entry.number and ratio >= MATCH_RATIO


def split_sections(pages: list[Page], entries: list[TocEntry]) -> list[Section]:
    """Locate each section heading near its TOC page and cut the stream there."""
    # Flatten into (page_index, paragraph_index) positions.
    positions = [(pi, qi) for pi, p in enumerate(pages) for qi in range(len(p.paragraphs))]
    by_printed = {p.printed: i for i, p in enumerate(pages)}

    starts: list[tuple[TocEntry, int, bool]] = []  # (entry, position index, found)
    cursor = 0
    ordered = sorted(entries, key=lambda e: e.page)
    for e in ordered:
        page_idx = by_printed.get(e.page)
        if page_idx is None:
            continue
        found = None
        if e.kind == "section":
            window = {by_printed.get(e.page + d) for d in (-1, 0, 1)} - {None}
            for k in range(cursor + 1 if starts else 0, len(positions)):
                pi, qi = positions[k]
                if pi > max(window):
                    break
                if pi in window and _is_heading_for(pages[pi].paragraphs[qi], e):
                    found = k
                    break
        ok = found is not None
        if found is None:  # fall back to the top of the TOC page
            found = next((k for k in range(cursor, len(positions)) if positions[k][0] >= page_idx), len(positions))
        starts.append((e, found, ok))
        cursor = found

    sections: list[Section] = []
    for (entry, start, ok), nxt in zip(starts, starts[1:] + [(None, len(positions), False)]):
        if entry.kind != "section":
            continue
        end = nxt[1]
        # Stop before the next chapter/livre title, which belongs to what follows.
        for k in range(start + 1, end):
            pi, qi = positions[k]
            if _CHAPTER_START.match(pages[pi].paragraphs[qi]):
                end = k
                break
        text_parts: list[str] = []
        last_pi = None
        for k in range(start, end):
            pi, qi = positions[k]
            if pi != last_pi:
                text_parts.append(f"[p. {pages[pi].printed}]")
                last_pi = pi
            text_parts.append(pages[pi].paragraphs[qi])
        first = pages[positions[start][0]].printed if start < len(positions) else entry.page
        last = pages[positions[end - 1][0]].printed if end > start else first
        sections.append(Section(entry, first, last, "\n\n".join(text_parts), ok))
    return sections


def chapter_notes(pages: list[Page], sections: list[Section]) -> dict[str, str]:
    """Endnotes grouped per chapter (they are printed at the end of each chapter)."""
    chapters: dict[str, tuple[int, int]] = {}
    for s in sections:
        key = f"L{s.entry.livre}-C{s.entry.chapter:02d}"
        lo, hi = chapters.get(key, (s.first_page, s.last_page))
        chapters[key] = (min(lo, s.first_page), max(hi, s.last_page))
    out: dict[str, str] = {}
    for key, (lo, hi) in chapters.items():
        parts: list[str] = []
        for p in pages:
            if lo <= p.printed <= hi and p.notes:
                parts.append(f"[p. {p.printed}]")
                parts.extend(p.notes)
        out[key] = "\n\n".join(parts)
    return out
