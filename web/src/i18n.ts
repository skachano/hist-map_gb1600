// Interface strings in English, French and German, and name lookup with fallback.
import type { Labels, Lang, Names } from "./data/types";

export const LANGS: Lang[] = ["en", "fr", "de"];

const STRINGS = {
  title: { en: "German Bailiwick of Lorraine, 1600–1632", fr: "Bailliage d'Allemagne, 1600–1632",
    de: "Deutsches Bellistum Lothringen, 1600–1632" },
  year: { en: "Year", fr: "Année", de: "Jahr" },
  play: { en: "Play", fr: "Lecture", de: "Abspielen" },
  pause: { en: "Pause", fr: "Pause", de: "Pause" },
  previousYear: { en: "Previous year", fr: "Année précédente", de: "Vorheriges Jahr" },
  nextYear: { en: "Next year", fr: "Année suivante", de: "Nächstes Jahr" },
  right: { en: "Right", fr: "Droit", de: "Recht" },
  otherRights: { en: "Other rights", fr: "Autres droits", de: "Weitere Rechte" },
  language: { en: "Language", fr: "Langue", de: "Sprache" },
  legend: { en: "Holders", fr: "Détenteurs", de: "Inhaber" },
  otherHolders: { en: "Other holders", fr: "Autres détenteurs", de: "Andere Inhaber" },
  contested: { en: "Contested or disputed", fr: "Contesté ou litigieux", de: "Umstritten" },
  shared: { en: "Shared (several holders)", fr: "Partagé (plusieurs détenteurs)",
    de: "Geteilt (mehrere Inhaber)" },
  noData: { en: "Not recorded", fr: "Non renseigné", de: "Nicht belegt" },
  inherited: { en: "via", fr: "via", de: "über" },
  places: { en: "places", fr: "lieux", de: "Orte" },
  close: { en: "Close", fr: "Fermer", de: "Schließen" },
  names: { en: "Names", fr: "Noms", de: "Namen" },
  type: { en: "Type", fr: "Type", de: "Art" },
  belongsTo: { en: "Belongs to", fr: "Fait partie de", de: "Gehört zu" },
  rightsIn: { en: "Rights in", fr: "Droits en", de: "Rechte im Jahr" },
  noRights: { en: "No rights recorded for this year.", fr: "Aucun droit renseigné pour cette année.",
    de: "Für dieses Jahr sind keine Rechte belegt." },
  pages: { en: "p.", fr: "p.", de: "S." },
  approximate: { en: "Approximate location (placed at its commune)",
    fr: "Localisation approximative (placé sur sa commune)", de: "Ungefähre Lage (bei der Gemeinde verortet)" },
  loading: { en: "Loading…", fr: "Chargement…", de: "Wird geladen…" },
  loadError: { en: "The data could not be loaded.", fr: "Les données n'ont pas pu être chargées.",
    de: "Die Daten konnten nicht geladen werden." },
  source: { en: "Source", fr: "Source", de: "Quelle" },
  approxAreas: { en: "Areas are approximate: the book lists members, not boundaries.",
    fr: "Les surfaces sont approximatives : le livre donne les membres, pas les limites.",
    de: "Flächen sind Näherungen: das Buch nennt Mitglieder, keine Grenzen." },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

/** A place or entity name in `lang`, falling back through French (the book's language). */
export function name(names: Names | undefined, lang: Lang, fallback = ""): string {
  return names?.[lang] ?? names?.fr ?? names?.en ?? names?.de ?? fallback;
}

export function label(labels: Labels | undefined, lang: Lang, fallback = ""): string {
  return labels?.[lang] ?? fallback;
}
