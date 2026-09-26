"""Tesseract OCR helpers, with an on-disk cache so re-runs are fast."""
from __future__ import annotations

import hashlib
import io
import json
import re
import threading

import pymupdf
import pytesseract
from PIL import Image

from bailliage import config

CACHE_DIR = config.RAW_DIR / "ocr_cache"
LANGS = "fra+deu"

# PyMuPDF is not thread-safe: every document access goes through this lock,
# while the (slow) tesseract subprocesses run in parallel.
PDF_LOCK = threading.RLock()


def _cached(key: str, compute) -> str:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")
    if path.exists():
        return json.loads(path.read_text())["text"]
    text = compute()
    path.write_text(json.dumps({"key": key, "text": text}, ensure_ascii=False))
    return text


def _render(page: pymupdf.Page, clip: pymupdf.Rect | None, dpi: int) -> Image.Image:
    with PDF_LOCK:
        pix = page.get_pixmap(dpi=dpi, clip=clip, colorspace=pymupdf.csGRAY)
    return Image.open(io.BytesIO(pix.tobytes("png")))


def footer_numbers(page: pymupdf.Page) -> set[int]:
    """Digits found in the footer strip, where the printed page number sits."""
    r = page.rect
    clip = pymupdf.Rect(r.width * 0.05, r.height * 0.88, r.width * 0.95, r.height * 0.97)

    def compute() -> str:
        img = _render(page, clip, 300).point(lambda v: 255 if v > 150 else 0)
        return pytesseract.image_to_string(img, config="--psm 11 -c tessedit_char_whitelist=0123456789")

    text = _cached(f"footer:{page.number}", compute)
    return {int(d) for d in re.findall(r"\d{1,3}", text)}


def ocr_region(page: pymupdf.Page, clip: pymupdf.Rect | None = None, psm: int = 6) -> tuple[str, float]:
    """OCR a page region in French+German; returns (text, mean word confidence 0-100)."""
    key = f"region-conf:{page.number}:{tuple(round(v) for v in clip) if clip else None}:{psm}"

    def compute() -> str:
        img = _render(page, clip, 300)
        data = pytesseract.image_to_data(img, lang=LANGS, config=f"--psm {psm}", output_type=pytesseract.Output.DICT)
        confs = [float(c) for c, w in zip(data["conf"], data["text"]) if w.strip() and float(c) >= 0]
        text = pytesseract.image_to_string(img, lang=LANGS, config=f"--psm {psm}")
        return json.dumps({"text": text, "conf": sum(confs) / len(confs) if confs else 0.0})

    result = json.loads(_cached(key, compute))
    return result["text"], result["conf"]


def ocr_page_autorotate(page: pymupdf.Page) -> str:
    """OCR a full page, first detecting 90/180/270° rotation (sideways tables)."""

    def compute() -> str:
        img = _render(page, None, 300)
        try:
            osd = pytesseract.image_to_osd(img, config="--psm 0")
            angle = int(re.search(r"Rotate: (\d+)", osd).group(1))
        except (pytesseract.TesseractError, AttributeError):
            angle = 0
        if angle:
            img = img.rotate(-angle, expand=True)
        return pytesseract.image_to_string(img, lang=LANGS, config="--psm 6")

    return _cached(f"page:{page.number}", compute)

