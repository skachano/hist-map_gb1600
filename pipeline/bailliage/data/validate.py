"""Integrity and plausibility checks for the curated dataset."""
from __future__ import annotations

from collections import defaultdict
from itertools import combinations

from bailliage.data.models import Period, Right, share_value
from bailliage.data.store import LANGS, Dataset, Issue

# Statuses that make overlapping holders of the same right expected rather than suspicious.
CONTESTED_STATUSES = {"claimed", "contested"}


def validate(ds: Dataset) -> list[Issue]:
    issues = list(ds.issues)

    def err(table, row, msg):
        issues.append(Issue("error", table, row, msg))

    def warn(table, row, msg):
        issues.append(Issue("warning", table, row, msg))

    # --- vocabulary ----------------------------------------------------------
    for vocab_name, terms in ds.vocab.items():
        for key, labels in terms.items():
            missing = [lang for lang in LANGS if not labels.get(lang)]
            if missing:
                err("vocab", None, f"{vocab_name}.{key} lacks labels: {missing}")
    for table in ("places", "entities", "rulers", "memberships", "rights", "events"):
        for line, row in getattr(ds, table):
            for fld, vocab_name in row.vocab_fields.items():
                value = getattr(row, fld)
                if value is not None and value not in ds.vocab.get(vocab_name, {}):
                    err(table, line, f"{fld} '{value}' is not in vocab.{vocab_name}")

    # --- identifiers and foreign keys ---------------------------------------
    place_ids = _unique_ids(ds.places, "places", err)
    entity_ids = _unique_ids(ds.entities, "entities", err)
    places = {p.id: p for _, p in ds.places}

    for line, p in ds.places:
        applies = ds.vocab.get("place_types", {}).get(p.place_type, {}).get("applies_to", "any")
        if applies not in ("any", p.kind):
            warn("places", line, f"place_type '{p.place_type}' is meant for {applies}, but kind is {p.kind}")
        if (p.lat is None) != (p.lon is None):
            err("places", line, "lat and lon must be given together")

    def check_fk(table, line, fld, value, ids, target):
        if value is not None and value not in ids:
            err(table, line, f"{fld} '{value}' not found in {target}")

    for line, r in ds.rulers:
        check_fk("rulers", line, "entity_id", r.entity_id, entity_ids, "entities")
    for line, m in ds.memberships:
        check_fk("memberships", line, "child_id", m.child_id, place_ids, "places")
        check_fk("memberships", line, "parent_id", m.parent_id, place_ids, "places")
        if m.child_id in places and places[m.child_id].kind == "territory" and \
                m.parent_id in places and places[m.parent_id].kind == "settlement":
            err("memberships", line, "a territory cannot belong to a settlement")
    for line, r in ds.rights:
        check_fk("rights", line, "place_id", r.place_id, place_ids, "places")
        check_fk("rights", line, "holder_id", r.holder_id, entity_ids, "entities")
        for other in r.disputed_with:
            check_fk("rights", line, "disputed_with", other, entity_ids, "entities")
    for line, e in ds.events:
        check_fk("events", line, "place_id", e.place_id, place_ids, "places")
        check_fk("events", line, "from_holder", e.from_holder, entity_ids, "entities")
        check_fk("events", line, "to_holder", e.to_holder, entity_ids, "entities")

    # --- provenance ------------------------------------------------------------
    for table in ("rulers", "memberships", "rights", "events"):
        for line, row in getattr(ds, table):
            if not row.source_page:
                err(table, line, "source_page is required for facts")

    # --- periods -------------------------------------------------------------
    for table in ("rulers", "memberships", "rights"):
        for line, row in getattr(ds, table):
            if not row.touches_app_range():
                warn(table, line, f"period {row.from_year}-{row.to_year} lies outside 1600-1632")

    _check_membership_cycles(ds, err)
    _check_rights(ds, err, warn)
    _check_events(ds, warn)
    return issues


def _unique_ids(rows, table, err) -> set[str]:
    seen: dict[str, int] = {}
    for line, row in rows:
        if row.id in seen:
            err(table, line, f"duplicate id '{row.id}' (first on line {seen[row.id]})")
        seen.setdefault(row.id, line)
    return set(seen)


def _check_membership_cycles(ds: Dataset, err) -> None:
    parents = defaultdict(set)
    for _, m in ds.memberships:
        parents[m.child_id].add(m.parent_id)

    def reaches(start: str, target: str, seen: set[str]) -> bool:
        for p in parents.get(start, ()):
            if p == target or (p not in seen and reaches(p, target, seen | {p})):
                return True
        return False

    for line, m in ds.memberships:
        if m.child_id == m.parent_id or reaches(m.parent_id, m.child_id, {m.parent_id}):
            err("memberships", line, f"membership cycle through '{m.child_id}'")


def _is_handover(a: Period, b: Period) -> bool:
    """One period ends in the year the other starts: a transfer, not an overlap."""
    return a.overlaps(b) == 1 and (a.to_year == b.from_year or b.to_year == a.from_year)


def _check_rights(ds: Dataset, err, warn) -> None:
    by_key: dict[tuple[str, str], list[tuple[int, Right]]] = defaultdict(list)
    for line, r in ds.rights:
        if r.is_disputed and not r.disputed_with:
            warn("rights", line, "is_disputed is set but disputed_with is empty")
        if r.disputed_with and not r.is_disputed:
            warn("rights", line, "disputed_with is given but is_disputed is false")
        if r.holder_id in r.disputed_with:
            err("rights", line, "holder is listed in its own disputed_with")
        by_key[(r.place_id, r.right_type)].append((line, r))

    for (place, right), rows in by_key.items():
        for (la, a), (lb, b) in combinations(rows, 2):
            if not a.overlaps(b) or _is_handover(a, b):
                continue
            if a.holder_id == b.holder_id:
                if a.share is None and b.share is None and a.status == b.status:
                    warn("rights", lb, f"duplicates line {la}: same holder of {right} at {place} in overlapping years")
                continue
            if a.share and b.share:
                continue  # co-holding, checked below
            contested = {a.status, b.status} & CONTESTED_STATUSES or a.is_disputed or b.is_disputed
            if not contested:
                warn("rights", lb, f"{right} at {place} overlaps line {la} ({a.holder_id} vs {b.holder_id}) "
                                   "without shares, a claim or a dispute flag")

        # Numeric shares held at the same time must not exceed the whole.
        years = sorted({y for _, r in rows for y in (r.from_year, r.to_year) if y is not None} | {1600, 1632})
        for year in years:
            active = [(l, r) for l, r in rows if r.status in ("held", "pledged") and
                      (r.from_year or 0) <= year <= (r.to_year or 9999)]
            total = sum((share_value(r.share) or 0) for _, r in active)
            if total > 1:
                err("rights", active[-1][0], f"shares of {right} at {place} add up to {total} in {year}")


def _check_events(ds: Dataset, warn) -> None:
    """An ownership change should be mirrored by the rights table."""
    rights_by = defaultdict(list)
    for _, r in ds.rights:
        rights_by[(r.place_id, r.holder_id)].append(r)
    for line, e in ds.events:
        if e.to_holder and e.right_type and not e.from_holder:
            # A confirmation (judgment, treaty) without a transfer: the holder keeps the right.
            holds = [r for r in rights_by[(e.place_id, e.to_holder)] if r.right_type == e.right_type
                     and (r.from_year or 0) <= e.year <= (r.to_year or 9999)]
            if not holds:
                warn("events", line, f"{e.to_holder} does not hold {e.right_type} at {e.place_id} in {e.year}")
        elif e.to_holder and e.right_type:
            starts = [r for r in rights_by[(e.place_id, e.to_holder)]
                      if r.right_type == e.right_type and r.from_year is not None and abs(r.from_year - e.year) <= 1]
            if not starts:
                warn("events", line, f"no {e.right_type} right of {e.to_holder} at {e.place_id} starts around {e.year}")
        if e.from_holder and e.right_type:
            ends = [r for r in rights_by[(e.place_id, e.from_holder)]
                    if r.right_type == e.right_type and r.to_year is not None and abs(r.to_year - e.year) <= 1]
            if not ends:
                warn("events", line, f"no {e.right_type} right of {e.from_holder} at {e.place_id} ends around {e.year}")


def coverage(ds: Dataset) -> list[str]:
    settlements = [p for _, p in ds.places if p.kind == "settlement"]
    with_rights = {r.place_id for _, r in ds.rights}
    located = [p for p in settlements if p.lat is not None]
    low = sum(1 for t in ("rights", "events", "memberships", "rulers") for _, r in getattr(ds, t)
              if r.confidence == "low")
    return [
        f"places: {len(ds.places)} ({len(settlements)} settlements), entities: {len(ds.entities)}, "
        f"rulers: {len(ds.rulers)}, memberships: {len(ds.memberships)}, rights: {len(ds.rights)}, "
        f"events: {len(ds.events)}",
        f"places with rights: {len(with_rights & {p.id for _, p in ds.places})}/{len(ds.places)}; "
        f"settlements geocoded: {len(located)}/{len(settlements)}; low-confidence facts: {low}",
    ]
