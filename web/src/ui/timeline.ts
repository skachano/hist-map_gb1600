// Small Gantt chart: one row per label, bars over the years, a cursor at the current year.
// Labels are ink, never the bar colour; every bar carries a <title> tooltip.
import { CONTESTED } from "../model/colors";

export interface Bar {
  from: number;
  to: number;
  fill: string;
  dashed?: boolean;
  faded?: boolean;
  outlined?: boolean;
  title: string;
}

export interface Row {
  label: string;
  bars: Bar[];
  onClick?: () => void;
}

const NS = "http://www.w3.org/2000/svg";
const ROW = 18;
const LABEL_W = 132;
const WIDTH = 340;
const AXIS = 16;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function ganttChart(rows: Row[], years: [number, number], cursor: number, caption: string): SVGSVGElement {
  const [y0, y1] = years;
  const plotW = WIDTH - LABEL_W - 4;
  const x = (year: number) => LABEL_W + ((year - y0) / (y1 - y0 + 1)) * plotW;
  const height = rows.length * ROW + AXIS;
  const svg = el("svg", { viewBox: `0 0 ${WIDTH} ${height}`, width: "100%", role: "img", class: "gantt" });
  svg.append(Object.assign(el("title", {}), { textContent: caption }));

  rows.forEach((row, i) => {
    const top = i * ROW;
    const label = el("text", { x: 0, y: top + 13, class: "gantt-label" });
    label.textContent = row.label.length > 22 ? `${row.label.slice(0, 21)}…` : row.label;
    if (row.onClick) {
      label.classList.add("link");
      label.addEventListener("click", row.onClick);
    }
    const labelTitle = el("title", {});
    labelTitle.textContent = row.label;
    label.append(labelTitle);
    svg.append(label);
    for (const b of row.bars) {
      const rect = el("rect", {
        x: x(b.from), y: top + 4, width: Math.max(2, x(b.to + 1) - x(b.from) - 1), height: ROW - 8, rx: 2,
        fill: b.fill, "fill-opacity": b.faded ? 0.45 : 1,
        stroke: b.outlined ? CONTESTED : b.dashed ? "#0b0b0b" : "none",
        "stroke-width": b.outlined || b.dashed ? 1.2 : 0,
        "stroke-dasharray": b.dashed && !b.outlined ? "3 2" : "none",
      });
      const t = el("title", {});
      t.textContent = b.title;
      rect.append(t);
      svg.append(rect);
    }
  });

  const axisY = rows.length * ROW;
  svg.append(el("line", { x1: LABEL_W, x2: WIDTH - 4, y1: axisY + 1, y2: axisY + 1, class: "gantt-axis" }));
  for (const tick of [y0, 1610, 1620, 1630].filter((t) => t >= y0 && t <= y1)) {
    const text = el("text", { x: x(tick), y: axisY + 13, class: "gantt-tick" });
    text.textContent = String(tick);
    svg.append(text);
  }
  const cx = x(cursor) + (x(cursor + 1) - x(cursor)) / 2;
  svg.append(el("line", { x1: cx, x2: cx, y1: 0, y2: axisY + 2, class: "gantt-cursor" }));
  return svg;
}
