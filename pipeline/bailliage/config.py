"""Project-wide paths and constants."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = ROOT / "pdf"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
EXTRACTED_DIR = DATA_DIR / "extracted"
CURATED_DIR = DATA_DIR / "curated"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"

YEAR_MIN = 1600
YEAR_MAX = 1632


def source_pdf() -> Path:
    """Return the single source PDF in pdf/."""
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if len(pdfs) != 1:
        raise FileNotFoundError(f"expected exactly one PDF in {PDF_DIR}, found {len(pdfs)}")
    return pdfs[0]
