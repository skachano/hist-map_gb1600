// "About & sources": the book, the conventions behind the map, how the data was made,
// attributions and the copyright note, in three languages.
import type { Dataset, Lang } from "../data/types";
import { label, LANGS, t } from "../i18n";
import { fill, h } from "./dom";

interface Section {
  title: string;
  paragraphs: string[];
}

const TEXT: Record<Lang, Section[]> = {
  en: [
    { title: "Source", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines: Éditions Marcel Pierron, 1961. Read in the licensed digital reissue by FeniXX of the copy held by the Bibliothèque nationale de France.",
      "Every right, change and membership carries the printed page numbers of the book it comes from (\"p. 51\"). Quotations are kept short (at most 200 characters) and only identify the passage; they do not replace the book.",
    ] },
    { title: "What the map shows", paragraphs: [
      "For each year from 1600 to 1632 and each kind of right, who held it over each settlement: suzerainty (dominium directum), high justice, middle and low justice, manorial lordship, advocacy, diocesan authority, tithes and other jurisdictions.",
      "Years are inclusive. In the year a right changes hands the incoming holder is shown. A place without a record of its own for a right shows the holder recorded for the territory it belonged to that year, drawn lighter. Several holders at once (condominiums, co-lordships) are hatched; rights held in pledge (engagement) have a dashed outline; claims and disputes have a red outline and ⚠.",
      "Areas are approximations: the book names which places belonged together, not boundaries, so each settlement is given the land nearer to it than to any other settlement. Hollow points are hamlets placed at the commune they belong to.",
    ] },
    { title: "How the data was made", paragraphs: [
      "The scanned book was read with its OCR text layer (Tesseract for pages without one). Each section of Book I, chapters I, VI, VIII and IX, was then read by Claude (Anthropic) into structured facts with page references, which were merged, checked by rules and partly reviewed by hand. Some facts are therefore still extraction results: the confidence marks and the review list say which.",
      "Places were located with Wikidata and GeoNames; modern names in English, French and German come from Wikidata.",
    ] },
    { title: "Attributions", paragraphs: [
      "Base map © OpenStreetMap contributors (ODbL). Place data from Wikidata (CC0) and GeoNames (CC BY 4.0).",
    ] },
  ],
  fr: [
    { title: "Source", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines : Éditions Marcel Pierron, 1961. Lu dans la réédition numérique sous licence de FeniXX, d'après l'exemplaire de la Bibliothèque nationale de France.",
      "Chaque droit, changement et appartenance renvoie aux pages imprimées du livre (« p. 51 »). Les citations sont courtes (200 caractères au plus) et servent seulement à repérer le passage ; elles ne remplacent pas le livre.",
    ] },
    { title: "Ce que montre la carte", paragraphs: [
      "Pour chaque année de 1600 à 1632 et chaque type de droit, qui le détenait sur chaque localité : souveraineté (domaine direct), haute justice, moyenne et basse justice, seigneurie foncière, avouerie, autorité diocésaine, dîmes et autres juridictions.",
      "Les années sont incluses. L'année d'un changement, le nouveau détenteur est affiché. Un lieu sans mention propre pour un droit reprend le détenteur indiqué pour le territoire dont il faisait partie cette année-là, en plus clair. Plusieurs détenteurs à la fois (condominiums, coseigneuries) sont hachurés ; les droits engagés ont un contour en tirets ; les revendications et litiges un contour rouge et ⚠.",
      "Les surfaces sont approximatives : le livre dit quels lieux allaient ensemble, pas où passaient les limites ; chaque localité reçoit donc le terrain plus proche d'elle que de toute autre. Les points creux sont des hameaux placés sur leur commune.",
    ] },
    { title: "Comment les données ont été établies", paragraphs: [
      "Le livre numérisé a été lu grâce à sa couche de texte OCR (Tesseract pour les pages qui n'en avaient pas). Chaque section du livre I, chapitres I, VI, VIII et IX, a ensuite été lue par Claude (Anthropic) en faits structurés avec renvois aux pages, fusionnés, contrôlés par des règles et en partie revus à la main. Certains faits restent donc des résultats d'extraction : les degrés de confiance et la liste de révision l'indiquent.",
      "Les lieux ont été localisés avec Wikidata et GeoNames ; les noms modernes en anglais, français et allemand proviennent de Wikidata.",
    ] },
    { title: "Crédits", paragraphs: [
      "Fond de carte © contributeurs d'OpenStreetMap (ODbL). Données de lieux : Wikidata (CC0) et GeoNames (CC BY 4.0).",
    ] },
  ],
  de: [
    { title: "Quelle", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines: Éditions Marcel Pierron, 1961. Gelesen in der lizenzierten digitalen Neuausgabe von FeniXX nach dem Exemplar der Bibliothèque nationale de France.",
      "Jedes Recht, jede Veränderung und jede Zugehörigkeit nennt die gedruckten Seiten des Buches („S. 51“). Zitate sind kurz (höchstens 200 Zeichen) und dienen nur dem Auffinden der Stelle; sie ersetzen das Buch nicht.",
    ] },
    { title: "Was die Karte zeigt", paragraphs: [
      "Für jedes Jahr von 1600 bis 1632 und jede Art von Recht, wer es über jeden Ort innehatte: Oberherrschaft (dominium directum), Hochgerichtsbarkeit, Nieder- und Mittelgerichtsbarkeit, Grundherrschaft, Vogtei, Diözesangewalt, Zehnt und weitere Rechte.",
      "Jahresangaben sind einschließlich. Im Jahr eines Wechsels wird der neue Inhaber gezeigt. Ein Ort ohne eigenen Beleg für ein Recht übernimmt den Inhaber, der für sein Territorium in diesem Jahr belegt ist, heller dargestellt. Mehrere Inhaber zugleich (Kondominien, Gemeinherrschaften) sind schraffiert; verpfändete Rechte gestrichelt umrandet; Ansprüche und Streitfälle rot umrandet mit ⚠.",
      "Flächen sind Näherungen: Das Buch nennt, welche Orte zusammengehörten, nicht wo die Grenzen verliefen; jeder Ort erhält daher das Land, das ihm näher liegt als jedem anderen. Hohle Punkte sind Weiler, die bei ihrer Gemeinde verortet sind.",
    ] },
    { title: "Wie die Daten entstanden", paragraphs: [
      "Das gescannte Buch wurde über seine OCR-Textebene gelesen (Tesseract für Seiten ohne Textebene). Jeder Abschnitt von Buch I, Kapitel I, VI, VIII und IX, wurde dann von Claude (Anthropic) in strukturierte Fakten mit Seitenangaben übertragen, zusammengeführt, regelbasiert geprüft und teilweise von Hand durchgesehen. Manche Fakten sind daher noch Extraktionsergebnisse; die Konfidenzangaben und die Prüfliste zeigen welche.",
      "Die Orte wurden mit Wikidata und GeoNames verortet; die heutigen Namen auf Englisch, Französisch und Deutsch stammen aus Wikidata.",
    ] },
    { title: "Nachweise", paragraphs: [
      "Grundkarte © OpenStreetMap-Mitwirkende (ODbL). Ortsdaten aus Wikidata (CC0) und GeoNames (CC BY 4.0).",
    ] },
  ],
  ja: [
    { title: "出典", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines: Éditions Marcel Pierron, 1961.（アンリ・イジェル『ドイツ・バイイ管区 1600–1632年 ― 行政・司法・財政・軍事組織』）フランス国立図書館所蔵本を FeniXX が許諾のもとで電子復刻した版に拠る。",
      "すべての権利・変更・所属には、典拠となる本書の印刷ページ（「p. 51」）を付した。引用は短く（200字以内）、該当箇所を示すためだけのもので、本書に代わるものではない。",
    ] },
    { title: "地図が示すもの", paragraphs: [
      "1600年から1632年までの各年と各種の権利について、各集落でその権利を誰が保有していたかを示す：宗主権（上級所有権）、上級裁判権、中級・下級裁判権、土地領主権、教会守護権、司教区の管轄、十分の一税、その他の権限。",
      "年は両端を含む。権利が移った年には新しい保有者を表示する。ある権利について固有の記録がない地点は、その年に属していた領域について記録された保有者を薄い色で表示する。同時に複数の保有者がいる場合（共同統治・共同領主）は斜線、担保に入った権利（アンガージュマン）は破線の枠、主張や係争は赤い枠と ⚠ で示す。",
      "範囲は概略である。本書はどの地点がまとまっていたかを記すが、境界の位置は記していないため、各集落には他のどの集落よりも近い土地を割り当てた。白抜きの点は、所属する自治体の位置に置いた小村である。",
      "日本語の地名は Wikidata の日本語ラベルによる。ラベルのない小さな地点はフランス語の名称のまま表示し、領域名は「所在地名＋種別」（例：シエルク管区）で示した。",
    ] },
    { title: "データの作成方法", paragraphs: [
      "スキャンされた本書は OCR テキスト層（テキスト層のないページは Tesseract）で読み取った。第1部の第1・6・8・9章の各節を Claude（Anthropic）でページ付きの構造化された事実に変換し、統合したうえで規則による検査と一部の手作業による確認を行った。したがって一部の事実は抽出結果のままであり、信頼度の表示と確認リストがそれを示している。",
      "地点の位置は Wikidata と GeoNames で特定し、英語・フランス語・ドイツ語の現代名は Wikidata による。",
    ] },
    { title: "クレジット", paragraphs: [
      "背景地図 © OpenStreetMap contributors (ODbL)。地点データ：Wikidata (CC0)、GeoNames (CC BY 4.0)。",
    ] },
  ],
};

export function renderAbout(root: HTMLElement, data: Dataset, lang: Lang): void {
  const c = data.meta.counts;
  const rights = data.meta.vocab.right_types;
  fill(root,
    h("article", { class: "about" },
      h("h2", {}, t("view_about", lang)),
      ...TEXT[lang].flatMap((s) => [h("h3", {}, s.title), ...s.paragraphs.map((p) => h("p", {}, p))]),
      h("h3", { id: "rights-explained" }, t("rightsExplained", lang)),
      h("dl", { class: "rights-explained" }, ...Object.keys(rights).flatMap((k) => [
        h("dt", { id: `right-${k}` }, label(rights[k], lang, k),
          h("span", { class: "muted" }, ` · ${LANGS.filter((l) => l !== lang && rights[k][l])
            .map((l) => label(rights[k], l, k)).join(" · ")}`)),
        h("dd", {}, rights[k].desc?.[lang] ?? rights[k].desc?.en ?? ""),
      ])),
      h("p", { class: "muted" },
        `${c.places} ${t("places", lang)} · ${c.entities} ${t("view_entity", lang).toLowerCase()} · ${c.rights} `
        + `${t("allRights", lang).toLowerCase()} · ${c.events} ${t("view_changes", lang).toLowerCase()} · `
        + `data ${data.meta.version}`),
    ),
  );
}
