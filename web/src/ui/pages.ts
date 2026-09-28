// Full-page views over the map: the rights table and the changes timeline.
import type { Dataset } from "../data/types";
import { label, name, t } from "../i18n";
import { holderColour, OTHER } from "../model/colors";
import { ancestors, placeRight, type PlaceRight, type RightIndex } from "../model/snapshot";
import type { State, Store } from "../state/store";
import { fill, h } from "./dom";

/** Table filters live here, not in the URL: they are working aids, not views worth linking. */
const matrixFilters = { territory: "", holder: "", allRights: false };
const changesFilters = { right: "", earlier: false };

export function renderMatrix(root: HTMLElement, data: Dataset, index: RightIndex, state: State, store: Store,
  coloured: string[]): void {
  const { lang, year } = state;
  const vocab = data.meta.vocab;
  const types = Object.keys(vocab.right_types).filter((k) => matrixFilters.allRights || vocab.right_types[k].core);
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);

  const settlements = [...data.places.values()].filter((p) => p.kind === "settlement");
  const cells = new Map<string, Map<string, PlaceRight>>();
  const holders = new Map<string, number>();
  for (const p of settlements) {
    const row = new Map<string, PlaceRight>();
    for (const type of types) {
      const pr = placeRight(p.id, type, year, index, data.places, data.entities);
      row.set(type, pr);
      for (const x of pr.holdings) holders.set(x.holder, (holders.get(x.holder) ?? 0) + 1);
    }
    cells.set(p.id, row);
  }
  // Territories with members, the largest first: offices and seigneuries before small fiefs.
  const memberCount = new Map<string, number>();
  for (const p of settlements) for (const a of ancestors(p.id, year, data.places)) memberCount.set(a, (memberCount.get(a) ?? 0) + 1);
  const territories = [...memberCount].filter(([id]) => id !== "bailliage-allemagne").sort((a, b) => b[1] - a[1]);

  const rows = settlements.filter((p) =>
    (!matrixFilters.territory || ancestors(p.id, year, data.places).includes(matrixFilters.territory))
    && (!matrixFilters.holder || [...cells.get(p.id)!.values()].some((pr) => pr.holdings.some((x) => x.holder === matrixFilters.holder))))
    .sort((a, b) => placeName(a.id).localeCompare(placeName(b.id), lang));

  const cellText = (pr: PlaceRight) => pr.holdings.map((x) => entityName(x.holder)
    + (x.share ? ` (${x.share === "joint" ? "∥" : x.share})` : "") + (x.status !== "held" ? ` [${x.status}]` : "")).join(" / ");
  const rerender = () => renderMatrix(root, data, index, state, store, coloured);
  const exportCsv = () => {
    const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const lines = [[t("place", lang), "id", ...types.map((k) => label(vocab.right_types[k], lang, k))].map(quote).join(",")];
    for (const p of rows) {
      lines.push([placeName(p.id), p.id, ...types.map((k) => cellText(cells.get(p.id)!.get(k)!))].map(quote).join(","));
    }
    const url = URL.createObjectURL(new Blob([`﻿${lines.join("\n")}\n`], { type: "text/csv" }));
    h("a", { href: url, download: `bailliage-rights-${year}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  fill(root,
    h("div", { class: "toolbar" },
      h("h2", {}, `${t("view_matrix", lang)} · ${year}`),
      h("label", {}, `${t("territory", lang)} `, h("select", {
        onchange: (e: Event) => { matrixFilters.territory = (e.target as HTMLSelectElement).value; rerender(); } },
        h("option", { value: "" }, t("allTerritories", lang)),
        ...territories.map(([id, n]) => h("option", { value: id, selected: id === matrixFilters.territory },
          `${placeName(id)} (${n})`)))),
      h("label", {}, `${t("holder", lang)} `, h("select", {
        onchange: (e: Event) => { matrixFilters.holder = (e.target as HTMLSelectElement).value; rerender(); } },
        h("option", { value: "" }, t("allHolders", lang)),
        ...[...holders].sort((a, b) => b[1] - a[1]).map(([id]) => h("option", { value: id,
          selected: id === matrixFilters.holder }, entityName(id))))),
      h("label", {}, h("input", { type: "checkbox", checked: matrixFilters.allRights,
        onchange: (e: Event) => { matrixFilters.allRights = (e.target as HTMLInputElement).checked; rerender(); } }),
        ` ${t("allRights", lang)}`),
      h("button", { onclick: exportCsv }, t("exportCsv", lang)),
      h("span", { class: "muted" }, `${rows.length} ${t("rowsShown", lang)}`)),
    h("div", { class: "table-wrap" }, h("table", { class: "matrix" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t("place", lang)),
        ...types.map((k) => h("th", { scope: "col" }, label(vocab.right_types[k], lang, k))))),
      h("tbody", {}, ...rows.map((p) => h("tr", {},
        h("th", { scope: "row" }, h("button", { class: "link", "data-place": p.id, onclick: () => store.set({ place: p.id }) },
          placeName(p.id))),
        ...types.map((k) => {
          const pr = cells.get(p.id)!.get(k)!;
          if (!pr.holdings.length) return h("td", { class: "empty" }, "—");
          const colour = holderColour(pr.primary, coloured) ?? OTHER;
          return h("td", { class: pr.inheritedFrom ? "inherited" : "",
            title: pr.inheritedFrom ? `${t("inherited", lang)} ${placeName(pr.inheritedFrom)}` : "" },
          h("span", { class: "swatch", style: `--c:${colour}` }), ` ${cellText(pr)}`, pr.contested ? h("span", { class: "warn" }, " ⚠") : "");
        })))))),
  );
}

export function renderChanges(root: HTMLElement, data: Dataset, state: State, store: Store): void {
  const { lang } = state;
  const vocab = data.meta.vocab;
  const { yearMin, yearMax } = data.meta;
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
  const events = data.events.filter((e) => (changesFilters.earlier || e.year >= yearMin) && e.year <= yearMax
    && (!changesFilters.right || e.right === changesFilters.right));
  const perYear = new Map<number, number>();
  for (const e of events) if (e.year >= yearMin) perYear.set(e.year, (perYear.get(e.year) ?? 0) + 1);
  const max = Math.max(1, ...perYear.values());
  const byYear = new Map<number, typeof events>();
  for (const e of events) byYear.set(e.year, [...(byYear.get(e.year) ?? []), e]);
  const rerender = () => renderChanges(root, data, state, store);
  const go = (year: number, place: string, right?: string) =>
    store.set({ view: "map", year: Math.min(Math.max(year, yearMin), yearMax), place, ...(right ? { right } : {}) });

  const bars = [];
  for (let y = yearMin; y <= yearMax; y++) {
    const n = perYear.get(y) ?? 0;
    bars.push(h("button", { class: "bar", "aria-pressed": String(y === state.year), title: `${y}: ${n}`,
      "aria-label": `${y}: ${n}`, style: `--h:${(n / max) * 100}%`,
      onclick: () => document.getElementById(`year-${y}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) }));
  }
  fill(root,
    h("div", { class: "toolbar" },
      h("h2", {}, t("view_changes", lang)),
      h("label", {}, `${t("right", lang)} `, h("select", {
        onchange: (e: Event) => { changesFilters.right = (e.target as HTMLSelectElement).value; rerender(); } },
        h("option", { value: "" }, t("anyRight", lang)),
        ...Object.keys(vocab.right_types).map((k) => h("option", { value: k, selected: k === changesFilters.right },
          label(vocab.right_types[k], lang, k))))),
      h("label", {}, h("input", { type: "checkbox", checked: changesFilters.earlier,
        onchange: (e: Event) => { changesFilters.earlier = (e.target as HTMLInputElement).checked; rerender(); } }),
        ` ${t("before1600", lang)}`),
      h("span", { class: "muted" }, String(events.length))),
    h("figure", { class: "histogram" },
      h("figcaption", {}, t("changesPerYear", lang)),
      h("div", { class: "bars" }, ...bars),
      h("div", { class: "bar-axis" }, ...[yearMin, 1610, 1620, 1630].map((y) => h("span", {
        style: `--x:${((y - yearMin) / (yearMax - yearMin + 1)) * 100}%` }, String(y))))),
    h("ol", { class: "changes" }, ...[...byYear].sort((a, b) => a[0] - b[0]).map(([year, list]) => h("li", {},
      h("h3", { id: `year-${year}` }, String(year)),
      h("ul", {}, ...list.map((e) => h("li", {},
        h("button", { class: "link strong", title: t("showOnMap", lang), onclick: () => go(e.year, e.place, e.right) },
          placeName(e.place)),
        ` · ${label(vocab.event_types[e.type], lang, e.type)}`,
        e.right ? ` · ${label(vocab.right_types[e.right], lang, e.right)}` : "",
        e.from || e.to ? ` · ${e.from ? entityName(e.from) : "?"} → ${e.to ? entityName(e.to) : "?"}` : "",
        e.pages ? h("span", { class: "pages" }, ` ${t("pages", lang)} ${e.pages}`) : "",
        h("div", { class: "muted" }, e.text))))))),
  );
}
