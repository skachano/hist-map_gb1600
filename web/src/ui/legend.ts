// Legend: the holders of the selected right in the selected year, with place counts.
import type { Dataset } from "../data/types";
import { name, t } from "../i18n";
import { CONTESTED, OTHER, SERIES } from "../model/colors";
import type { Snapshot } from "../map/mapView";
import type { State } from "../state/store";
import { fill, h } from "./dom";

export function renderLegend(root: HTMLElement, data: Dataset, state: State, snapshot: Snapshot,
  coloured: string[]): void {
  const { lang } = state;
  const counts = new Map<string, number>();
  let contested = 0;
  let shared = 0;
  for (const pr of snapshot.byPlace.values()) {
    if (pr.primary) counts.set(pr.primary, (counts.get(pr.primary) ?? 0) + 1);
    if (pr.contested) contested++;
    if (pr.shared) shared++;
  }
  const others = [...counts].filter(([id]) => !coloured.includes(id));
  const row = (swatch: HTMLElement, text: string, count?: number) =>
    h("li", {}, swatch, h("span", { class: "label" }, text), count !== undefined ? h("span", { class: "count" },
      String(count)) : null);
  const swatch = (colour: string, extra = "") => h("span", { class: `swatch ${extra}`, style: `--c:${colour}` });
  fill(root,
    h("h2", {}, `${t("legend", lang)} · ${label(data, state.right, lang)} · ${state.year}`),
    h("ul", {},
      ...coloured.map((id, i) => row(swatch(SERIES[i]), name(data.entities.get(id)?.name, lang, id), counts.get(id) ?? 0)),
      row(swatch(OTHER), `${t("otherHolders", lang)} (${others.length})`,
        others.reduce((sum, [, n]) => sum + n, 0)),
      row(swatch(CONTESTED, "ring"), `⚠ ${t("contested", lang)}`, contested),
      row(h("span", { class: "glyph", "aria-hidden": "true" }, "∥"), t("shared", lang), shared),
      row(swatch("transparent", "empty"), t("noData", lang)),
    ),
    h("p", { class: "note" }, t("approxAreas", lang)),
  );
}

function label(data: Dataset, right: string, lang: State["lang"]): string {
  return data.meta.vocab.right_types[right]?.[lang] ?? right;
}
