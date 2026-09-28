// Application state, mirrored in the URL hash so any view can be linked:
//   #/map?year=1624&right=high_justice&lang=fr&place=anzeling
import type { Lang } from "../data/types";
import { LANGS } from "../i18n";

export type View = "map";

export interface State {
  view: View;
  year: number;
  right: string;
  lang: Lang;
  place?: string;
  entity?: string;
}

export const DEFAULT_STATE: State = { view: "map", year: 1600, right: "suzerain", lang: "en" };

export function parseHash(hash: string, years: [number, number], rights: Set<string>): State {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const q = new URLSearchParams(query);
  const year = Number(q.get("year"));
  const lang = q.get("lang") as Lang;
  const right = q.get("right") ?? "";
  return {
    view: path === "map" || path === "" ? "map" : DEFAULT_STATE.view,
    year: Number.isInteger(year) && year >= years[0] && year <= years[1] ? year : years[0],
    right: rights.has(right) ? right : DEFAULT_STATE.right,
    lang: LANGS.includes(lang) ? lang : browserLang(),
    place: q.get("place") ?? undefined,
    entity: q.get("entity") ?? undefined,
  };
}

export function toHash(s: State): string {
  const q = new URLSearchParams({ year: String(s.year), right: s.right, lang: s.lang });
  if (s.place) q.set("place", s.place);
  if (s.entity) q.set("entity", s.entity);
  return `#/${s.view}?${q}`;
}

function browserLang(): Lang {
  const prefix = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2) as Lang;
  return LANGS.includes(prefix) ? prefix : "en";
}

type Listener = (state: State, previous: State) => void;

export class Store {
  private listeners: Listener[] = [];

  constructor(private current: State) {}

  get state(): State {
    return this.current;
  }

  set(patch: Partial<State>): void {
    const previous = this.current;
    const next = { ...previous, ...patch };
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    this.current = next;
    for (const listener of this.listeners) listener(next, previous);
  }

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }
}
