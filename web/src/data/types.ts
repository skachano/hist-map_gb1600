// Shapes of the files in public/data/, written by `make build-data` (pipeline/bailliage/web_data.py).
// Empty fields are omitted in the JSON, hence the optional properties.

export type Lang = "en" | "fr" | "de";
export type Names = Partial<Record<Lang, string>>;
export type Labels = Record<Lang, string> & { core?: boolean };
export type Vocab = Record<string, Labels>;

export interface Meta {
  yearMin: number;
  yearMax: number;
  source: string;
  version: string;
  counts: Record<string, number>;
  vocab: {
    place_types: Vocab;
    entity_types: Vocab;
    right_types: Vocab;
    statuses: Vocab;
    event_types: Vocab;
    confidence: Vocab;
    date_precisions: Vocab;
  };
}

export interface Parent {
  id: string;
  from?: number;
  to?: number;
}

export interface Place {
  id: string;
  kind: "settlement" | "territory";
  type: string;
  name: Names;
  variants?: string[];
  lat?: number;
  lon?: number;
  /** how sure the location is */
  geo?: "high" | "medium" | "low";
  /** placed at the commune it belongs to */
  approx?: boolean;
  wd?: string;
  country?: string;
  parents?: Parent[];
  pages?: string;
}

export interface Ruler {
  name: string;
  title?: string;
  from?: number;
  to?: number;
  fp?: string;
  tp?: string;
  pages?: string;
}

export interface Entity {
  id: string;
  type: string;
  name: Names;
  /** 1 = holds the most rights */
  rank: number;
  rights?: number;
  rulers?: Ruler[];
}

export type Status = "held" | "pledged" | "claimed" | "contested" | "sequestered" | "renounced";

export interface Right {
  place: string;
  right: string;
  holder: string;
  share?: string;
  /** absent = held */
  status?: Exclude<Status, "held">;
  disputed?: boolean;
  against?: string[];
  /** inclusive; absent = open */
  from?: number;
  to?: number;
  fp?: string;
  tp?: string;
  /** absent = high */
  conf?: "medium" | "low";
  pages?: string;
  quote?: string;
  note?: string;
}

export interface HistEvent {
  year: number;
  place: string;
  right?: string;
  from?: string;
  to?: string;
  type: string;
  text: string;
  conf?: "medium" | "low";
  pages?: string;
}

export interface Dataset {
  meta: Meta;
  places: Map<string, Place>;
  entities: Map<string, Entity>;
  rights: Right[];
  events: HistEvent[];
  territories: GeoJSON.FeatureCollection;
  cells: GeoJSON.FeatureCollection;
}
