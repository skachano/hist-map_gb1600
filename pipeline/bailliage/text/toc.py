"""Parse the printed Table des matières into a list of sections."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass

from bailliage.text import clean

_LIVRE = re.compile(r"^LIVRE\s+(PREMIER|II|III)\b", re.I)
_CHAPITRE = re.compile(r"^Chapitre\s+(premier|[IVX]+)\.\s*(.*)$", re.I)
_SECTION = re.compile(r"^([IVX]+)\s*\.+\s*(.*)$")
_PAGE_AT_END = re.compile(r"^(.*?)[\s.]*\b(\d{1,3})$")
_LIVRE_NUM = {"PREMIER": 1, "II": 2, "III": 3}
_OTHER = ("Avant-Propos", "Conclusion", "Bibliographie", "Table des noms", "Glossaire",
          "Table des gravures", "Table des matières")


@dataclass
class TocEntry:
    kind: str                 # "section" | "other"
    title: str
    page: int                 # printed start page
    livre: int | None = None
    chapter: int | None = None
    number: int | None = None  # section number (from the roman numeral)
    chapter_title: str | None = None

    @property
    def id(self) -> str:
        if self.kind == "section":
            return f"L{self.livre}-C{self.chapter:02d}-S{self.number:02d}"
        return re.sub(r"[^a-z]+", "-", self.title.lower()).strip("-")

    def as_dict(self) -> dict:
        return {"id": self.id, **asdict(self)}


def roman_to_int(s: str) -> int:
    vals = {"I": 1, "V": 5, "X": 10, "L": 50}
    total = 0
    for a, b in zip(s, s[1:] + " "):
        total += -vals[a] if vals.get(b, 0) > vals[a] else vals[a]
    return total


def parse_toc(lines: list[str]) -> list[TocEntry]:
    entries: list[TocEntry] = []
    livre = chapter = None
    chapter_buf: list[str] | None = None  # chapter title lines, while reading them
    buf: list[str] = []                    # title lines of the current entry
    current: dict | None = None            # kind/number of the current entry
    skip_subtitle = False

    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("Table des Mati") or line.startswith("IMPRIMERIE"):
            continue
        if skip_subtitle:
            skip_subtitle = False
            continue
        if m := _LIVRE.match(line):
            livre, skip_subtitle = _LIVRE_NUM[m.group(1).upper()], True
            continue
        if m := _CHAPITRE.match(line):
            chapter = 1 if m.group(1).lower() == "premier" else roman_to_int(m.group(1).upper())
            chapter_buf = [m.group(2)]
            continue
        if m := _SECTION.match(line):
            current, buf = {"kind": "section", "number": roman_to_int(m.group(1))}, []
            line = m.group(2)
        elif line.startswith(_OTHER):
            current, buf = {"kind": "other", "number": None}, []
        elif current is None and chapter_buf is not None:
            chapter_buf.append(line)  # chapter title continues on the next line
            continue
        if current is None:
            continue
        m = _PAGE_AT_END.match(line) if line else None
        if m:
            if m.group(1):
                buf.append(m.group(1))
            is_section = current["kind"] == "section"
            entries.append(TocEntry(
                kind=current["kind"],
                title=clean.dehyphenate(buf).rstrip(" ."),
                page=int(m.group(2)),
                livre=livre if is_section else None,
                chapter=chapter if is_section else None,
                number=current["number"],
                chapter_title=clean.dehyphenate(chapter_buf).rstrip(" .") if is_section and chapter_buf else None,
            ))
            current, buf = None, []
        elif line:
            buf.append(line)
    return entries
