// Side panels shown next to the map: the holder (entity) view and the disputes view.
import type { Dataset, Right } from "../data/types";
import { label, name, type StringKey, t } from "../i18n";
import { CONTESTED, SERIES } from "../model/colors";
import { OTHER } from "../model/colors";
import { directHoldings, type Dispute } from "../model/snapshot";
import { type RealmGroup, realmGroup } from "../model/territories";
import type { State, Store } from "../state/store";
import { fill, h } from "./dom";
import { ganttChart } from "./timeline";

export function renderEntityView(root: HTMLElement, data: Dataset, state: State, store: Store): void {
  const { lang, year } = state;
  const vocab = data.meta.vocab;
  const entities = [...data.entities.values()].sort((a, b) => a.rank - b.rank);
  const entity = state.entity ? data.entities.get(state.entity) : undefined;
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
  const picker = h("select", { "aria-label": t("chooseEntity", lang),
    onchange: (e: Event) => store.set({ entity: (e.target as HTMLSelectElement).value || undefined }) },
    h("option", { value: "", selected: !entity }, t("chooseEntity", lang)),
    ...entities.map((e) => h("option", { value: e.id, selected: e.id === entity?.id },
      `${name(e.name, lang, e.id)} (${e.rights ?? 0})`)));
  if (!entity) return fill(root, h("h2", {}, t("view_entity", lang)), picker);

  const span: [number, number] = [data.meta.yearMin, data.meta.yearMax];
  const held = directHoldings(entity.id, year, data.rights);
  const selected = held.get(state.right) ?? [];
  const rulers = (entity.rulers ?? []).filter((r) => (r.to ?? span[1]) >= span[0] && (r.from ?? span[0]) <= span[1]);
  const events = data.events.filter((e) => e.from === entity.id || e.to === entity.id).sort((a, b) => a.year - b.year);
  const placeLink = (id: string) => h("button", { class: "link", "data-place": id, onclick: () => store.set({ place: id }) },
    placeName(id));

  fill(root,
    picker,
    h("h2", {}, name(entity.name, lang, entity.id)),
    h("p", { class: "muted" }, [label(vocab.entity_types[entity.type], lang, entity.type),
      `FR ${entity.name.fr ?? "—"} · DE ${entity.name.de ?? "—"} · EN ${entity.name.en ?? "—"}`
        + (entity.name.ja ? ` · JA ${entity.name.ja}` : "")].join(" · ")),
    h("p", { class: "key" }, h("span", { class: "swatch", style: `--c:${SERIES[0]}` }),
      ` ${t("onMap", lang)} ${label(vocab.right_types[state.right], lang, state.right)}`,
      h("br", {}), h("span", { class: "swatch ring", style: `--c:${CONTESTED}` }), ` ${t("entityClaims", lang)}`),
    h("h3", {}, `${t("heldDirectly", lang)} ${year}`),
    held.size
      ? h("ul", { class: "counts" }, ...[...held].map(([type, rows]) => h("li", {},
        h("button", { class: "link", "aria-pressed": String(type === state.right), onclick: () => store.set({ right: type }) },
          label(vocab.right_types[type], lang, type)), ` ${new Set(rows.map((r) => r.place)).size} ${t("places", lang)}`)))
      : h("p", { class: "muted" }, t("noRights", lang)),
    selected.length
      ? h("details", {}, h("summary", {}, `${label(vocab.right_types[state.right], lang, state.right)}: `
        + `${selected.length} ${t("places", lang)}`),
        h("ul", { class: "places" }, ...sortByName(selected, placeName).map((r) => h("li", {}, placeLink(r.place),
          r.share ? ` (${r.share === "joint" ? "∥" : r.share})` : "",
          r.status ? ` · ${label(vocab.statuses[r.status], lang, r.status)}` : ""))))
      : null,
    rulers.length ? h("h3", {}, t("rulers", lang)) : null,
    rulers.length ? ganttChart(rulers.map((r) => ({
      label: r.title ? `${r.name}, ${r.title}` : r.name,
      bars: [{ from: Math.max(r.from ?? span[0], span[0]), to: Math.min(r.to ?? span[1], span[1]), fill: "#52514e",
        title: `${r.name} · ${r.from ?? "…"}–${r.to ?? "…"}${r.pages ? ` · ${t("pages", lang)} ${r.pages}` : ""}` }],
    })), span, year, t("rulers", lang)) : null,
    h("h3", {}, t("gainedLost", lang)),
    events.length
      ? h("ul", { class: "events" }, ...events.map((e) => h("li", {},
        h("button", { class: "link year", onclick: () => store.set({ year: clamp(e.year, span), place: e.place }) },
          String(e.year)),
        ` ${e.to === entity.id ? `+ ${t("gained", lang)}` : `− ${t("lost", lang)}`} · `, placeLink(e.place),
        e.right ? ` · ${label(vocab.right_types[e.right], lang, e.right)}` : "",
        ` · ${label(vocab.event_types[e.type], lang, e.type)}`,
        (e.to === entity.id ? e.from : e.to) ? ` (${entityName((e.to === entity.id ? e.from : e.to)!)})` : "",
        e.pages ? h("span", { class: "pages" }, ` ${t("pages", lang)} ${e.pages}`) : "")))
      : h("p", { class: "muted" }, t("noEvents", lang)),
  );
}

export function renderDisputesView(root: HTMLElement, data: Dataset, state: State, store: Store,
  disputes: Dispute[]): void {
  const { lang, year } = state;
  const vocab = data.meta.vocab;
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
  const sorted = [...disputes].sort((a, b) => placeName(a.place).localeCompare(placeName(b.place), lang));
  fill(root,
    h("h2", {}, `${t("disputesIn", lang)} ${year} (${disputes.length})`),
    h("p", { class: "key" }, h("span", { class: "swatch ring", style: `--c:${CONTESTED}` }), ` ⚠ ${t("contested", lang)}`),
    sorted.length
      ? h("ul", { class: "disputes" }, ...sorted.map((d) => h("li", {},
        h("button", { class: "link strong", "data-place": d.place, onclick: () => store.set({ place: d.place }) },
          placeName(d.place)),
        ` · ${label(vocab.right_types[d.right], lang, d.right)}`,
        h("ul", {}, ...d.parties.map((p) => h("li", {},
          entityName(p.holder), ` · ${label(vocab.statuses[p.status], lang, p.status)}`,
          p.row.against?.length ? h("span", { class: "warn" }, ` · ${t("against", lang)} `
            + p.row.against.map(entityName).join(", ")) : "",
          pages(p.row, lang)))))))
      : h("p", { class: "muted" }, t("noDisputes", lang)),
  );
}

function pages(r: Right, lang: State["lang"]) {
  return r.pages ? h("span", { class: "pages" }, ` ${t("pages", lang)} ${r.pages}`) : "";
}

function sortByName(rows: Right[], placeName: (id: string) => string): Right[] {
  return [...rows].sort((a, b) => placeName(a.place).localeCompare(placeName(b.place)));
}

function clamp(year: number, [lo, hi]: [number, number]): number {
  return Math.min(Math.max(year, lo), hi);
}

const GROUP_COLOUR: Record<RealmGroup, string> = { office: SERIES[0], lordship: SERIES[1], county: SERIES[2], other: OTHER };
const GROUP_LABEL: Record<RealmGroup, StringKey> = {
  office: "groupOffice", lordship: "groupLordship", county: "groupCounty", other: "groupOther" };

/** Territories view: level and neighbour switches, the kinds of realm, and every realm shown. */
export function renderTerritoriesView(root: HTMLElement, data: Dataset, state: State, store: Store,
  shown: string[], settlementsIn: Map<string, number>): void {
  const { lang, year } = state;
  const level = state.level ?? 1;
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const groups = new Map<RealmGroup, number>();
  for (const id of shown) {
    const g = realmGroup(data.places.get(id)?.type ?? "");
    groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  const levelButton = (value: number, key: StringKey) => h("button", { "aria-pressed": String(level === value),
    onclick: () => store.set({ level: value }) }, t(key, lang));
  fill(root,
    h("h2", {}, `${t("realmsIn", lang)} ${year} (${shown.length})`),
    h("div", { class: "levels", role: "group", "aria-label": t("level", lang) },
      levelButton(1, "level1"), levelButton(2, "level2"), levelButton(0, "level0")),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!state.neighbours,
      onchange: (e: Event) => store.set({ neighbours: (e.target as HTMLInputElement).checked || undefined }) }),
    ` ${t("neighbours", lang)}`),
    h("ul", { class: "groups" }, ...(["office", "lordship", "county", "other"] as RealmGroup[]).map((g) => h("li", {},
      h("span", { class: "swatch", style: `--c:${GROUP_COLOUR[g]}` }), ` ${t(GROUP_LABEL[g], lang)}`,
      h("span", { class: "count" }, ` ${groups.get(g) ?? 0}`)))),
    h("ul", { class: "realms" }, ...[...shown].sort((a, b) => placeName(a).localeCompare(placeName(b), lang)).map((id) =>
      h("li", {},
        h("button", { class: "link", "data-place": id, "aria-pressed": String(id === state.place),
          onclick: () => store.set({ place: id }) }, placeName(id)),
        h("span", { class: "muted" }, settlementsIn.get(id)
          ? ` · ${settlementsIn.get(id)} ${t("places", lang)}` : ` · ${t("noArea", lang)}`)))),
  );
}
