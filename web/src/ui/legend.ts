// Rights-map legend: holders of the selected right in the selected year with place counts,
// the holder picker (which three holders get a colour), and the pattern keys.
import type { Dataset } from "../data/types";
import { name, t } from "../i18n";
import { CONTESTED, OTHER, SERIES } from "../model/colors";
import type { PlaceRight } from "../model/snapshot";
import type { State, Store } from "../state/store";
import { fill, h } from "./dom";

const OTHERS_LISTED = 8;

export function renderLegend(root: HTMLElement, data: Dataset, state: State, store: Store,
  byPlace: Map<string, PlaceRight>, coloured: string[]): void {
  const { lang } = state;
  const counts = new Map<string, number>();
  let contested = 0;
  let shared = 0;
  let pledged = 0;
  for (const pr of byPlace.values()) {
    if (pr.primary) counts.set(pr.primary, (counts.get(pr.primary) ?? 0) + 1);
    if (pr.contested) contested++;
    if (pr.shared) shared++;
    if (pr.holdings.some((x) => x.status === "pledged")) pledged++;
  }
  const others = [...counts].filter(([id]) => !coloured.includes(id)).sort((a, b) => b[1] - a[1]);
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
  const open = (id: string) => h("button", { class: "link", onclick: () => store.set({ view: "entity", entity: id }) },
    entityName(id));
  const swatch = (colour: string, extra = "") => h("span", { class: `swatch ${extra}`, style: `--c:${colour}` });
  const row = (mark: HTMLElement, text: Node | string, count?: number) =>
    h("li", {}, mark, h("span", { class: "label" }, text),
      count !== undefined ? h("span", { class: "count" }, String(count)) : null);
  const recolour = (id: string) => () => store.set({ colours: [...coloured.slice(0, 2), id] });

  fill(root,
    h("h2", {}, `${t("legend", lang)} · ${data.meta.vocab.right_types[state.right]?.[lang] ?? state.right} · ${state.year}`),
    h("ul", {},
      ...coloured.map((id, i) => row(swatch(SERIES[i]), open(id), counts.get(id) ?? 0)),
      row(swatch(OTHER), `${t("otherHolders", lang)} (${others.length})`, others.reduce((s, [, n]) => s + n, 0)),
    ),
    others.length
      ? h("ul", { class: "others" }, ...others.slice(0, OTHERS_LISTED).map(([id, n]) =>
        h("li", {},
          h("button", { class: "pick", title: t("giveColour", lang), "aria-label": `${t("giveColour", lang)}: ${entityName(id)}`,
            onclick: recolour(id) }, "●"),
          h("span", { class: "label" }, open(id)), h("span", { class: "count" }, String(n)))))
      : null,
    state.colours?.length
      ? h("button", { class: "link small", onclick: () => store.set({ colours: undefined }) }, t("resetColours", lang))
      : null,
    h("ul", { class: "keys" },
      row(swatch(CONTESTED, "ring"), `⚠ ${t("contested", lang)}`, contested),
      row(swatch("#ffffff", "hatched"), t("shared", lang), shared),
      row(swatch("#ffffff", "dashed"), t("pledged", lang), pledged),
      row(swatch(SERIES[0], "faded"), t("inheritedLegend", lang)),
      row(swatch("transparent", "empty"), t("noData", lang)),
    ),
    h("p", { class: "note" }, t("approxAreas", lang)),
  );
}
