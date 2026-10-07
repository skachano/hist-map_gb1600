// About & sources: where Hiegel's bailliage d'Allemagne (1600–1632) and Thierry Alix's Dénombrement
// du duché de Lorraine (1594, as the atlas hist_map_dl1594 records it) part, in tables. Places link to
// the map, Hiegel's units to the Territories view; Alix's divisions are named, since this atlas doesn't
// have them.
import type { Dataset, Lang } from "../data/types";
import { name, t } from "../i18n";
import type { Store } from "../state/store";
import { h } from "./dom";
import { openPlace, showOnMap } from "./navigate";

type Text = Record<Lang, string>;

export const DUCHY_URL = "https://skachano.github.io/hist-map_dl1594";
export const DUCHY = /Duchy of Lorraine atlas|atlas du duché de Lorraine|Atlas des Herzogtums Lothringen|ロレーヌ公国アトラス/;

/** A text with the Duchy of Lorraine atlas (hist_map_dl1594), named in any language, linked to it. */
export function linkDuchy(text: string): (Node | string)[] {
  const m = DUCHY.exec(text);
  if (!m) return [text];
  return [text.slice(0, m.index), h("a", { href: DUCHY_URL, target: "_blank", rel: "noopener" }, m[0]),
    ...linkDuchy(text.slice(m.index + m[0].length))];
}
/** A run of text: plain, translated, a place of this atlas (a link), or one of Alix's divisions. */
type Part = string | Text | { place: string } | { alix: string };
/** Hiegel's units or places, with his pages. */
type Cite = { parts: Part[]; pages?: string };

/** Alix's divisions, named as the Duchy of Lorraine atlas names them. */
export const ALIX: Record<string, Text> = {
  "provostship-sierck": { en: "Provostship of Sierck", fr: "Prévôté de Sierck", de: "Schultheißerei Sierck", ja: "シエルク代官区" },
  "sub-provostship-sierck": { en: "Sub-provostship of Sierck", fr: "Sous-prévôté de Sierck", de: "Unterschultheißerei Sierck",
    ja: "シエルク副代官区" },
  "office-boulay": { en: "Office of Boulay", fr: "Office de Boulay", de: "Amt Bolchen", ja: "ブレ管区" },
  "office-vaudrevange": { en: "Office of Wallerfangen", fr: "Office de Vaudrevange", de: "Amt Wallerfangen", ja: "ヴァラーファンゲン管区" },
  "office-siersberg": { en: "Office of Siersburg", fr: "Office de Siersberg", de: "Amt Siersburg", ja: "ジールスベルク管区" },
  "district-saargau": { en: "District of Saargau", fr: "Circonscription de Saargau", de: "Bezirk Saargau", ja: "ザールガウ管区" },
  "district-merzig": { en: "District of Merzig", fr: "Circonscription de Merzig", de: "Bezirk Merzig", ja: "メルツィヒ管区" },
  "office-schaumbourg": { en: "Office of Schaumburg", fr: "Office de Schaumbourg", de: "Amt Schaumburg", ja: "シャウムブルク管区" },
  "provostship-keltern-ostern": { en: "Provostship of Keltern-Ostern", fr: "Prévôté de Keltern-Ostern",
    de: "Schultheißerei Keltern-Ostern", ja: "ケルテルン＝オステルン代官区" },
  "office-sarreguemines": { en: "Office of Sarreguemines", fr: "Office de Sarreguemines", de: "Amt Saargemünd", ja: "サルグミーヌ管区" },
  "castellany-dieuze": { en: "Castellany of Dieuze", fr: "Châtellenie de Dieuze", de: "Kellerei Duß", ja: "ディウーズ城代管区" },
  "castellany-marimont": { en: "Castellany of Marimont", fr: "Châtellenie de Marimont", de: "Kellerei Mörsberg", ja: "マリモン城代管区" },
  "district-puttelange": { en: "District of Puttelange", fr: "Circonscription de Puttelange", de: "Bezirk Püttlingen", ja: "ピュトランジュ管区" },
  "district-beaurains": { en: "District of Berus", fr: "Circonscription de Berus", de: "Bezirk Berus", ja: "ベールス管区" },
  "district-morhange": { en: "District of Morhange", fr: "Circonscription de Morhange", de: "Bezirk Mörchingen", ja: "モランジュ管区" },
  "district-faulquemont": { en: "District of Faulquemont", fr: "Circonscription de Faulquemont", de: "Bezirk Falkenberg", ja: "フォルクモン管区" },
  "district-forbach": { en: "District of Forbach", fr: "Circonscription de Forbach", de: "Bezirk Forbach", ja: "フォルバック管区" },
  "district-bitche": { en: "District of Bitche", fr: "Circonscription de Bitche", de: "Bezirk Bitsch", ja: "ビッチュ管区" },
  "castellany-hombourg-et-saint-avold": { en: "Castellany of Hombourg and Saint-Avold", fr: "Châtellenie de Hombourg et Saint-Avold",
    de: "Kellerei Homburg und Sankt Avold", ja: "オンブール・サン＝タヴォルド城代管区" },
  "town-district-marsal": { en: "Town of Marsal", fr: "Ville de Marsal", de: "Stadt Marsal", ja: "マルサル都市管区" },
  "town-district-sarrebourg": { en: "Town of Sarrebourg", fr: "Ville de Sarrebourg", de: "Stadt Saarburg", ja: "サールブール都市管区" },
  "district-sarreck": { en: "District of Sarreck", fr: "Circonscription de Sarreck", de: "Bezirk Saareck", ja: "サレック管区" },
  "district-sarralbe": { en: "District of Sarralbe", fr: "Circonscription de Sarralbe", de: "Bezirk Saaralben", ja: "サラルブ管区" },
  "district-phalsbourg": { en: "District of Phalsbourg", fr: "Circonscription de Phalsbourg", de: "Bezirk Pfalzburg", ja: "ファルスブール管区" },
  "provostship-amance": { en: "Provostship of Amance", fr: "Prévôté d'Amance", de: "Schultheißerei Amance", ja: "アマンス代官区" },
  "provostship-einville": { en: "Provostship of Einville", fr: "Prévôté d'Einville", de: "Schultheißerei Einville", ja: "アンヴィル代官区" },
  "mayoralty-hilsperg": { en: "Mayoralty of Hilsperg", fr: "Mairie de Hilsperg", de: "Meierei Hilsperg", ja: "ヒルスペルグ村長区" },
};

/** The sections of an entry of Alix's, under its division. */
const SECTION: Record<string, Text> = {
  domain: { en: "domain", fr: "domaine", de: "Domäne", ja: "直轄領" },
  fief: { en: "fiefs", fr: "fiefs", de: "Lehen", ja: "封土" },
  clergy: { en: "clergy", fr: "clergé", de: "Geistlichkeit", ja: "教会領" },
};

/** The entries of Alix's the section cites: his spelling, his division and its section. */
export const ENTRIES: Record<number, { name: string; alix: string; section?: string }> = {
  1238: { name: "Hymerstroff", alix: "sub-provostship-sierck", section: "domain" },
  1269: { name: "Auselingen", alix: "sub-provostship-sierck", section: "domain" },
  1304: { name: "Fliessborn", alix: "provostship-sierck", section: "clergy" },
  1305: { name: "Hasenholb", alix: "provostship-sierck", section: "clergy" },
  1325: { name: "Gursingen", alix: "provostship-sierck", section: "fief" },
  1335: { name: "Anselnigen", alix: "provostship-sierck", section: "fief" },
  1341: { name: "Pomern", alix: "provostship-sierck", section: "fief" },
  1386: { name: "Tuttingen", alix: "office-boulay", section: "fief" },
  1389: { name: "Buchingen", alix: "office-boulay", section: "fief" },
  1390: { name: "Pfeningen", alix: "office-boulay", section: "fief" },
  1394: { name: "Weiblingen", alix: "office-boulay", section: "fief" },
  1428: { name: "Mettloch", alix: "office-siersberg", section: "clergy" },
  1429: { name: "Kuchingen", alix: "office-siersberg", section: "clergy" },
  1458: { name: "Wchingen", alix: "district-saargau" },
  1460: { name: "Mondorff", alix: "district-saargau" },
  1464: { name: "Harlingen", alix: "district-merzig" },
  1505: { name: "Mondorff", alix: "office-schaumbourg", section: "clergy" },
  1506: { name: "Harlingen", alix: "office-schaumbourg", section: "clergy" },
  1527: { name: "Wehingen", alix: "office-schaumbourg", section: "fief" },
  1549: { name: "Bleysspach", alix: "provostship-keltern-ostern", section: "fief" },
  1577: { name: "Tentlingen", alix: "office-sarreguemines", section: "clergy" },
  1578: { name: "Rausspach", alix: "office-sarreguemines", section: "clergy" },
  1585: { name: "Tentlingen", alix: "office-sarreguemines", section: "fief" },
  1653: { name: "Himradt", alix: "district-puttelange" },
  1681: { name: "Weyllingen", alix: "district-beaurains" },
  1683: { name: "Gersslingen", alix: "district-beaurains" },
  1733: { name: "Dutlingen", alix: "district-forbach" },
  1736: { name: "Bubingen", alix: "district-forbach" },
  2203: { name: "Eyningen", alix: "mayoralty-hilsperg", section: "fief" },
  2211: { name: "Eych", alix: "mayoralty-hilsperg", section: "fief" },
  2218: { name: "Ranschborn", alix: "mayoralty-hilsperg", section: "domain" },
  2219: { name: "Stanwenstein", alix: "mayoralty-hilsperg", section: "domain" },
};

const TITLE: Text = { en: "Hiegel and Alix compared", fr: "Hiegel et Alix comparés", de: "Hiegel und Alix im Vergleich",
  ja: "Hiegel と Alix の比較" };

const INTRO: Text = {
  en: "Thierry Alix, president of the Chambre des Comptes of Lorraine, described the duchy for Duke Charles III in 1594, a few years before the bailiwick this atlas shows: his Dénombrement du duché de Lorraine (ed. 1870) gives the German bailiwick office by office, and the Duchy of Lorraine atlas records it. Set side by side for 1600, the two place most of the settlements they share in the same unit. The tables give where they part: units under other names, lands Alix keeps out of the bailiwicks, villages filed under different offices, and the places where the Duchy of Lorraine atlas follows Hiegel against the editors' index. Places link to the map and Hiegel's units to the Territories view; Alix's divisions are named, with the numbers of his entries.",
  fr: "Thierry Alix, président de la Chambre des comptes de Lorraine, décrivit le duché pour le duc Charles III en 1594, quelques années avant le bailliage que montre cet atlas : son Dénombrement du duché de Lorraine (éd. 1870) donne le bailliage d'Allemagne office par office, et l'atlas du duché de Lorraine le reprend. Mis côte à côte pour 1600, les deux placent la plupart de leurs localités communes dans la même circonscription. Les tableaux disent où ils divergent : des circonscriptions sous d'autres noms, des terres qu'Alix laisse hors des bailliages, des villages rangés sous d'autres offices, et les lieux où l'atlas du duché de Lorraine suit Hiegel contre la table des éditeurs. Les lieux renvoient à la carte et les circonscriptions de Hiegel à la vue Territoires ; celles d'Alix sont nommées, avec les numéros de ses articles.",
  de: "Thierry Alix, Präsident der lothringischen Rechenkammer, beschrieb das Herzogtum 1594 für Herzog Karl III., wenige Jahre vor dem Bellistum, das dieser Atlas zeigt: Sein Dénombrement du duché de Lorraine (Ausg. 1870) führt das Deutsche Bellistum Amt für Amt auf, und der Atlas des Herzogtums Lothringen verzeichnet es. Für 1600 nebeneinandergestellt, ordnen beide die meisten ihrer gemeinsamen Orte demselben Bezirk zu. Die Tabellen zeigen, wo sie auseinandergehen: Bezirke unter anderen Namen, Gebiete, die Alix außerhalb der Bellistümer führt, Dörfer unter anderen Ämtern und die Orte, an denen der Atlas des Herzogtums Lothringen gegen das Register der Herausgeber Hiegel folgt. Orte führen zur Karte, Hiegels Bezirke zur Ansicht Territorien; die Bezirke von Alix sind genannt, mit den Nummern seiner Einträge.",
  ja: "ロレーヌ会計院長 Thierry Alix は、本アトラスが示すバイイ管区の数年前、1594年に公爵シャルル3世のために公国を記述した。その『Dénombrement du duché de Lorraine』（1870年版）はドイツ・バイイ管区を管区ごとに挙げており、ロレーヌ公国アトラスがそれを収録している。1600年について並べると、両者に共通する集落の大半は同じ区画に属する。以下の表は両者の相違を示す。名称の異なる区画、Alix がバイイ管区の外に置く地、異なる管区に記された村、そしてロレーヌ公国アトラスが編者の索引ではなく Hiegel に従った地である。地名は地図に、Hiegel の区画は「領域」表示にリンクする。Alix の区画は名称と項目番号で示す。",
};

const COL = {
  alix: { en: "Alix (1594)", fr: "Alix (1594)", de: "Alix (1594)", ja: "Alix（1594年）" },
  hiegel: { en: "Hiegel (1600)", fr: "Hiegel (1600)", de: "Hiegel (1600)", ja: "Hiegel（1600年）" },
  settlement: { en: "Settlement", fr: "Localité", de: "Ort", ja: "集落" },
  note: { en: "Note", fr: "Remarque", de: "Anmerkung", ja: "備考" },
  no: { en: "No.", fr: "n°", de: "Nr.", ja: "番号" },
  alixSpelling: { en: "Alix", fr: "Alix", de: "Alix", ja: "Alix" },
  index: { en: "Editors' index", fr: "Table des éditeurs", de: "Register der Herausgeber", ja: "編者の索引" },
  here: { en: "Here", fr: "Ici", de: "Hier", ja: "本アトラス" },
  hiegelOnly: { en: "Hiegel", fr: "Hiegel", de: "Hiegel", ja: "Hiegel" },
} satisfies Record<string, Text>;
const ENTRY: Text = { en: "no.", fr: "n°", de: "Nr.", ja: "項目" };

// --- 1. Units: Hiegel's offices in 1600 and Alix's divisions of the bailiwick ---

const UNITS_TITLE: Text = { en: "Divisions", fr: "Circonscriptions", de: "Bezirke", ja: "区画" };
export const UNITS: [string[], string[]][] = [
  [["office-sierck"], ["provostship-sierck"]],
  [["office-boulay"], ["office-boulay"]],
  [["office-vaudrevange"], ["office-vaudrevange"]],
  [["office-siersberg"], ["office-siersberg"]],
  [["condominium-merzig-saargau"], ["district-saargau", "district-merzig"]],
  [["office-schaumberg"], ["office-schaumbourg"]],
  [["office-sarreguemines"], ["office-sarreguemines"]],
  [["office-dieuze"], ["castellany-dieuze", "castellany-marimont"]],
  [["office-puttelange"], ["district-puttelange"]],
  [["office-berus"], ["district-beaurains"]],
  [["office-morhange"], ["district-morhange"]],
  [["office-faulquemont"], ["district-faulquemont"]],
  [["office-forbach"], ["district-forbach"]],
];
const UNITS_AFTER: Record<Lang, Part[]> = {
  en: ["Merzig and the Saargau, which Lorraine shared with the elector of Trier, are one condominium of two halves in Hiegel (",
    { place: "office-merzig" }, ", ", { place: "saargau" }, "), two districts in Alix. Hiegel's ", { place: "office-dieuze" },
    " is the castellanies of ", { place: "castellany-dieuze" }, " and ", { place: "lordship-marimont" },
    " (pp. 20, 74–75), which Alix gives as two divisions of their own."],
  fr: ["Merzig et le Saargau, que la Lorraine partageait avec l'électeur de Trèves, sont chez Hiegel un condominium en deux moitiés (",
    { place: "office-merzig" }, ", ", { place: "saargau" }, "), chez Alix deux circonscriptions. L'", { place: "office-dieuze" },
    " de Hiegel réunit les châtellenies de ", { place: "castellany-dieuze" }, " et de ", { place: "lordship-marimont" },
    " (p. 20, 74-75), qu'Alix donne comme deux circonscriptions distinctes."],
  de: ["Merzig und der Saargau, die Lothringen mit dem Kurfürsten von Trier teilte, sind bei Hiegel ein Kondominium aus zwei Hälften (",
    { place: "office-merzig" }, ", ", { place: "saargau" }, "), bei Alix zwei Bezirke. Hiegels ", { place: "office-dieuze" },
    " umfasst die Kellereien ", { place: "castellany-dieuze" }, " und ", { place: "lordship-marimont" },
    " (S. 20, 74–75), die Alix als zwei eigene Bezirke führt."],
  ja: ["ロレーヌがトリーア選帝侯と共有したメルツィヒとザールガウは、Hiegel では二つの半分（", { place: "office-merzig" }, "、",
    { place: "saargau" }, "）からなる一つの共同統治地、Alix では二つの区画である。Hiegel の", { place: "office-dieuze" }, "は",
    { place: "castellany-dieuze" }, "と", { place: "lordship-marimont" }, "からなり（p. 20, 74–75）、Alix はこれらを別々の区画とする。"],
};

// --- 2. Lands Alix keeps out of the bailiwicks ---

const OUTSIDE_TITLE: Text = { en: "Lands outside Alix's bailiwicks", fr: "Terres hors des bailliages d'Alix",
  de: "Gebiete außerhalb von Alix' Bellistümern", ja: "Alix がバイイ管区の外に置く地" };
const OUTSIDE_INTRO: Text = {
  en: "Hiegel counts these in the bailiwick in 1600, but as contested: their subjects claimed not to belong to it (p. 11). Alix files them among the lands \"qui ne sont pas de bailliages\" (1870 ed., pp. 34, 107–115).",
  fr: "Hiegel les compte dans le bailliage en 1600, mais contestées : leurs sujets prétendaient ne pas en faire partie (p. 11). Alix les range parmi les terres « qui ne sont pas de bailliages » (éd. 1870, p. 34, 107-115).",
  de: "Hiegel zählt sie 1600 zum Bellistum, doch umstritten: ihre Untertanen bestritten, dazuzugehören (S. 11). Alix führt sie unter den Gebieten, „qui ne sont pas de bailliages“ (Ausg. 1870, S. 34, 107–115).",
  ja: "Hiegel はこれらを1600年のバイイ管区に含めるが、帰属は争われていた。住民は管区に属さないと主張した（p. 11）。Alix はこれらを「バイイ管区に属さない地」（1870年版 p. 34, 107–115）に分類する。",
};
export const OUTSIDE: { hiegel: Cite[]; alix: string[]; note: Text }[] = [
  { hiegel: [{ parts: [{ place: "county-bitche" }], pages: "9, 11–12, 21–22" }], alix: ["district-bitche"], note: {
    en: "United to the duchy in 1572; in 1594 the receiver Jean Bosch reported that it was not part of the bailiwick; settled with Hanau-Lichtenberg in 1606.",
    fr: "Uni au duché en 1572 ; en 1594, le receveur Jean Bosch rapporte qu'il n'est pas du bailliage ; accord avec Hanau-Lichtenberg en 1606.",
    de: "1572 mit dem Herzogtum vereinigt; 1594 meldete der Rezeptor Jean Bosch, es gehöre nicht zum Bellistum; Vergleich mit Hanau-Lichtenberg 1606.",
    ja: "1572年に公国に統合。1594年に収税官ジャン・ボッシュはバイイ管区に属さないと報告した。1606年にハーナウ＝リヒテンベルクと和解。" } },
  { hiegel: [{ parts: [{ place: "office-hombourg-haut" }], pages: "11, 21, 63, 101" }, { parts: [{ place: "advocacy-saint-avold" }], pages: "11" }],
    alix: ["castellany-hombourg-et-saint-avold"], note: {
    en: "Bought from the bishop of Metz in 1581; still an imperial fief of the bishop, exempt from ducal charges, with appeals to Vic and the Imperial Chamber.",
    fr: "Achetée à l'évêque de Metz en 1581 ; toujours fief impérial de l'évêque, exempte des charges ducales, les appels allant à Vic et à la Chambre impériale.",
    de: "1581 vom Bischof von Metz gekauft; weiterhin Reichslehen des Bischofs, frei von herzoglichen Lasten, mit Berufung nach Vic und an das Reichskammergericht.",
    ja: "1581年にメス司教から購入。なお司教の帝国封土で、公爵の負担を免れ、上訴はヴィックと帝国最高法院へ向かった。" } },
  { hiegel: [{ parts: [{ place: "castellany-marsal" }], pages: "10–11, 21–22" }], alix: ["town-district-marsal"], note: {
    en: "Bought from the bishop of Metz in 1593.", fr: "Achetée à l'évêque de Metz en 1593.",
    de: "1593 vom Bischof von Metz gekauft.", ja: "1593年にメス司教から購入。" } },
  { hiegel: [{ parts: [{ place: "provostship-sarrebourg" }], pages: "11, 21" }], alix: ["town-district-sarrebourg"], note: {
    en: "Bought from the bishop of Metz in 1562; paid the aid of 1585 to the bailiwick of Nancy.",
    fr: "Achetée à l'évêque de Metz en 1562 ; paya l'aide de 1585 au bailliage de Nancy.",
    de: "1562 vom Bischof von Metz gekauft; zahlte die Beihilfe von 1585 an das Bellistum Nancy.",
    ja: "1562年にメス司教から購入。1585年の援助金はナンシー・バイイ管区に納めた。" } },
  { hiegel: [{ parts: [{ place: "lordship-sarreck" }], pages: "9, 11, 22" }], alix: ["district-sarreck"], note: {
    en: "Paid the aid of 1585 to the bailiwick of Nancy.", fr: "Paya l'aide de 1585 au bailliage de Nancy.",
    de: "Zahlte die Beihilfe von 1585 an das Bellistum Nancy.", ja: "1585年の援助金はナンシー・バイイ管区に納めた。" } },
  { hiegel: [{ parts: [{ place: "office-sarralbe" }], pages: "11, 21" }], alix: ["district-sarralbe"], note: {
    en: "Bought from the bishop of Metz in 1562.", fr: "Achetée à l'évêque de Metz en 1562.",
    de: "1562 vom Bischof von Metz gekauft.", ja: "1562年にメス司教から購入。" } },
  { hiegel: [{ parts: [{ place: "office-phalsbourg" }], pages: "11, 21" }], alix: ["district-phalsbourg"], note: {
    en: "Bought in 1583; not subject to the aid of 1585.", fr: "Achetée en 1583 ; non soumise à l'aide de 1585.",
    de: "1583 gekauft; nicht zur Beihilfe von 1585 verpflichtet.", ja: "1583年に購入。1585年の援助金は課されなかった。" } },
];
const OUTSIDE_AFTER: Record<Lang, Part[]> = {
  en: ["Hiegel also counts the ", { place: "lordship-fenetrange" }, " (pp. 9, 22), most of whose villages Alix doesn't name, and lands added later: the ",
    { place: "principality-lixheim" }, " in 1623, the ", { place: "county-sarrewerden" }, " and the ", { place: "marquisate-faulquemont" },
    " in 1629. Two villages of Alix's bailiwick of Nancy, ", { place: "chicourt" }, " (", { alix: "provostship-amance" }, ") and ",
    { place: "lezey" }, " (", { alix: "provostship-einville" }, "), were reckoned to the ", { place: "office-dieuze" },
    " by its accountants from 1600 to 1620 (p. 74)."],
  fr: ["Hiegel compte aussi la ", { place: "lordship-fenetrange" }, " (p. 9, 22), dont Alix ne nomme pas la plupart des villages, et des terres acquises plus tard : la ",
    { place: "principality-lixheim" }, " en 1623, le ", { place: "county-sarrewerden" }, " et le ", { place: "marquisate-faulquemont" },
    " en 1629. Deux villages du bailliage de Nancy chez Alix, ", { place: "chicourt" }, " (", { alix: "provostship-amance" }, ") et ",
    { place: "lezey" }, " (", { alix: "provostship-einville" }, "), furent comptés à l'", { place: "office-dieuze" },
    " par ses comptables de 1600 à 1620 (p. 74)."],
  de: ["Hiegel zählt auch die ", { place: "lordship-fenetrange" }, " (S. 9, 22), deren Dörfer Alix meist nicht nennt, und später erworbene Gebiete: das ",
    { place: "principality-lixheim" }, " 1623, die ", { place: "county-sarrewerden" }, " und die ", { place: "marquisate-faulquemont" },
    " 1629. Zwei Dörfer von Alix' Bellistum Nancy, ", { place: "chicourt" }, " (", { alix: "provostship-amance" }, ") und ",
    { place: "lezey" }, " (", { alix: "provostship-einville" }, "), rechneten die Rechnungsführer des ", { place: "office-dieuze" },
    " von 1600 bis 1620 zu ihrem Amt (S. 74)."],
  ja: ["Hiegel はさらに", { place: "lordship-fenetrange" }, "（p. 9, 22。Alix はその村の大半を挙げない）と、のちに加わった地、1623年の",
    { place: "principality-lixheim" }, "、1629年の", { place: "county-sarrewerden" }, "と", { place: "marquisate-faulquemont" },
    "を含める。Alix ではナンシー・バイイ管区の二村、", { place: "chicourt" }, "（", { alix: "provostship-amance" }, "）と",
    { place: "lezey" }, "（", { alix: "provostship-einville" }, "）は、1600年から1620年まで", { place: "office-dieuze" },
    "の会計官によって同管区に算入された（p. 74）。"],
};

// --- 3. Villages both place in the bailiwick, in different units ---

const DIFFER_TITLE: Text = { en: "Villages in different units", fr: "Villages dans des circonscriptions différentes",
  de: "Dörfer in verschiedenen Bezirken", ja: "異なる区画に置かれた村" };
const DIFFER_INTRO: Text = {
  en: "Hiegel, and this atlas after him, files a village in the office it lies in, though he too lists some holdings under an office (Schaumberg's at Harlingen, Mondorf and Wehingen, p. 14). Alix lists under each office its domain, its fiefs and its church lands, and some of these lie in another office's land; the Duchy of Lorraine atlas files a place in every office that lists it.",
  fr: "Hiegel, et cet atlas à sa suite, range un village dans l'office où il se trouve, même s'il donne aussi certains biens sous un office (ceux de Schaumberg à Harlingen, Mondorf et Wehingen, p. 14). Alix donne sous chaque office son domaine, ses fiefs et son clergé, dont certains sont sur les terres d'un autre office ; l'atlas du duché de Lorraine range un lieu dans chaque office qui le donne.",
  de: "Hiegel, und dieser Atlas mit ihm, ordnet ein Dorf dem Amt zu, in dem es liegt, auch wenn er manche Besitzungen ebenfalls unter einem Amt aufführt (die Schaumbergs in Harlingen, Mondorf und Wehingen, S. 14). Alix führt unter jedem Amt seine Domäne, seine Lehen und sein Kirchengut, die zum Teil auf dem Gebiet eines anderen Amts liegen; der Atlas des Herzogtums Lothringen ordnet einen Ort jedem Amt zu, das ihn nennt.",
  ja: "Hiegel は村をその所在する管区に置き、本アトラスもそれに従う。ただし Hiegel も、一部の保有地を管区の下に挙げることがある（シャウムベルクのハルリンゲン、モンドルフ、ヴェヒンゲンの保有地、p. 14）。Alix は各管区の下に、その直轄領・封土・教会領を挙げるが、その一部は他の管区の土地にある。ロレーヌ公国アトラスは、ある地をそれを挙げるすべての管区に含める。",
};
export const DIFFER: { title: Text; rows: { place: string; hiegel: Cite[]; entries: number[]; note?: Record<Lang, Part[]> }[] }[] = [
  { title: { en: "Church lands and fiefs listed under another office", fr: "Clergé et fiefs donnés sous un autre office",
    de: "Kirchengut und Lehen unter einem anderen Amt", ja: "他の管区の下に挙げられた教会領・封土" }, rows: [
    { place: "harlingen", hiegel: [{ parts: [{ place: "office-merzig" }], pages: "14, 53" }], entries: [1464, 1506] },
    { place: "mondorf", hiegel: [{ parts: [{ place: "saargau" }], pages: "14, 53, 55" }, { parts: [{ place: "office-siersberg" }], pages: "53" }],
      entries: [1460, 1505], note: {
      en: ["Alix: \"partie dudict Sargaw et partie de l'office de Sirques\" (Sierck); Hiegel gives the other part to Siersberg."],
      fr: ["Alix : « partie dudict Sargaw et partie de l'office de Sirques » (Sierck) ; Hiegel donne l'autre partie à Siersberg."],
      de: ["Alix: „partie dudict Sargaw et partie de l'office de Sirques“ (Sierck); Hiegel gibt den anderen Teil Siersberg."],
      ja: ["Alix：「partie dudict Sargaw et partie de l'office de Sirques」（シエルク）。Hiegel は残りの部分をジールスベルクとする。"] } },
    { place: "wehingen", hiegel: [{ parts: [{ place: "saargau" }], pages: "14, 53, 55" }], entries: [1458, 1527] },
    { place: "mettlach", hiegel: [{ parts: [{ place: "office-merzig" }], pages: "13, 54" }], entries: [1428] },
    { place: "keuchingen", hiegel: [{ parts: [{ place: "office-merzig" }], pages: "13, 54" }], entries: [1429] },
    { place: "tenteling", hiegel: [{ parts: [{ place: "office-forbach" }], pages: "17" }], entries: [1577, 1585] },
    { place: "heckenransbach", hiegel: [{ parts: [{ place: "office-puttelange" }], pages: "17" }], entries: [1578], note: {
      en: ["\"Rausspach\" is Heckenransbach by the editors' correction, in place of ", { place: "bliesransbach" }, ", a village of Sarreguemines in Hiegel."],
      fr: ["« Rausspach » est Heckenransbach par la correction des éditeurs, au lieu de ", { place: "bliesransbach" }, ", village de Sarreguemines chez Hiegel."],
      de: ["„Rausspach“ ist nach der Berichtigung der Herausgeber Heckenransbach statt ", { place: "bliesransbach" }, ", bei Hiegel ein Dorf von Saargemünd."],
      ja: ["「Rausspach」は編者の訂正によりヘッケンランスバッハとされ、", { place: "bliesransbach" }, "（Hiegel ではサルグミーヌの村）ではない。"] } },
  ] },
  { title: { en: "Fiefs filed under different offices", fr: "Fiefs rangés sous des offices différents",
    de: "Lehen unter verschiedenen Ämtern", ja: "異なる管区に記された封土" }, rows: [
    { place: "tiitting", hiegel: [{ parts: [{ place: "office-sierck" }], pages: "81" }], entries: [1386], note: {
      en: ["Hiegel lists Tütting among the fiefs of the office of Sierck with ", { place: "penning" }, " and ", { place: "buchingen" },
        " (p. 81), villages of the office of Boulay (p. 16), among whose fiefs Alix lists all three (1386, 1389, 1390)."],
      fr: ["Hiegel donne Tütting parmi les fiefs de l'office de Sierck avec ", { place: "penning" }, " et ", { place: "buchingen" },
        " (p. 81), villages de l'office de Boulay (p. 16), parmi les fiefs duquel Alix donne les trois (1386, 1389, 1390)."],
      de: ["Hiegel führt Tütting unter den Lehen des Amts Sierck, mit ", { place: "penning" }, " und ", { place: "buchingen" },
        " (S. 81), Dörfern des Amts Bolchen (S. 16), unter dessen Lehen Alix alle drei nennt (1386, 1389, 1390)."],
      ja: ["Hiegel はテュッティングを", { place: "penning" }, "・", { place: "buchingen" },
        "（ブレ管区の村、p. 16）とともにシエルク管区の封土に挙げる（p. 81）。Alix は三つともブレの封土に挙げる（1386、1389、1390）。"] } },
  ] },
  { title: { en: "Doubtful identifications", fr: "Identifications douteuses", de: "Unsichere Bestimmungen", ja: "疑わしい比定" }, rows: [
    { place: "alzing", hiegel: [{ parts: [{ place: "office-berus" }], pages: "15, 59" }], entries: [1269, 1335], note: {
      en: ["\"Auselingen\" and \"Anselnigen\" are Alzing in the editors' index; Hiegel's Alzing is in the lordship of Berus."],
      fr: ["« Auselingen » et « Anselnigen » sont Alzing dans la table des éditeurs ; l'Alzing de Hiegel est de la seigneurie de Berus."],
      de: ["„Auselingen“ und „Anselnigen“ sind im Register der Herausgeber Alzing; Hiegels Alzing gehört zur Herrschaft Berus."],
      ja: ["「Auselingen」と「Anselnigen」は編者の索引でアルザンとされる。Hiegel のアルザンはベールス領に属する。"] } },
    { place: "guerstling", hiegel: [{ parts: [{ place: "office-berus" }], pages: "15, 58" }, { parts: [{ place: "county-dalem" }], pages: "27" }],
      entries: [1325, 1683], note: {
      en: ["\"Gersslingen\" (Berus) agrees with Hiegel; \"Gursingen\" (Sierck) is Guerstling only by the editors' index."],
      fr: ["« Gersslingen » (Berus) s'accorde avec Hiegel ; « Gursingen » (Sierck) n'est Guerstling que par la table des éditeurs."],
      de: ["„Gersslingen“ (Berus) stimmt mit Hiegel überein; „Gursingen“ (Sierck) ist Guerstling nur nach dem Register der Herausgeber."],
      ja: ["「Gersslingen」（ベールス）は Hiegel と一致する。「Gursingen」（シエルク）をゲルストランとするのは編者の索引のみである。"] } },
    { place: "velving", hiegel: [{ parts: [{ place: "office-boulay" }], pages: "16, 82" }], entries: [1394, 1681], note: {
      en: ["\"Weiblingen\" (Boulay) agrees with Hiegel; \"Weyllingen\" (Berus) is Velving only by the editors' index."],
      fr: ["« Weiblingen » (Boulay) s'accorde avec Hiegel ; « Weyllingen » (Berus) n'est Velving que par la table des éditeurs."],
      de: ["„Weiblingen“ (Bolchen) stimmt mit Hiegel überein; „Weyllingen“ (Berus) ist Velving nur nach dem Register der Herausgeber."],
      ja: ["「Weiblingen」（ブレ）は Hiegel と一致する。「Weyllingen」（ベールス）をヴェルヴァンとするのは編者の索引のみである。"] } },
  ] },
];

// --- 4. Entries the Duchy of Lorraine atlas places where Hiegel does ---

const FOLLOW_TITLE: Text = { en: "Identifications that follow Hiegel", fr: "Identifications qui suivent Hiegel",
  de: "Bestimmungen nach Hiegel", ja: "Hiegel に従った比定" };
const FOLLOW_INTRO: Text = {
  en: "Where the index of the 1870 edition is wrong or leaves a place unlocated, the Duchy of Lorraine atlas places Alix's entry where Hiegel does, at the place of this atlas.",
  fr: "Là où la table de l'édition de 1870 se trompe ou ne situe pas un lieu, l'atlas du duché de Lorraine place l'article d'Alix là où le met Hiegel, au lieu de cet atlas.",
  de: "Wo das Register der Ausgabe von 1870 irrt oder einen Ort nicht verortet, setzt der Atlas des Herzogtums Lothringen den Eintrag von Alix dorthin, wo Hiegel ihn hat, an den Ort dieses Atlas.",
  ja: "1870年版の索引が誤っている場合や地点を特定していない場合、ロレーヌ公国アトラスは Alix の項目を Hiegel と同じく本アトラスの地点に置く。",
};
export const FOLLOW: { entry: number; index: string; place: string; hiegel: Cite }[] = [
  { entry: 1653, index: "Honzrath (Haustadt)", place: "himmrod", hiegel: { parts: [{ place: "lordship-puttelange" }] } },
  { entry: 1390, index: "Freyming (1590)", place: "penning", hiegel: { parts: [{ place: "county-boulay" }], pages: "16, 81" } },
  { entry: 1389, index: "Bockange (Piblange)", place: "buchingen", hiegel: { parts: [{ place: "county-boulay" }], pages: "16, 81" } },
  { entry: 1736, index: "Bubingen, de la seigneurie de Forbach", place: "gauhiving", hiegel: { parts: [{ place: "lordship-forbach" }] } },
  { entry: 1238, index: "—", place: "grosshemmersdorf", hiegel: { parts: [{ place: "office-sierck" }, ", ", { place: "office-boulay" }], pages: "60" } },
  { entry: 1304, index: "Fliessborn", place: "fliessborn", hiegel: { parts: ["Vry"], pages: "13" } },
  { entry: 1305, index: "Hasenholh", place: "hasenholtz", hiegel: { parts: [{ place: "bettelainville" }], pages: "13, 270" } },
  { entry: 1549, index: "Bleysspach", place: "ketternostern", hiegel: { parts: [{ place: "ketternostern" }], pages: "15, 57" } },
  { entry: 1733, index: "Dittelingen", place: "dittelingen", hiegel: { parts: [{ place: "bousbach" }], pages: "17" } },
  { entry: 1341, index: "Pomern", place: "pommern", hiegel: { parts: ["Kochem"], pages: "50" } },
  { entry: 2203, index: "Eyningen", place: "vinningen", hiegel: { parts: [{ place: "vinningen" }], pages: "104–105" } },
  { entry: 2211, index: "Eich", place: "eich-pirmasens", hiegel: { parts: ["Thaleischweiler"], pages: "18" } },
  { entry: 2218, index: "Ranschborn", place: "ranschborn", hiegel: { parts: [{ place: "eppenbrunn" }], pages: "18, 104" } },
  { entry: 2219, index: "Stanwenstein", place: "stanwenstein", hiegel: { parts: [{ place: "vinningen" }], pages: "18, 104, 106" } },
];
const FOLLOW_AFTER: Record<Lang, Part[]> = {
  en: ["Where they still differ, the index stands: \"Balderingen\" (1459) stays at Zerf, where the editors put it, though Hiegel's Baldringen is ",
    { place: "ballern" }, ", which Alix lists as \"Baldern\" (1448)."],
  fr: ["Là où ils divergent encore, la table est suivie : « Balderingen » (1459) reste à Zerf, où le placent les éditeurs, bien que le Baldringen de Hiegel soit ",
    { place: "ballern" }, ", qu'Alix donne sous le nom de « Baldern » (1448)."],
  de: ["Wo sie weiter auseinandergehen, gilt das Register: „Balderingen“ (1459) bleibt bei Zerf, wohin die Herausgeber es setzen, obwohl Hiegels Baldringen ",
    { place: "ballern" }, " ist, das Alix als „Baldern“ führt (1448)."],
  ja: ["なお相違が残る場合は索引に従う。「Balderingen」（1459）は編者のとおりツェルフに置く。ただし Hiegel の Baldringen は",
    { place: "ballern" }, "であり、Alix はこれを「Baldern」（1448）として挙げる。"],
};

const allParts = (): Part[] => [
  ...Object.values(UNITS_AFTER).flat(), ...Object.values(OUTSIDE_AFTER).flat(), ...Object.values(FOLLOW_AFTER).flat(),
  ...DIFFER.flatMap((g) => g.rows.flatMap((r) => Object.values(r.note ?? {}).flat())),
  ...[...OUTSIDE.flatMap((r) => r.hiegel), ...DIFFER.flatMap((g) => g.rows.flatMap((r) => r.hiegel)), ...FOLLOW.map((r) => r.hiegel)]
    .flatMap((c) => c.parts),
];

/** Every place of this atlas the section links to. */
export function linkedPlaces(): string[] {
  return [...new Set([
    ...UNITS.flatMap(([hiegel]) => hiegel), ...DIFFER.flatMap((g) => g.rows.map((r) => r.place)), ...FOLLOW.map((r) => r.place),
    ...allParts().flatMap((p) => typeof p === "object" && "place" in p ? [p.place as string] : []),
  ])];
}

/** Every one of Alix's divisions the section names, with those of the entries it cites. */
export function namedDivisions(): string[] {
  const cited = [...DIFFER.flatMap((g) => g.rows.flatMap((r) => r.entries)), ...FOLLOW.map((r) => r.entry)];
  return [...new Set([...UNITS.flatMap(([, alix]) => alix), ...OUTSIDE.flatMap((r) => r.alix),
    ...cited.map((no) => ENTRIES[no]?.alix ?? `entry ${no}`),
    ...allParts().flatMap((p) => typeof p === "object" && "alix" in p ? [p.alix as string] : [])])];
}

export function compareSection(data: Dataset, lang: Lang, store: Store): HTMLElement[] {
  const placeName = (id: string) => name(data.places.get(id)?.name, lang, id);
  const link = (id: string) => h("button", { class: "link", "data-place": id, onclick: () =>
    data.places.get(id)?.kind === "territory" ? openPlace(store, data, id) : showOnMap(store, id) }, placeName(id));
  const part = (p: Part): Node | string => typeof p === "string" ? p
    : "place" in p ? link(p.place) : "alix" in p ? ALIX[p.alix]?.[lang] ?? p.alix : p[lang];
  const pages = (p?: string) => p ? ` (${t("pages", lang)} ${p})` : "";
  const cite = (c: Cite) => [...c.parts.map(part), pages(c.pages)];
  const list = <T>(items: T[], each: (x: T) => (Node | string)[], sep = "; ") =>
    items.flatMap((x, i) => [i ? sep : "", ...each(x)]);
  // An entry of Alix's: his division, its section of the Dénombrement and the entry's number.
  const entry = (no: number) => {
    const e = ENTRIES[no];
    const section = e?.section ? `, ${SECTION[e.section][lang]}` : "";
    return [`${e ? ALIX[e.alix][lang] : ""}${section} (${ENTRY[lang]} ${no})`];
  };
  const table = (head: Text[], rows: HTMLTableRowElement[]) =>
    h("div", { class: "table-wrap" }, h("table", { class: "matrix" },
      h("thead", {}, h("tr", {}, ...head.map((c) => h("th", { scope: "col" }, c[lang])))),
      h("tbody", {}, ...rows)));
  const para = (parts: Part[]) => h("p", {}, ...parts.map(part));
  return [
    h("h3", { id: "hiegel-alix" }, TITLE[lang]),
    h("p", {}, ...linkDuchy(INTRO[lang])),
    h("h4", {}, UNITS_TITLE[lang]),
    table([COL.hiegel, COL.alix], UNITS.map(([hiegel, alix]) => h("tr", {},
      h("td", {}, ...list(hiegel, (id) => [link(id)], ", ")), h("td", {}, alix.map((id) => ALIX[id][lang]).join(", "))))),
    para(UNITS_AFTER[lang]),
    h("h4", {}, OUTSIDE_TITLE[lang]),
    h("p", {}, OUTSIDE_INTRO[lang]),
    table([COL.hiegel, COL.alix, COL.note], OUTSIDE.map((r) => h("tr", {},
      h("td", {}, ...list(r.hiegel, cite)), h("td", {}, r.alix.map((id) => ALIX[id][lang]).join(", ")), h("td", {}, r.note[lang])))),
    para(OUTSIDE_AFTER[lang]),
    h("h4", {}, DIFFER_TITLE[lang]),
    h("p", {}, ...linkDuchy(DIFFER_INTRO[lang])),
    table([COL.settlement, COL.hiegel, COL.alix, COL.note], DIFFER.flatMap((g) => [
      h("tr", { class: "group" }, h("th", { scope: "colgroup", colspan: "4" }, g.title[lang])),
      ...g.rows.map((r) => h("tr", {},
        h("th", { scope: "row" }, link(r.place)), h("td", {}, ...list(r.hiegel, cite)), h("td", {}, ...list(r.entries, entry)),
        h("td", {}, ...(r.note?.[lang] ?? []).map(part)))),
    ])),
    h("h4", {}, FOLLOW_TITLE[lang]),
    h("p", {}, ...linkDuchy(FOLLOW_INTRO[lang])),
    table([COL.no, COL.alixSpelling, COL.index, COL.here, COL.hiegelOnly], FOLLOW.map((r) =>
      h("tr", {}, h("th", { scope: "row" }, String(r.entry)), h("td", {}, ENTRIES[r.entry]?.name ?? ""), h("td", {}, r.index),
        h("td", {}, link(r.place)), h("td", {}, ...cite(r.hiegel))))),
    para(FOLLOW_AFTER[lang]),
  ];
}
