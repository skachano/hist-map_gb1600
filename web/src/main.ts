import { loadDataset } from "./data/load";
import type { Dataset } from "./data/types";
import { name, t } from "./i18n";
import { MapView, type Snapshot } from "./map/mapView";
import { colouredHolders } from "./model/colors";
import { indexRights, placeRight, type RightIndex } from "./model/snapshot";
import { parseHash, type State, Store, toHash } from "./state/store";
import "./style.css";
import { renderHeader, YearBar } from "./ui/controls";
import { fill, h } from "./ui/dom";
import { renderLegend } from "./ui/legend";
import { renderPanel } from "./ui/panel";

const $ = (id: string) => document.getElementById(id)!;

/** Who holds the selected right at every settlement drawn on the map. */
function snapshot(data: Dataset, index: RightIndex, state: State): Snapshot {
  const byPlace = new Map();
  for (const p of data.places.values()) {
    if (p.kind === "settlement" && p.lat !== undefined) {
      byPlace.set(p.id, placeRight(p.id, state.right, state.year, index, data.places, data.entities));
    }
  }
  return { byPlace };
}

async function start(): Promise<void> {
  $("status").textContent = t("loading", "en");
  const data = await loadDataset();
  const index = indexRights(data.rights);
  const years: [number, number] = [data.meta.yearMin, data.meta.yearMax];
  const rights = new Set(Object.keys(data.meta.vocab.right_types));
  const store = new Store(parseHash(location.hash, years, rights));
  const coloured = colouredHolders(data.entities);
  $("status").remove();

  const tooltip = $("tooltip");
  let current = snapshot(data, index, store.state);
  const map = new MapView($("map"), data, {
    onHover(placeId, point) {
      const pr = placeId ? current.byPlace.get(placeId) : undefined;
      tooltip.hidden = !placeId;
      if (!placeId) return;
      const { lang } = store.state;
      const holders = pr?.holdings.map((x) => name(data.entities.get(x.holder)?.name, lang, x.holder)
        + (x.share ? ` (${x.share === "joint" ? "∥" : x.share})` : "") + (x.status !== "held" ? ` · ${x.status}` : ""));
      fill(tooltip,
        h("strong", {}, name(data.places.get(placeId)?.name, lang, placeId)),
        h("div", {}, holders?.length ? holders.join(" / ") : t("noData", lang)),
        pr?.inheritedFrom ? h("div", { class: "muted" },
          `${t("inherited", lang)} ${name(data.places.get(pr.inheritedFrom)?.name, lang, pr.inheritedFrom)}`) : null,
        pr?.contested ? h("div", { class: "warn" }, `⚠ ${t("contested", lang)}`) : null,
      );
      tooltip.style.transform = `translate(${point.x + 14}px, ${point.y + 14}px)`;
    },
    onSelect(placeId) {
      store.set({ place: placeId });
    },
  });
  const yearBar = new YearBar($("yearbar"), data, store);

  const render = (state: State, previous?: State) => {
    if (!previous || previous.year !== state.year || previous.right !== state.right) {
      current = snapshot(data, index, state);
    }
    document.documentElement.lang = state.lang;
    document.body.classList.toggle("panel-open", !!state.place);
    document.title = t("title", state.lang);
    renderHeader($("header"), data, store);
    yearBar.update();
    renderLegend($("legend"), data, state, current, coloured);
    renderPanel($("panel"), data, index, state, store);
    void map.render(state.year, current, coloured, state.place);
    history.replaceState(null, "", toHash(state)); // replace: playing through years must not flood history
  };
  store.subscribe(render);
  window.addEventListener("hashchange", () => store.set(parseHash(location.hash, years, rights)));
  render(store.state);
}

start().catch((error) => {
  console.error(error);
  $("status").textContent = t("loadError", "en");
});
