// Who held which right where, in a given year: pure functions over the dataset.
//
// Conventions (see doc/Plan.md, Stage 2 and 4):
// - years are inclusive; a missing `from`/`to` means "since before" / "still at the end";
// - in a transfer year both holders have rows; the incoming one wins that year;
// - a place without rows of its own for a right inherits it from the nearest territory
//   it belonged to that year (a village of an office under the office's suzerain).

import type { Entity, Place, Right } from "../data/types";

export interface Holding {
  holder: string;
  row: Right;
  share?: string;
  status: NonNullable<Right["status"]> | "held";
  disputed: boolean;
}

export interface PlaceRight {
  holdings: Holding[];
  /** set when the holdings come from a territory the place belonged to */
  inheritedFrom?: string;
  /** the holder to colour the place by (largest share, then most prominent) */
  primary?: string;
  /** several holders at once (condominium, co-lordship) */
  shared: boolean;
  /** a claim, contest or dispute is recorded */
  contested: boolean;
}

/** rights indexed by place, then right type */
export type RightIndex = Map<string, Map<string, Right[]>>;

export function indexRights(rights: Right[]): RightIndex {
  const index: RightIndex = new Map();
  for (const r of rights) {
    let byType = index.get(r.place);
    if (!byType) index.set(r.place, (byType = new Map()));
    const list = byType.get(r.right);
    if (list) list.push(r);
    else byType.set(r.right, [r]);
  }
  return index;
}

export function isActive(r: { from?: number; to?: number }, year: number): boolean {
  return (r.from ?? -Infinity) <= year && year <= (r.to ?? Infinity);
}

/** Rows in force in `year`; in a transfer year the outgoing holder's row is dropped. */
export function activeRows(rows: Right[], year: number): Right[] {
  const active = rows.filter((r) => isActive(r, year));
  const incoming = new Set(active.filter((r) => r.from === year).map((r) => r.holder));
  if (incoming.size === 0) return active;
  return active.filter((r) => !(r.to === year && r.from !== year && !incoming.has(r.holder)));
}

const HOLDING_STATUSES = new Set(["held", "pledged"]);

function shareValue(share?: string): number {
  if (!share || share === "joint") return 0;
  const [a, b] = share.split("/").map(Number);
  return b ? a / b : 0;
}

export function summarize(holdings: Holding[], entities: Map<string, Entity>, inheritedFrom?: string): PlaceRight {
  const holders = holdings.filter((h) => HOLDING_STATUSES.has(h.status));
  const rank = (id: string) => entities.get(id)?.rank ?? Infinity;
  const primary = [...holders].sort(
    (a, b) => shareValue(b.share) - shareValue(a.share) || rank(a.holder) - rank(b.holder),
  )[0]?.holder;
  return {
    holdings,
    inheritedFrom,
    primary,
    shared: new Set(holders.map((h) => h.holder)).size > 1,
    contested: holdings.some((h) => h.disputed || h.status === "claimed" || h.status === "contested"),
  };
}

function toHoldings(rows: Right[]): Holding[] {
  return rows.map((row) => ({
    holder: row.holder,
    row,
    share: row.share,
    status: row.status ?? "held",
    disputed: !!row.disputed,
  }));
}

/** The territories a place belonged to in `year`, nearest first (breadth-first). */
export function ancestors(placeId: string, year: number, places: Map<string, Place>): string[] {
  const out: string[] = [];
  const seen = new Set([placeId]);
  let frontier = [placeId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parent of places.get(id)?.parents ?? []) {
        if (!seen.has(parent.id) && isActive(parent, year)) {
          seen.add(parent.id);
          out.push(parent.id);
          next.push(parent.id);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export function placeRight(
  placeId: string,
  rightType: string,
  year: number,
  index: RightIndex,
  places: Map<string, Place>,
  entities: Map<string, Entity>,
): PlaceRight {
  const own = activeRows(index.get(placeId)?.get(rightType) ?? [], year);
  if (own.length) return summarize(toHoldings(own), entities);
  for (const territory of ancestors(placeId, year, places)) {
    const rows = activeRows(index.get(territory)?.get(rightType) ?? [], year);
    if (rows.length) return summarize(toHoldings(rows), entities, territory);
  }
  return summarize([], entities);
}

/** All right types held at a place in `year` (own rows only), for detail panels. */
export function rightsAtPlace(placeId: string, year: number, index: RightIndex): Map<string, Right[]> {
  const out = new Map<string, Right[]>();
  for (const [type, rows] of index.get(placeId) ?? []) {
    const active = activeRows(rows, year);
    if (active.length) out.set(type, active);
  }
  return out;
}

// --- Stage 9: timelines, disputes and entity holdings -------------------------------

export interface Segment {
  holder: string;
  from: number;
  to: number;
  status: Holding["status"];
  share?: string;
  inheritedFrom?: string;
  disputed: boolean;
}

/** Year-by-year holders of one right at one place, merged into runs of identical years. */
export function timeline(
  placeId: string,
  rightType: string,
  years: [number, number],
  index: RightIndex,
  places: Map<string, Place>,
  entities: Map<string, Entity>,
): Segment[] {
  const open = new Map<string, Segment>();
  const done: Segment[] = [];
  for (let year = years[0]; year <= years[1]; year++) {
    const pr = placeRight(placeId, rightType, year, index, places, entities);
    const seen = new Set<string>();
    for (const h of pr.holdings) {
      const key = [h.holder, h.status, h.share ?? "", pr.inheritedFrom ?? "", h.disputed].join("|");
      seen.add(key);
      const seg = open.get(key);
      if (seg && seg.to === year - 1) seg.to = year;
      else {
        if (seg) done.push(seg);
        open.set(key, { holder: h.holder, from: year, to: year, status: h.status, share: h.share,
          inheritedFrom: pr.inheritedFrom, disputed: h.disputed });
      }
    }
    for (const [key, seg] of open) {
      if (!seen.has(key)) {
        done.push(seg);
        open.delete(key);
      }
    }
  }
  done.push(...open.values());
  return done.sort((a, b) => a.from - b.from || a.holder.localeCompare(b.holder));
}

export interface Dispute {
  place: string;
  right: string;
  /** everyone with a row: holders and claimants */
  parties: { holder: string; status: Holding["status"]; row: Right }[];
  /** entities named as opponents */
  against: string[];
}

/** Places and rights with a claim, contest or dispute flag in `year` (own rows only). */
export function disputesIn(year: number, index: RightIndex): Dispute[] {
  const out: Dispute[] = [];
  for (const [place, byType] of index) {
    for (const [right, rows] of byType) {
      const active = activeRows(rows, year);
      if (!active.some((r) => r.disputed || r.status === "claimed" || r.status === "contested")) continue;
      out.push({
        place, right,
        parties: active.map((row) => ({ holder: row.holder, status: row.status ?? "held", row })),
        against: [...new Set(active.flatMap((r) => r.against ?? []))],
      });
    }
  }
  return out;
}

/** Rights an entity holds directly (own rows, any status) in `year`, by right type. */
export function directHoldings(entityId: string, year: number, rights: Right[]): Map<string, Right[]> {
  const byPlaceRight = new Map<string, Right[]>();
  for (const r of rights) {
    const key = `${r.place}\u0000${r.right}`;
    const list = byPlaceRight.get(key);
    if (list) list.push(r);
    else byPlaceRight.set(key, [r]);
  }
  const out = new Map<string, Right[]>();
  for (const rows of byPlaceRight.values()) {
    for (const r of activeRows(rows, year)) {
      if (r.holder !== entityId) continue;
      const list = out.get(r.right);
      if (list) list.push(r);
      else out.set(r.right, [r]);
    }
  }
  return out;
}
