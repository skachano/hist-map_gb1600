"""Map PDF page numbers to the book's printed page numbers.

The footer OCR gives noisy candidates for each page. The printed number is
`pdf - offset`, where the offset only grows by one for every unnumbered insert
(plates, fold-out maps). A Viterbi pass picks the offsets and inserts that
best explain the candidates.
"""
from __future__ import annotations

from dataclasses import dataclass

MAX_OFFSET = 20

# Costs of explaining a page as numbered (by whether its OCR agrees) or as an insert.
COST_MATCH = 0.0
COST_NO_NUMBER = 0.3     # numbered page whose footer showed no digits
COST_MISMATCH = 1.0      # footer digits disagree with pdf - offset
COST_INSERT_EMPTY = 0.8  # unnumbered insert without body text (plate, map)
COST_INSERT_TEXT = 3.0   # inserts with running text are unlikely


@dataclass(frozen=True)
class PageInfo:
    pdf: int
    candidates: frozenset[int]
    has_text: bool


def fit_page_numbers(pages: list[PageInfo], start_offset: int) -> dict[int, int | None]:
    """Return {pdf_page: printed_page or None for unnumbered inserts}.

    `pages` must be consecutive PDF pages; the first one is numbered with
    `pdf - start_offset`.
    """
    INF = float("inf")
    n_off = MAX_OFFSET + 1
    # cost[o]: best cost so far when the *next* page would be numbered with offset o.
    cost = [INF] * n_off
    cost[start_offset] = 0.0
    back: list[list[tuple[int, bool]]] = []  # per page: for each end offset, (prev offset, is_insert)

    for page in pages:
        new = [INF] * n_off
        choice: list[tuple[int, bool]] = [(-1, False)] * n_off
        for o in range(n_off):
            if cost[o] == INF:
                continue
            # numbered with offset o
            printed = page.pdf - o
            if printed in page.candidates:
                c = COST_MATCH
            elif page.candidates:
                c = COST_MISMATCH
            else:
                c = COST_NO_NUMBER
            if cost[o] + c < new[o]:
                new[o] = cost[o] + c
                choice[o] = (o, False)
            # unnumbered insert: following pages shift by one
            if o + 1 < n_off:
                c = COST_INSERT_TEXT if page.has_text else COST_INSERT_EMPTY
                if cost[o] + c < new[o + 1]:
                    new[o + 1] = cost[o] + c
                    choice[o + 1] = (o, True)
        cost = new
        back.append(choice)

    o = min(range(n_off), key=lambda k: cost[k])
    result: dict[int, int | None] = {}
    for page, choice in zip(reversed(pages), reversed(back)):
        prev, is_insert = choice[o]
        result[page.pdf] = None if is_insert else page.pdf - o
        o = prev
    return dict(sorted(result.items()))
