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
  views: { en: "Views", fr: "Vues", de: "Ansichten" },
  view_map: { en: "Rights map", fr: "Carte des droits", de: "Rechtekarte" },
  view_disputes: { en: "Disputes", fr: "Litiges", de: "Streitfälle" },
  view_entity: { en: "Holders", fr: "Détenteurs", de: "Inhaber" },
  view_matrix: { en: "Table", fr: "Tableau", de: "Tabelle" },
  view_changes: { en: "Changes", fr: "Changements", de: "Veränderungen" },
  view_about: { en: "About & sources", fr: "À propos et sources", de: "Über & Quellen" },
  pledged: { en: "Held in pledge (dashed)", fr: "Engagé (tirets)", de: "Verpfändet (gestrichelt)" },
  inheritedLegend: { en: "Lighter: via its territory", fr: "Plus clair : via son territoire",
    de: "Heller: über sein Territorium" },
  giveColour: { en: "Colour this holder", fr: "Colorer ce détenteur", de: "Diesen Inhaber einfärben" },
  resetColours: { en: "Reset colours", fr: "Couleurs par défaut", de: "Farben zurücksetzen" },
  timeline: { en: "1600–1632", fr: "1600–1632", de: "1600–1632" },
  events: { en: "Changes of holder", fr: "Changements de détenteur", de: "Inhaberwechsel" },
  noEvents: { en: "No recorded changes.", fr: "Aucun changement renseigné.", de: "Keine belegten Veränderungen." },
  chooseEntity: { en: "Choose a holder", fr: "Choisir un détenteur", de: "Inhaber wählen" },
  rulers: { en: "Rulers", fr: "Souverains et seigneurs", de: "Herrscher" },
  heldDirectly: { en: "Held directly in", fr: "Détenus directement en", de: "Direkt gehalten im Jahr" },
  gainedLost: { en: "Gained and lost", fr: "Acquis et perdus", de: "Gewonnen und verloren" },
  gained: { en: "gained", fr: "acquis", de: "gewonnen" },
  lost: { en: "lost", fr: "perdu", de: "verloren" },
  onMap: { en: "On the map: places where it holds", fr: "Sur la carte : lieux où il détient",
    de: "Auf der Karte: Orte mit" },
  entityClaims: { en: "Claims it there", fr: "Le revendique", de: "Beansprucht es dort" },
  disputesIn: { en: "Disputes in", fr: "Litiges en", de: "Streitfälle im Jahr" },
  noDisputes: { en: "No disputes recorded for this year.", fr: "Aucun litige renseigné pour cette année.",
    de: "Für dieses Jahr sind keine Streitfälle belegt." },
  against: { en: "against", fr: "contre", de: "gegen" },
  allRights: { en: "All rights", fr: "Tous les droits", de: "Alle Rechte" },
  coreRights: { en: "Main rights", fr: "Droits principaux", de: "Hauptrechte" },
  territory: { en: "Territory", fr: "Territoire", de: "Territorium" },
  allTerritories: { en: "All territories", fr: "Tous les territoires", de: "Alle Territorien" },
  holder: { en: "Holder", fr: "Détenteur", de: "Inhaber" },
  allHolders: { en: "All holders", fr: "Tous les détenteurs", de: "Alle Inhaber" },
  place: { en: "Place", fr: "Lieu", de: "Ort" },
  exportCsv: { en: "Export CSV", fr: "Exporter en CSV", de: "Als CSV exportieren" },
  rowsShown: { en: "places shown", fr: "lieux affichés", de: "Orte angezeigt" },
  changesPerYear: { en: "Changes per year", fr: "Changements par année", de: "Veränderungen pro Jahr" },
  before1600: { en: "Include earlier changes", fr: "Inclure les changements antérieurs",
    de: "Frühere Veränderungen einbeziehen" },
  showOnMap: { en: "Show on the map", fr: "Voir sur la carte", de: "Auf der Karte zeigen" },
  anyRight: { en: "Any right", fr: "Tout droit", de: "Jedes Recht" },
  skipToTable: { en: "Skip the map: show the same data as a table", fr: "Passer la carte : voir les mêmes données en tableau",
    de: "Karte überspringen: dieselben Daten als Tabelle" },
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
