// Place panel: names in three languages, type, parent territories and the rights held there
// in the selected year, each with its source page. (Timelines come in Stage 9.)
import type { Dataset, Right } from "../data/types";
import { label, name, t } from "../i18n";
import { ancestors, type RightIndex, rightsAtPlace } from "../model/snapshot";
import type { State, Store } from "../state/store";
import { fill, h } from "./dom";

function years(r: { from?: number; to?: number }): string {
  if (r.from === undefined && r.to === undefined) return "";
  return `${r.from ?? "…"}–${r.to ?? "…"}`;
}

export function renderPanel(root: HTMLElement, data: Dataset, index: RightIndex, state: State, store: Store): void {
  const place = state.place ? data.places.get(state.place) : undefined;
  root.hidden = !place;
  if (!place) return fill(root);
  const { lang, year } = state;
  const vocab = data.meta.vocab;
  const entityName = (id: string) => name(data.entities.get(id)?.name, lang, id);
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const holding = (r: Right) => h("li", {},
    h("strong", {}, entityName(r.holder)),
    r.share ? ` (${r.share === "joint" ? "∥" : r.share})` : "",
    r.status ? ` · ${label(vocab.statuses[r.status], lang, r.status)}` : "",
    r.disputed ? ` · ⚠ ${(r.against ?? []).map(entityName).join(", ")}` : "",
    years(r) ? ` · ${years(r)}` : "",
    r.pages ? h("span", { class: "pages" }, ` ${t("pages", lang)} ${r.pages}`) : "",
    r.quote ? h("blockquote", { lang: "fr" }, `« ${r.quote} »`) : null);
  const rights = rightsAtPlace(place.id, year, index);
  const parents = ancestors(place.id, year, data.places);
  fill(root,
    h("button", { class: "close", "aria-label": t("close", lang), onclick: () => store.set({ place: undefined }) }, "×"),
    h("h2", {}, name(place.name, lang, place.id)),
    h("dl", {},
      h("dt", {}, t("names", lang)),
      h("dd", {}, `FR ${place.name.fr ?? "—"} · DE ${place.name.de ?? "—"} · EN ${place.name.en ?? "—"}`),
      place.variants?.length ? h("dd", { class: "muted" }, place.variants.join(", ")) : null,
      h("dt", {}, t("type", lang)),
      h("dd", {}, (["en", "fr", "de"] as const).map((l) => label(vocab.place_types[place.type], l, place.type)).join(" · ")),
      parents.length ? h("dt", {}, t("belongsTo", lang)) : null,
      parents.length ? h("dd", {}, parents.map(placeName).join(" › ")) : null,
    ),
    place.approx ? h("p", { class: "muted" }, t("approximate", lang)) : null,
    h("h3", {}, `${t("rightsIn", lang)} ${year}`),
    rights.size
      ? h("dl", { class: "rights" }, ...[...rights].flatMap(([type, rows]) => [
        h("dt", {}, label(vocab.right_types[type], lang, type)),
        h("dd", {}, h("ul", {}, ...rows.map(holding))),
      ]))
      : h("p", { class: "muted" }, t("noRights", lang)),
    place.pages ? h("p", { class: "muted" }, `${t("source", lang)}: Hiegel 1961, ${t("pages", lang)} ${place.pages}`) : null,
  );
}
