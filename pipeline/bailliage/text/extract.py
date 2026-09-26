"""Stage 1 orchestrator: PDF -> pages.jsonl, toc.json, sections/, index CSVs."""
from __future__ import annotations

import csv
import json
import re
import shutil
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import pymupdf

from bailliage import config
from bailliage.text import book, clean, indexes, layout, ocr, pagemap, sections, toc

MIN_TEXT_LAYER_CHARS = 200  # below this a numbered page is treated as image-only and OCR'd

OUT_PAGES = config.RAW_DIR / "pages.jsonl"
OUT_TOC = config.RAW_DIR / "toc.json"
OUT_SECTIONS = config.RAW_DIR / "sections"
OUT_GAZETTEER = config.RAW_DIR / "gazetteer_seed.csv"
OUT_PERSONS = config.RAW_DIR / "persons_index.csv"
OUT_GLOSSARY = config.RAW_DIR / "glossary.csv"


def column_lines(page: pymupdf.Page) -> list[str]:
    """Text lines of a two-column page, left column first."""
    blocks = [b for b in page.get_text("blocks") if b[6] == 0]
    if blocks:
        left_x = min(b[0] for b in blocks)
        blocks.sort(key=lambda b: (b[0] > left_x + 0.25 * page.rect.width, b[1]))
    lines = [l for b in blocks for l in b[4].splitlines()]
    return clean.strip_licence(lines, book.LICENCE_PREFIXES)


def _ocr_paragraphs(text: str) -> list[str]:
    """Full-page OCR is only used for the sideways tables: keep one row per line."""
    paras = ["\n".join(clean.normalize_spaces(l) for l in p.splitlines() if l.strip())
             for p in re.split(r"\n\s*\n", text)]
    return [p for p in paras if p]


def build_page_map(doc: pymupdf.Document, text_chars: dict[int, int]) -> dict[int, int | None]:
    body = range(book.BODY_FIRST_PDF, book.BODY_LAST_PDF + 1)
    with ThreadPoolExecutor(8) as ex:
        numbers = dict(zip(body, ex.map(ocr.footer_numbers, [doc[n - 1] for n in body])))
    infos = [pagemap.PageInfo(n, frozenset(numbers[n]), text_chars[n] >= MIN_TEXT_LAYER_CHARS) for n in body]
    return pagemap.fit_page_numbers(infos, start_offset=1)


def run() -> None:
    doc = pymupdf.open(config.source_pdf())
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("reading text layer ...")
    plain = {i + 1: layout.read_page(p, ocr_gaps=False) for i, p in enumerate(doc)}
    printed = build_page_map(doc, {n: t.body_chars for n, t in plain.items()})
    inserts = [n for n, p in printed.items() if p is None]
    print(f"page map: pdf {book.BODY_FIRST_PDF}-{book.BODY_LAST_PDF} -> printed "
          f"{printed[book.BODY_FIRST_PDF]}-{printed[book.BODY_LAST_PDF]}; unnumbered inserts: {inserts}")

    all_pages = list(doc)  # load page objects up front: PyMuPDF is not thread-safe

    def process(n: int) -> dict:
        page = all_pages[n - 1]
        rec = {"pdf": n, "printed": printed.get(n), "kind": None, "paragraphs": [], "notes": [], "ocr_regions": 0}
        if n in book.MAP_PAGES:
            rec.update(kind="map", paragraphs=[f"[map: {book.MAP_PAGES[n]}]"])
        elif n not in printed:
            rec["kind"] = "front" if n < book.BODY_FIRST_PDF else "back"
        elif printed[n] is None:
            rec["kind"] = "plate"
            rec["paragraphs"] = plain[n].paragraphs
        elif printed[n] >= book.BACK_MATTER_FIRST_PRINTED:
            rec.update(kind="back", paragraphs=plain[n].paragraphs + plain[n].notes)
        elif plain[n].body_chars + sum(map(len, plain[n].notes)) < MIN_TEXT_LAYER_CHARS:
            text = ocr.ocr_page_autorotate(page)
            paras = _ocr_paragraphs(text)
            if sum(c.isalnum() for c in text) < MIN_TEXT_LAYER_CHARS:  # title page, blank page
                paras = plain[n].paragraphs
            ocr_used = paras is not plain[n].paragraphs
            rec.update(kind=("ocr" if ocr_used else "text") if paras else "blank",
                       paragraphs=(["[OCR page, sideways table — lower accuracy; verify against the scan]"] + paras)
                       if ocr_used else paras)
        else:
            with ocr.PDF_LOCK:
                pt = layout.read_page(page, ocr_gaps=True)
            rec.update(kind="text", paragraphs=pt.paragraphs, notes=pt.notes, ocr_regions=len(pt.ocr_regions))
        return rec

    print("OCR / layout per page ...")
    with ThreadPoolExecutor(8) as ex:
        records = list(ex.map(process, range(1, doc.page_count + 1)))
    with OUT_PAGES.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    by_printed = {r["printed"]: r for r in records if r["printed"]}

    def pdf_of(printed_page: int) -> pymupdf.Page:
        return doc[by_printed[printed_page]["pdf"] - 1]

    def lines_in(rng: tuple[int, int]) -> list[str]:
        return [l for p in range(rng[0], rng[1] + 1) if p in by_printed for l in column_lines(pdf_of(p))]

    # Table of contents
    toc_lines = [l for p in range(book.TOC_PAGES[0], book.TOC_PAGES[1] + 1) if p in by_printed
                 for l in pdf_of(p).get_text().splitlines()]
    entries = toc.parse_toc(toc_lines)
    OUT_TOC.write_text(json.dumps([e.as_dict() for e in entries], ensure_ascii=False, indent=1))
    n_sections = sum(e.kind == "section" for e in entries)
    print(f"toc: {len(entries)} entries, {n_sections} sections")

    # Sections
    body_pages = [sections.Page(r["pdf"], r["printed"], r["paragraphs"], r["notes"])
                  for r in records if r["printed"] and r["kind"] in ("text", "ocr", "blank")
                  and r["printed"] < book.PLACE_INDEX_PAGES[0]]
    secs = sections.split_sections(body_pages, entries)
    if OUT_SECTIONS.exists():
        shutil.rmtree(OUT_SECTIONS)
    OUT_SECTIONS.mkdir()
    index = []
    for s in secs:
        e = s.entry
        slug = re.sub(r"[^a-z0-9]+", "-", clean_ascii(e.title).lower()).strip("-")[:60]
        name = f"{e.id}_{slug}.txt"
        header = (f"# {e.id} — {e.number}. {e.title}\n"
                  f"# Livre {e.livre}, chapitre {e.chapter}: {e.chapter_title}\n"
                  f"# Printed pages {s.first_page}–{s.last_page}\n\n")
        (OUT_SECTIONS / name).write_text(header + s.text + "\n")
        index.append({"id": e.id, "file": name, "title": e.title, "chapter_title": e.chapter_title,
                      "livre": e.livre, "chapter": e.chapter, "number": e.number,
                      "toc_page": e.page, "first_page": s.first_page, "last_page": s.last_page,
                      "heading_found": s.heading_found, "chars": len(s.text)})
    for key, text in sections.chapter_notes(body_pages, secs).items():
        (OUT_SECTIONS / f"{key}-notes.txt").write_text(f"# {key} — endnotes\n\n{text}\n")
    (OUT_SECTIONS / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    missing = [i["id"] for i in index if not i["heading_found"]]
    print(f"sections: {len(secs)} written; heading not located (cut at page top): {missing or 'none'}")

    # Indexes
    places = [indexes.parse_place_entry(e) for e in indexes.group_entries(lines_in(book.PLACE_INDEX_PAGES))]
    with OUT_GAZETTEER.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "variants", "see", "dept_code", "department", "country", "canton", "pages", "raw"])
        for p in places:
            w.writerow([p.name, "|".join(p.variants), p.see or "", p.dept_code or "", p.department or "",
                        p.country or "", p.canton or "", " ".join(map(str, p.pages)), p.raw])
    persons = [indexes.parse_person_entry(e) for e in indexes.group_entries(lines_in(book.PERSON_INDEX_PAGES))]
    with OUT_PERSONS.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "pages"])
        w.writerows([n, " ".join(map(str, pg))] for n, pg in persons)
    gloss = [indexes.parse_glossary_entry(e) for e in indexes.group_entries(lines_in(book.GLOSSARY_PAGES))]
    with OUT_GLOSSARY.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["term", "gloss", "pages"])
        w.writerows([t, g, " ".join(map(str, pg))] for t, g, pg in gloss)
    print(f"indexes: {len(places)} places, {len(persons)} persons, {len(gloss)} glossary terms")

    kinds: dict[str, int] = {}
    for r in records:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"page kinds: {kinds}; regions OCR'd: {sum(r['ocr_regions'] for r in records)}")


def clean_ascii(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
