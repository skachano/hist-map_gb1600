"""Pure text-cleanup helpers for the OCR layer (no PDF access, easy to test)."""
from __future__ import annotations

import re

# Words that follow a hyphen in compound place names ("Kerling-lès-Sierck",
# "Hombourg-sur-Canner"); a line break after such a hyphen keeps the hyphen.
_COMPOUND_PARTICLES = {
    "lès", "les", "lez", "sur", "sous", "en", "le", "la", "aux", "au", "devant",
    "de", "du", "des", "et", "am", "an", "bei", "im", "auf", "der", "von",
}

_LETTERSPACED = re.compile(r"(?:\b\w ){3,}\w\b")


def is_letterspaced(text: str) -> bool:
    """True when a line contains a run of 4+ single characters separated by spaces."""
    return bool(_LETTERSPACED.search(text))


def join_letterspaced(chars: list[tuple[str, float, float]], font_size: float) -> str:
    """Rebuild words from glyphs of a letter-spaced line.

    `chars` holds (glyph, x0, x1) for the non-space glyphs of one line, in
    reading order. Inside a word the gap between glyphs is about 0.1 em, between
    words about 0.4 em, so a threshold of 0.25 em separates them.
    """
    if not chars:
        return ""
    threshold = 0.25 * font_size
    out = [chars[0][0]]
    for (_, _, prev_x1), (c, x0, _) in zip(chars, chars[1:]):
        if x0 - prev_x1 > threshold:
            out.append(" ")
        out.append(c)
    return "".join(out)


def dehyphenate(lines: list[str]) -> str:
    """Join the lines of one paragraph, undoing end-of-line hyphenation."""
    text = ""
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if not text:
            text = line
        elif text.endswith("-") and not text.endswith(" -"):
            first_word = re.match(r"\w*", line).group()
            if first_word[:1].islower() and first_word not in _COMPOUND_PARTICLES:
                text = text[:-1] + line  # "Féné-" + "trange" -> "Fénétrange"
            else:
                text = text + line  # "Saint-" + "Avold", "Kerling-" + "lès-Sierck"
        else:
            text = text + " " + line
    return normalize_spaces(text)


def normalize_spaces(text: str) -> str:
    text = text.replace(" ", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" ([,.)])", r"\1", text)  # keep French spacing before ; and :
    text = re.sub(r"\( ", "(", text)
    return text.strip()


def strip_licence(lines: list[str], prefixes: tuple[str, ...]) -> list[str]:
    return [l for l in lines if not l.strip().startswith(prefixes)]
