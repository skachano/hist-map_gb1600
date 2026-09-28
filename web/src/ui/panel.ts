// Place panel: names and type in three languages, parent territories, the rights held
// there in the selected year (with pages and quotes), a 1600-1632 timeline per right,
// and the recorded changes of holder. Holder names open the holder view.
import type { Dataset, Right } from "../data/types";
import { label, name, t } from "../i18n";
import { holderColour } from "../model/colors";
import { ancestors, type RightIndex, rightsAtPlace, timeline } from "../model/snapshot";
import { membersOf } from "../model/territories";
import type { State, Store } from "../state/store";
import { fill, h } from "./dom";
import { type Bar, ganttChart } from "./timeline";

function years(r: { from?: number; to?: number }): string {
  if (r.from === undefined && r.to === undefined) return "";
  return `${r.from ?? "…"}–${r.to ?? "…"}`;
}

export function renderPanel(root: HTMLElement, data: Dataset, index: RightIndex, state: State, store: Store,
  coloured: string[]): void {
  const place = state.place ? data.places.get(state.place) : undefined;
  root.hidden = !place;
  if (!place) return fill(root);
  const { lang, year } = state;
  const vocab = data.meta.vocab;
  const span: [number, number] = [data.meta.yearMin, data.meta.yearMax];
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const entityLink = (id: string) => h("button", { class: "link", onclick: () => store.set({ view: "entity", entity: id }) },
    entityName(id));

  const holding = (r: Right) => h("li", {},
    entityLink(r.holder),
    r.share ? ` (${r.share === "joint" ? "∥" : r.share})` : "",
    r.status ? ` · ${label(vocab.statuses[r.status], lang, r.status)}` : "",
    r.disputed ? h("span", { class: "warn" }, ` · ⚠ ${t("against", lang)} ${(r.against ?? []).map(entityName).join(", ")}`) : "",
    years(r) ? ` · ${years(r)}` : "",
    r.pages ? h("span", { class: "pages" }, ` ${t("pages", lang)} ${r.pages}`) : "",
    r.quote ? h("blockquote", { lang: "fr" }, `« ${r.quote} »`) : null);

  // Timelines: every right type with rows here, plus the main rights inherited from territories.
  const ownTypes = new Set(index.get(place.id)?.keys() ?? []);
  const types = Object.keys(vocab.right_types).filter((k) => ownTypes.has(k) || vocab.right_types[k].core);
  const charts = types.flatMap((type) => {
    const segs = timeline(place.id, type, span, index, data.places, data.entities);
    if (!segs.length) return [];
    const byHolder = new Map<string, Bar[]>();
    for (const s of segs) {
      const bars = byHolder.get(s.holder) ?? [];
      const status = s.status === "held" ? "" : ` · ${label(vocab.statuses[s.status], lang, s.status)}`;
      bars.push({
        from: s.from, to: s.to,
        fill: s.status === "claimed" || s.status === "contested" ? "#ffffff"
          : holderColour(s.holder, coloured) ?? "#c3c2b7",
        dashed: s.status === "pledged" || s.status === "claimed", faded: !!s.inheritedFrom, outlined: s.disputed,
        title: `${entityName(s.holder)}${s.share ? ` (${s.share})` : ""}${status} · ${s.from}–${s.to}`
          + (s.inheritedFrom ? ` · ${t("inherited", lang)} ${placeName(s.inheritedFrom)}` : ""),
      });
      byHolder.set(s.holder, bars);
    }
    const rows = [...byHolder].map(([holder, bars]) => ({
      label: entityName(holder), bars, onClick: () => store.set({ view: "entity", entity: holder }),
    }));
    const title = label(vocab.right_types[type], lang, type);
    return [h("h4", {}, title), ganttChart(rows, span, year, `${title}, ${span[0]}–${span[1]}`)];
  });

  function members(id: string) {
    const { territories, settlements } = membersOf(id, year, data.places);
    if (!territories.length && !settlements.length) return [];
    const link = (m: string) => h("li", {}, h("button", { class: "link", "data-place": m,
      onclick: () => store.set({ place: m }) }, placeName(m)));
    const byName = (a: string, b: string) => placeName(a).localeCompare(placeName(b), lang);
    return [
      h("h3", {}, `${t("membersIn", lang)} ${year}`),
      territories.length ? h("h4", {}, `${t("subTerritories", lang)} (${territories.length})`) : null,
      territories.length ? h("ul", { class: "members" }, ...territories.sort(byName).map(link)) : null,
      settlements.length ? h("h4", {}, `${t("settlements", lang)} (${settlements.length})`) : null,
      settlements.length ? h("ul", { class: "members cols" }, ...settlements.sort(byName).map(link)) : null,
    ];
  }

  const events = data.events.filter((e) => e.place === place.id).sort((a, b) => a.year - b.year);
  const rights = rightsAtPlace(place.id, year, index);
  const parents = ancestors(place.id, year, data.places);
  fill(root,
    h("button", { class: "close", "aria-label": t("close", lang), onclick: () => store.set({ place: undefined }) }, "×"),
    h("h2", { tabindex: "-1" }, placeName(place.id)),
    h("dl", {},
      h("dt", {}, t("names", lang)),
      h("dd", {}, `FR ${place.name.fr ?? "—"} · DE ${place.name.de ?? "—"} · EN ${place.name.en ?? "—"}`),
      place.variants?.length ? h("dd", { class: "muted" }, place.variants.join(", ")) : null,
      h("dt", {}, t("type", lang)),
      h("dd", {}, (["en", "fr", "de"] as const).map((l) => label(vocab.place_types[place.type], l, place.type)).join(" · ")),
      parents.length ? h("dt", {}, t("belongsTo", lang)) : null,
      parents.length ? h("dd", { class: "crumbs" }, ...parents.map((id) => h("button", { class: "link", "data-place": id,
        onclick: () => store.set({ place: id }) }, placeName(id)))) : null,
    ),
    place.approx ? h("p", { class: "muted" }, t("approximate", lang)) : null,
    ...(place.kind === "territory" ? members(place.id) : []),
    h("h3", {}, `${t("rightsIn", lang)} ${year}`),
    rights.size
      ? h("dl", { class: "rights" }, ...[...rights].flatMap(([type, rows]) => [
        h("dt", {}, label(vocab.right_types[type], lang, type)),
        h("dd", {}, h("ul", {}, ...rows.map(holding))),
      ]))
      : h("p", { class: "muted" }, t("noRights", lang)),
    charts.length ? h("h3", {}, t("timeline", lang)) : null,
    ...charts,
    h("h3", {}, t("events", lang)),
    events.length
      ? h("ul", { class: "events" }, ...events.map((e) => h("li", {},
        h("button", { class: "link year", onclick: () => store.set({ year: Math.min(Math.max(e.year, span[0]), span[1]) }) },
          String(e.year)),
        ` ${label(vocab.event_types[e.type], lang, e.type)}`,
        e.right ? ` · ${label(vocab.right_types[e.right], lang, e.right)}` : "",
        e.from || e.to ? ` · ${e.from ? entityName(e.from) : "?"} → ${e.to ? entityName(e.to) : "?"}` : "",
        e.pages ? h("span", { class: "pages" }, ` ${t("pages", lang)} ${e.pages}`) : "",
        h("div", { class: "muted" }, e.text))))
      : h("p", { class: "muted" }, t("noEvents", lang)),
    place.pages ? h("p", { class: "muted" }, `${t("source", lang)}: Hiegel 1961, ${t("pages", lang)} ${place.pages}`) : null,
  );
}
