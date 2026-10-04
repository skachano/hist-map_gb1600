import { loadDataset } from "./data/load";
import type { Dataset } from "./data/types";
import { label, name, type StringKey, t } from "./i18n";
import { MapView, type PlaceStyle } from "./map/mapView";
import { colouredHolders, CONTESTED, holderColour, OTHER, SERIES } from "./model/colors";
import { type Dispute, disputesIn, indexRights, placeRight, type PlaceRight, type RightIndex } from "./model/snapshot";
import { parseHash, type State, Store, toHash } from "./state/store";
import "./style.css";
import { renderHeader, YearBar } from "./ui/controls";
import { fill, h } from "./ui/dom";
import { renderLegend } from "./ui/legend";
import { renderAbout } from "./ui/about";
import { renderChanges, renderMatrix } from "./ui/pages";
import { setMapFocus } from "./ui/navigate";
import { renderPanel } from "./ui/panel";
import { renderDisputesView, renderEntityView, renderTerritoriesView } from "./ui/sideViews";
import { tooltipPosition } from "./ui/tooltip";
import { BAILIWICK, childrenIn, contestedMembership, hierarchyOf, territoryLevels } from "./model/territories";

const $ = (id: string) => document.getElementById(id)!;

interface ViewData {
  byPlace: Map<string, PlaceRight>;
  disputes: Dispute[];
  styles: Map<string, PlaceStyle>;
}

/** Who holds the selected right at every settlement drawn on the map, and how to draw it. */
function computeView(data: Dataset, index: RightIndex, state: State, coloured: string[]): ViewData {
  const byPlace = new Map<string, PlaceRight>();
  const styles = new Map<string, PlaceStyle>();
  const disputes = state.view === "disputes" ? disputesIn(state.year, index) : [];
  const located = [...data.places.values()].filter((p) => p.kind === "settlement" && p.lat !== undefined);
  if (state.view === "territories") return { byPlace, disputes, styles }; // realms, not holders
  if (state.view === "disputes") {
    const disputed = new Set(disputes.map((d) => d.place));
    for (const p of located) if (disputed.has(p.id)) styles.set(p.id, { fill: CONTESTED, inherited: true, contested: true });
    return { byPlace, disputes, styles };
  }
  for (const p of located) {
    const pr = placeRight(p.id, state.right, state.year, index, data.places, data.entities);
    byPlace.set(p.id, pr);
    const pledged = pr.holdings.some((x) => x.status === "pledged" && x.holder === pr.primary);
    if (state.view === "entity") {
      const mine = pr.holdings.filter((x) => x.holder === state.entity);
      if (mine.some((x) => x.status === "held" || x.status === "pledged")) {
        styles.set(p.id, { fill: SERIES[0], inherited: !!pr.inheritedFrom, shared: pr.shared,
          pledged: mine.some((x) => x.status === "pledged") });
      } else if (mine.length) {
        styles.set(p.id, { contested: true });
      }
    } else {
      const fillColour = holderColour(pr.primary, coloured) ?? (pr.contested ? OTHER : undefined);
      if (fillColour || pr.contested) {
        styles.set(p.id, { fill: fillColour, inherited: !!pr.inheritedFrom, contested: pr.contested,
          shared: pr.shared, pledged });
      }
    }
  }
  return { byPlace, disputes, styles };
}

async function start(): Promise<void> {
  $("status").textContent = t("loading", "en");
  performance.mark("load-start");
  const data = await loadDataset();
  performance.measure("load-data", "load-start");
  const index = indexRights(data.rights);
  const years: [number, number] = [data.meta.yearMin, data.meta.yearMax];
  const rights = new Set(Object.keys(data.meta.vocab.right_types));
  const store = new Store(parseHash(location.hash, years, rights));
  $("status").remove();

  const colours = (state: State) => colouredHolders(data.entities,
    state.colours?.filter((id) => data.entities.has(id)));
  const tooltip = $("tooltip");

  // Territories view: which realms are shown in a year, and how many located places each holds.
  const territoryFeatures = data.territories.features.map((f) => f.properties as
    { id: string; from_year: number; to_year: number; settlements: number });
  const realms = (state: State) => {
    const children = childrenIn(state.year, data.places);
    const inside = territoryLevels(state.year, data.places, children); // either hierarchy
    const levels = territoryLevels(state.year, data.places, children, state.feudal ? "feudal" : "admin");
    const level = state.level ?? 1;
    const settlementsIn = new Map<string, number>();
    for (const f of territoryFeatures) {
      if (f.from_year <= state.year && state.year <= f.to_year) settlementsIn.set(f.id, f.settlements);
    }
    const type = (id: string) => data.places.get(id)?.type ?? "";
    const inHierarchy = (id: string) => hierarchyOf(type(id)) === (state.feudal ? "feudal" : "admin");
    // A kind of realm shows every realm of that kind, whatever its level or hierarchy; otherwise one level
    // of the chosen hierarchy.
    const outside = state.neighbours ? [...settlementsIn.keys()].filter((id) => !inside.has(id) && id !== BAILIWICK) : [];
    const shown = state.kind
      ? [...inside.keys(), ...outside].filter((id) => type(id) === state.kind)
      : [...[...levels].filter(([, l]) => level === 0 || l === level).map(([id]) => id),
        ...outside.filter(inHierarchy)];
    // How many realms of each kind there are this year (for the menu), within the chosen scope.
    const kinds = new Map<string, number>();
    const inScope = [...inside.keys(), ...outside];
    for (const id of inScope) {
      const type = data.places.get(id)?.type ?? "";
      kinds.set(type, (kinds.get(type) ?? 0) + 1);
    }
    return { shown, settlementsIn, kinds };
  };
  let current = computeView(data, index, store.state, colours(store.state));

  const map = new MapView($("map"), data, {
    onHover(placeId, point) {
      tooltip.hidden = !placeId;
      if (!placeId) return;
      const { lang } = store.state;
      const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
      const lines: (HTMLElement | null)[] = [];
      if (store.state.view === "territories") {
        const p = data.places.get(placeId);
        const members = territoryFeatures.find((f) => f.id === placeId && f.from_year <= store.state.year
          && store.state.year <= f.to_year)?.settlements;
        lines.push(h("div", {}, label(data.meta.vocab.place_types[p?.type ?? ""], lang, p?.type ?? "")
          + (members ? ` · ${members} ${t("places", lang)}` : "")));
        const parents = (p?.parents ?? []).filter((x) => (x.from ?? 0) <= store.state.year
          && store.state.year <= (x.to ?? 9999)).map((x) => name(data.places.get(x.id)?.name, lang, x.id));
        if (parents.length) lines.push(h("div", { class: "muted" }, `${t("belongsTo", lang)} ${parents.join(", ")}`));
        if (contestedMembership(p, store.state.year)) lines.push(h("div", { class: "warn" }, `⚠ ${t("contestedMembership", lang)}`));
      } else if (store.state.view === "disputes") {
        for (const d of current.disputes.filter((x) => x.place === placeId)) {
          lines.push(h("div", { class: "warn" }, `⚠ ${label(data.meta.vocab.right_types[d.right], lang, d.right)}: `
            + d.parties.map((p) => entityName(p.holder)).join(" / ")));
        }
      } else {
        const pr = current.byPlace.get(placeId);
        const holders = pr?.holdings.map((x) => entityName(x.holder)
          + (x.share ? ` (${x.share === "joint" ? "∥" : x.share})` : "")
          + (x.status !== "held" ? ` · ${label(data.meta.vocab.statuses[x.status], lang, x.status)}` : ""));
        lines.push(h("div", {}, holders?.length ? holders.join(" / ") : t("noData", lang)));
        if (pr?.inheritedFrom) {
          lines.push(h("div", { class: "muted" },
            `${t("inherited", lang)} ${name(data.places.get(pr.inheritedFrom)?.name, lang, pr.inheritedFrom)}`));
        }
        if (pr?.contested) lines.push(h("div", { class: "warn" }, `⚠ ${t("contested", lang)}`));
      }
      fill(tooltip, h("strong", {}, name(data.places.get(placeId)?.name, lang, placeId)), ...lines);
      const area = tooltip.offsetParent as HTMLElement | null; // the map's stage
      const pos = tooltipPosition(point, { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
        { width: area?.clientWidth ?? window.innerWidth, height: area?.clientHeight ?? window.innerHeight });
      tooltip.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    },
    onSelect(placeId) {
      store.set({ place: placeId });
    },
    covered() {
      const stage = $("map").getBoundingClientRect();
      const box = (id: string) => { // a floating box, if it is shown
        const r = $(id).getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? r : undefined;
      };
      const side = box("side");
      const panel = box("panel");
      return { left: side ? Math.max(0, side.right - stage.left) : 0, right: panel ? Math.max(0, stage.right - panel.left) : 0 };
    },
  });
  setMapFocus(map);
  const yearBar = new YearBar($("yearbar"), data, store);
  // Development only: lets end-to-end tests point at a place on the map.
  if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map.map;

  let returnFocus: HTMLElement | null = null;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && store.state.place) store.set({ place: undefined });
  });

  const render = (state: State, previous?: State) => {
    const started = performance.now();
    const focusedBefore = document.activeElement as HTMLElement | null; // views re-render below
    const coloured = colours(state);
    if (!previous || previous.year !== state.year || previous.right !== state.right || previous.view !== state.view
      || previous.entity !== state.entity || previous.colours?.join() !== state.colours?.join()
      || previous.level !== state.level || previous.neighbours !== state.neighbours || previous.kind !== state.kind
      || previous.feudal !== state.feudal) {
      current = computeView(data, index, state, coloured);
    }
    document.documentElement.lang = state.lang;
    document.title = t("title", state.lang);
    document.body.dataset.view = state.view;
    document.body.classList.toggle("panel-open", !!state.place);
    renderHeader($("header"), data, store);
    yearBar.update();

    const legend = $("legend");
    const side = $("side");
    const page = $("page");
    legend.hidden = state.view !== "map";
    side.hidden = state.view !== "entity" && state.view !== "disputes" && state.view !== "territories";
    page.hidden = state.view !== "matrix" && state.view !== "changes" && state.view !== "about";
    // A scrolling page must be reachable by keyboard even when it holds no controls (About).
    page.tabIndex = 0;
    page.setAttribute("role", "region");
    page.setAttribute("aria-label", t(`view_${state.view}` as StringKey, state.lang));
    if (state.view === "map") renderLegend(legend, data, state, store, current.byPlace, coloured);
    if (state.view === "entity") renderEntityView(side, data, state, store);
    if (state.view === "disputes") renderDisputesView(side, data, state, store, current.disputes);
    const realmData = state.view === "territories" ? realms(state) : undefined;
    if (realmData) renderTerritoriesView(side, data, state, store, realmData.shown, realmData.settlementsIn,
      realmData.kinds);
    if (state.view === "matrix") renderMatrix(page, data, index, state, store, coloured);
    if (state.view === "changes") renderChanges(page, data, state, store);
    if (state.view === "about") renderAbout(page, data, state.lang);
    renderPanel($("panel"), data, index, state, store, coloured);
    // Keyboard and screen-reader users land in the panel when it opens and return when it closes.
    if (previous && state.place !== previous.place) {
      if (state.place) {
        if (!previous.place) returnFocus = focusedBefore;
        ($("panel").querySelector("h2") as HTMLElement | null)?.focus({ preventScroll: true });
      } else {
        // Views re-render, so the opener may have been replaced: fall back to its twin for the same place.
        const target = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus
          : document.querySelector<HTMLElement>(`[data-place="${CSS.escape(previous.place ?? "")}"]`);
        target?.focus({ preventScroll: true });
        returnFocus = null;
      }
    }
    if (page.hidden) {
      void map.render(state.year, current.styles, state.place);
      const names = new Map((realmData?.shown ?? []).map((id) => [id, name(data.places.get(id)?.name, state.lang, id)]));
      const contested = (realmData?.shown ?? []).filter((id) => contestedMembership(data.places.get(id), state.year));
      void map.showTerritories(state.year, realmData ? realmData.shown : null, names, state.place, contested);
    }
    history.replaceState(null, "", toHash(state)); // replace: playing through years must not flood history
    performance.measure(`render:${state.view}`, { start: started }); // read by e2e/perf.spec.ts
  };
  store.subscribe(render);
  window.addEventListener("hashchange", () => store.set(parseHash(location.hash, years, rights)));
  render(store.state);
}

start().catch((error) => {
  console.error(error);
  $("status").textContent = t("loadError", "en");
});
