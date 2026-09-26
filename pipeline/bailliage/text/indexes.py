"""Parse the back-matter indexes: places (gazetteer seed), persons, glossary."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from bailliage.text import clean

DEPARTMENTS = {
    "M.": ("Moselle", "FR"),
    "MM.": ("Meurthe-et-Moselle", "FR"),
    "B.": ("Bas-Rhin", "FR"),
    "S.": ("Saarland", "DE"),
    "R.": ("Rheinland-Pfalz", "DE"),
}

_PAGE_CHARS = set("0123456789 ,.;-")
_HEADERS = ("Table des noms", "Abréviations", "(Allemagne)", "Glossaire")


def group_entries(lines: list[str]) -> list[str]:
    """Merge wrapped index lines into one string per entry."""
    entries: list[list[str]] = []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(_HEADERS):
            continue
        prev = " ".join(entries[-1]) if entries else ""
        continues = bool(entries) and (
            line[0].isdigit() or line[0].islower() or line[0] in "()-–—="
            or prev.count("(") > prev.count(")")
            or prev.endswith((",", "-", "=", "—"))
        )
        if continues:
            entries[-1].append(line)
        else:
            entries.append([line])
    return [clean.dehyphenate(e) for e in entries]


def parse_pages(text: str) -> list[int]:
    pages: list[int] = []
    for a, b in re.findall(r"(\d{1,3})(?:\s*-\s*(\d{1,3}))?", text):
        start = int(a)
        end = int(b) if b else start
        if end < start:  # "50-2" style abbreviations do not occur, but guard anyway
            end = start
        pages.extend(range(start, end + 1))
    return pages


def split_pages(entry: str) -> tuple[str, list[int]]:
    """Split "Name (loc) 12, 14-16" into ("Name (loc)", [12, 14, 15, 16])."""
    i = len(entry)
    while i > 0 and entry[i - 1] in _PAGE_CHARS:  # linear scan: no regex backtracking
        i -= 1
    tail = entry[i:]
    if i == 0 or not re.search(r"\d", tail):
        return entry.strip(), []
    return entry[:i].strip(" ,"), parse_pages(tail)


@dataclass
class PlaceIndexEntry:
    name: str
    variants: list[str] = field(default_factory=list)
    see: str | None = None
    dept_code: str | None = None
    canton: str | None = None
    pages: list[int] = field(default_factory=list)
    raw: str = ""

    @property
    def department(self) -> str | None:
        return DEPARTMENTS.get(self.dept_code, (None, None))[0]

    @property
    def country(self) -> str | None:
        return DEPARTMENTS.get(self.dept_code, (None, None))[1]


_LOC = re.compile(r"\(\s*([A-Za-z]{1,3}\s?\.?)\s*,?\s*([^)]*)\)")
# OCR misreadings of the department abbreviations.
_DEPT_ALIASES = {"Mo": "M.", "M": "M.", "IVI.": "M.", "M .": "M.", "MM": "MM.", "B": "B.", "S": "S.", "R": "R."}


def parse_place_entry(entry: str) -> PlaceIndexEntry:
    head, pages = split_pages(entry)
    dept_code = canton = None
    for loc in _LOC.finditer(head):
        code = _DEPT_ALIASES.get(loc.group(1).strip(), loc.group(1).strip())
        if code in DEPARTMENTS:
            dept_code, canton = code, loc.group(2).strip() or None
            head = (head[: loc.start()] + head[loc.end():]).strip()
            break
    see = None
    if "=" in head:
        head, see = (p.strip() for p in head.split("=", 1))
    names = [n.strip() for n in head.split(",") if n.strip()]
    return PlaceIndexEntry(
        name=names[0] if names else head,
        variants=names[1:],
        see=see or None,
        dept_code=dept_code,
        canton=canton,
        pages=pages,
        raw=entry,
    )


def parse_person_entry(entry: str) -> tuple[str, list[int]]:
    return split_pages(entry)


def parse_glossary_entry(entry: str) -> tuple[str, str, list[int]]:
    head, pages = split_pages(entry)
    term, _, gloss = head.partition(",")
    return term.strip(), gloss.strip(" ,"), pages
