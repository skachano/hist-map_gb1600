// Where the hover tooltip goes: below-right of the cursor, flipped to the other side when it
// would leave the map area (which would otherwise give the page a scrollbar), and kept inside it.

const GAP = 14; // px between the cursor and the tooltip
const MARGIN = 4; // px kept free at the edges of the area

export interface Size { width: number; height: number }

export function tooltipPosition(cursor: { x: number; y: number }, tip: Size, area: Size): { x: number; y: number } {
  const place = (at: number, size: number, room: number) => {
    let pos = at + GAP;
    if (pos + size > room - MARGIN) pos = at - GAP - size; // no room after the cursor: before it
    return Math.max(MARGIN, Math.min(pos, room - MARGIN - size));
  };
  return { x: place(cursor.x, tip.width, area.width), y: place(cursor.y, tip.height, area.height) };
}
