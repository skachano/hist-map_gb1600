"""Split long sections into chunks the model can answer without hitting the
output cap. Chunks break at paragraph boundaries and each one starts with the
"[p. N]" marker of the page it begins on, so citations stay correct."""
from __future__ import annotations

import re
from dataclasses import dataclass

MAX_CHARS = 5000
_MARKER = re.compile(r"^\[p\. (\d+)\]$")


@dataclass
class Chunk:
    text: str
    first_page: int
    last_page: int


def _pieces(paragraph: str, max_chars: int) -> list[str]:
    """A paragraph longer than max_chars is cut at line breaks, then sentence ends."""
    if len(paragraph) <= max_chars:
        return [paragraph]
    parts = paragraph.split("\n") if "\n" in paragraph else re.split(r"(?<=[.;]) ", paragraph)
    out, buf = [], ""
    for part in parts:
        sep = "\n" if "\n" in paragraph else " "
        if buf and len(buf) + len(part) + 1 > max_chars:
            out.append(buf)
            buf = part
        else:
            buf = f"{buf}{sep}{part}" if buf else part
    if buf:
        out.append(buf)
    return out


def split_section(text: str, first_page: int, max_chars: int = MAX_CHARS) -> list[Chunk]:
    body = "\n".join(l for l in text.splitlines() if not l.startswith("# ")).strip()
    chunks: list[Chunk] = []
    page = first_page           # page of the text being read
    buf: list[str] = []         # paragraphs (and markers) of the chunk being built
    buf_first = content_page = page

    def flush():
        nonlocal buf
        while buf and _MARKER.match(buf[-1]):  # a marker with no text after it belongs to the next chunk
            buf.pop()
        if buf:
            chunks.append(Chunk("\n\n".join(buf), buf_first, content_page))
        buf = []

    for para in body.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if m := _MARKER.match(para):
            page = int(m.group(1))
            if buf:
                buf.append(para)
            continue
        for piece in _pieces(para, max_chars):
            if buf and sum(map(len, buf)) + len(piece) > max_chars:
                flush()
            if not buf:
                buf_first = page
                buf.append(f"[p. {page}]")
            buf.append(piece)
            content_page = page
    flush()
    return chunks
