// Header (title, views, right-type tabs, language) and the year bar (step, play, slider).
import type { Dataset, Lang } from "../data/types";
import { label, LANGS, type StringKey, t } from "../i18n";
import { type State, type Store, VIEWS } from "../state/store";
import { fill, h } from "./dom";

const PLAY_MS = 900;
/** Views that show one right type at a time. */
const RIGHT_VIEWS = new Set<State["view"]>(["map", "entity"]);

export function renderHeader(root: HTMLElement, data: Dataset, store: Store): void {
  const { lang, right, view } = store.state;
  const rights = data.meta.vocab.right_types;
  const core = Object.keys(rights).filter((k) => rights[k].core);
  const other = Object.keys(rights).filter((k) => !rights[k].core);
  const tab = (key: string) =>
    h("button", { class: "tab", "aria-pressed": String(key === right), onclick: () => store.set({ right: key }) },
      label(rights[key], lang, key));
  const select = h("select", { "aria-label": t("otherRights", lang),
    onchange: (e: Event) => store.set({ right: (e.target as HTMLSelectElement).value }) },
    h("option", { value: "", disabled: true, selected: !other.includes(right) }, t("otherRights", lang)),
    ...other.map((k) => h("option", { value: k, selected: k === right }, label(rights[k], lang, k))));
  fill(root,
    h("div", { class: "topline" },
      h("h1", {}, t("title", lang)),
      h("nav", { class: "views", "aria-label": t("views", lang) },
        ...VIEWS.map((v) => h("button", { "aria-pressed": String(v === view), onclick: () => store.set({ view: v }) },
          t(`view_${v}` as StringKey, lang)))),
      h("div", { class: "langs", role: "group", "aria-label": t("language", lang) },
        ...LANGS.map((l: Lang) => h("button", { "aria-pressed": String(l === lang), lang: l,
          onclick: () => store.set({ lang: l }) }, l.toUpperCase())))),
    RIGHT_VIEWS.has(view) ? h("nav", { class: "tabs", "aria-label": t("right", lang) }, ...core.map(tab), select) : null,
  );
}

export class YearBar {
  private timer: number | undefined;
  private slider: HTMLInputElement;
  private output: HTMLOutputElement;
  private playButton: HTMLButtonElement;
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;

  constructor(root: HTMLElement, private data: Dataset, private store: Store) {
    const { yearMin, yearMax } = data.meta;
    this.slider = h("input", { type: "range", min: String(yearMin), max: String(yearMax), step: "1",
      oninput: () => this.go(Number(this.slider.value)) });
    this.output = h("output", { class: "year" });
    this.prev = h("button", { class: "icon", onclick: () => this.go(store.state.year - 1) }, "‹");
    this.next = h("button", { class: "icon", onclick: () => this.go(store.state.year + 1) }, "›");
    this.playButton = h("button", { class: "play", onclick: () => this.toggle() });
    root.replaceChildren(this.prev, this.playButton, this.next, this.slider, this.output);
    document.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea") && target !== this.slider) return;
      if (e.key === "ArrowLeft") this.go(store.state.year - 1);
      else if (e.key === "ArrowRight") this.go(store.state.year + 1);
      else return;
      e.preventDefault();
    });
    this.update();
  }

  private go(year: number): void {
    const { yearMin, yearMax } = this.data.meta;
    this.store.set({ year: Math.min(yearMax, Math.max(yearMin, year)) });
  }

  private toggle(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    } else {
      if (this.store.state.year >= this.data.meta.yearMax) this.go(this.data.meta.yearMin);
      this.timer = window.setInterval(() => {
        if (this.store.state.year >= this.data.meta.yearMax) this.toggle();
        else this.go(this.store.state.year + 1);
      }, PLAY_MS);
    }
    this.update();
  }

  update(): void {
    const { year, lang } = this.store.state;
    this.slider.value = String(year);
    this.slider.setAttribute("aria-label", t("year", lang));
    this.output.textContent = String(year);
    const playing = this.timer !== undefined;
    this.playButton.textContent = playing ? "❚❚" : "▶";
    this.playButton.setAttribute("aria-label", t(playing ? "pause" : "play", lang));
    this.prev.setAttribute("aria-label", t("previousYear", lang));
    this.next.setAttribute("aria-label", t("nextYear", lang));
  }
}
