// "About & sources": the book, the conventions behind the map, how the data was made, Hiegel and
// Alix compared, attributions and the copyright note, in four languages.
import type { Dataset, Lang } from "../data/types";
import { label, LANGS, t } from "../i18n";
import type { Store } from "../state/store";
import { compareSection } from "./compare";
import { fill, h } from "./dom";

interface Section {
  title: string;
  paragraphs: string[];
}

const TEXT: Record<Lang, Section[]> = {
  en: [
    { title: "Source", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines: Éditions Marcel Pierron, 1961. Read in the licensed digital reissue by FeniXX of the copy held by the Bibliothèque nationale de France.",
      "Every right, change and membership carries the printed page numbers of the book it comes from (\"p. 51\"). The site does not reproduce the book's text: the page numbers lead to the passage.",
    ] },
    { title: "What the map shows", paragraphs: [
      "For each year from 1600 to 1632 and each kind of right, who held it over each settlement: suzerainty (dominium directum), high justice, middle and low justice, manorial lordship, advocacy, diocesan authority, tithes and other jurisdictions.",
      "Years are inclusive. In the year a right changes hands the incoming holder is shown. A place without a record of its own for a right shows the holder recorded for the territory it belonged to that year, drawn lighter. Several holders at once (condominiums, co-lordships) are hatched; rights held in pledge (engagement) have a dashed outline; claims and disputes have a red outline and ⚠.",
      "Areas are approximations: the book names which places belonged together, not boundaries, so each settlement is given the land nearer to it than to any other settlement. Each kind of place (town, village, hamlet, castle, abbey…) has its own shape; a hollow shape is a place located only approximately, at the commune it belongs to (hamlets, lost villages).",
      "The Territories view shows the realms of each year in two hierarchies: the administrative districts of the bailiwick (offices, provostships, castellanies, mayoralties…) and the feudal titles held of a lord (principalities, marquisates, counties, lordships, fiefs). Where an office and a fief share their lands, as at Forbach or Boulay, both are shown.",
    ] },
    { title: "How the data was made", paragraphs: [
      "The scanned book was read with its OCR text layer (Tesseract for pages without one). Each section of Book I, chapters I, VI, VIII and IX, was then read by Claude (Anthropic) into structured facts with page references, which were merged, checked by rules and partly reviewed by hand. Some facts are therefore still extraction results: the confidence marks and the review list say which. Many facts were then corrected or added by hand, also from Book I, chapter II (the dukes, Louis de Guise and Henriette de Vaudémont: the marquisate of Faulquemont, the counties of Dalem and Boulay, the dukes' reigns) and from single passages of Book I, chapter VII, Book II, chapter IV and Book III, chapters II–IV; where the book contradicts itself or other sources, the record's note says so.",
      "Places were located with Wikidata and GeoNames. German names are the places' historical German names, entered by hand where Wikidata gives only the French one (Bolchen for Boulay, Kriechingen for Créhange); French-speaking villages keep their French name. English names come from Wikidata.",
      "Rulers are shown for the years the book attests them, widened to their known reign dates where reference works give them with certainty (Wikipedia, the Deutsche Biographie, genealogies); the data notes which dates come from outside the book. Rulers' names and titles are translated.",
    ] },
    { title: "Author", paragraphs: [
      "Conceived, curated and reviewed by Siargey Kachanovich. The atlas's data and texts are released under the Creative Commons Attribution 4.0 licence (CC BY 4.0): you may reuse and adapt them, with credit. Its code is under the MIT License. This does not cover the book itself or the short quotations from it, which remain under the publisher's rights.",
    ] },
    { title: "Attributions", paragraphs: [
      "Base map: OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors (ODbL). Place data from Wikidata (CC0) and GeoNames (CC BY 4.0).",
    ] },
  ],
  fr: [
    { title: "Source", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines : Éditions Marcel Pierron, 1961. Lu dans la réédition numérique sous licence de FeniXX, d'après l'exemplaire de la Bibliothèque nationale de France.",
      "Chaque droit, changement et appartenance renvoie aux pages imprimées du livre (« p. 51 »). Le site ne reproduit pas le texte du livre : les numéros de page renvoient au passage.",
    ] },
    { title: "Ce que montre la carte", paragraphs: [
      "Pour chaque année de 1600 à 1632 et chaque type de droit, qui le détenait sur chaque localité : souveraineté (domaine direct), haute justice, moyenne et basse justice, seigneurie foncière, avouerie, autorité diocésaine, dîmes et autres juridictions.",
      "Les années sont incluses. L'année d'un changement, le nouveau détenteur est affiché. Un lieu sans mention propre pour un droit reprend le détenteur indiqué pour le territoire dont il faisait partie cette année-là, en plus clair. Plusieurs détenteurs à la fois (condominiums, coseigneuries) sont hachurés ; les droits engagés ont un contour en tirets ; les revendications et litiges un contour rouge et ⚠.",
      "Les surfaces sont approximatives : le livre dit quels lieux allaient ensemble, pas où passaient les limites ; chaque localité reçoit donc le terrain plus proche d'elle que de toute autre. Chaque type de lieu (ville, village, hameau, château, abbaye…) a sa forme ; une forme creuse est un lieu localisé seulement approximativement, sur la commune dont il fait partie (hameaux, villages disparus).",
      "La vue Territoires montre les entités de chaque année selon deux hiérarchies : les circonscriptions administratives du bailliage (offices, prévôtés, châtellenies, mairies…) et les titres féodaux tenus d'un seigneur (principautés, marquisats, comtés, seigneuries, fiefs). Quand un office et un fief partagent leurs terres, comme à Forbach ou Boulay, les deux sont montrés.",
    ] },
    { title: "Comment les données ont été établies", paragraphs: [
      "Le livre numérisé a été lu grâce à sa couche de texte OCR (Tesseract pour les pages qui n'en avaient pas). Chaque section du livre I, chapitres I, VI, VIII et IX, a ensuite été lue par Claude (Anthropic) en faits structurés avec renvois aux pages, fusionnés, contrôlés par des règles et en partie revus à la main. Certains faits restent donc des résultats d'extraction : les degrés de confiance et la liste de révision l'indiquent. Beaucoup de faits ont ensuite été corrigés ou ajoutés à la main, tirés aussi du livre I, chapitre II (les ducs, Louis de Guise et Henriette de Vaudémont : le marquisat de Faulquemont, les comtés de Dalem et de Boulay, les règnes des ducs) et de passages isolés du livre I, chapitre VII, du livre II, chapitre IV et du livre III, chapitres II à IV ; quand le livre se contredit ou contredit d'autres sources, la note de l'enregistrement le signale.",
      "Les lieux ont été localisés avec Wikidata et GeoNames. Les noms allemands sont les noms allemands historiques des lieux, saisis à la main quand Wikidata ne donne que le nom français (Bolchen pour Boulay, Kriechingen pour Créhange) ; les villages francophones gardent leur nom français. Les noms anglais proviennent de Wikidata.",
      "Les souverains et seigneurs sont montrés pour les années où le livre les atteste, élargies à leurs dates de règne connues quand les ouvrages de référence les donnent avec certitude (Wikipédia, la Deutsche Biographie, des généalogies) ; les données indiquent quelles dates viennent d'ailleurs que du livre. Leurs noms et titres sont traduits.",
    ] },
    { title: "Auteur", paragraphs: [
      "Conçu, établi et vérifié par Siargey Kachanovich. Les données et les textes de l'atlas sont publiés sous la licence Creative Commons Attribution 4.0 (CC BY 4.0) : vous pouvez les réutiliser et les adapter en citant la source. Son code est sous licence MIT. Cela ne s'applique ni au livre lui-même ni aux courtes citations qui en sont tirées, qui restent soumis aux droits de l'éditeur.",
    ] },
    { title: "Crédits", paragraphs: [
      "Fond de carte : OpenFreeMap, © OpenMapTiles, données © contributeurs d'OpenStreetMap (ODbL). Données de lieux : Wikidata (CC0) et GeoNames (CC BY 4.0).",
    ] },
  ],
  de: [
    { title: "Quelle", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines: Éditions Marcel Pierron, 1961. Gelesen in der lizenzierten digitalen Neuausgabe von FeniXX nach dem Exemplar der Bibliothèque nationale de France.",
      "Jedes Recht, jede Veränderung und jede Zugehörigkeit nennt die gedruckten Seiten des Buches („S. 51“). Die Seite gibt den Text des Buches nicht wieder: Die Seitenangaben führen zur Stelle.",
    ] },
    { title: "Was die Karte zeigt", paragraphs: [
      "Für jedes Jahr von 1600 bis 1632 und jede Art von Recht, wer es über jeden Ort innehatte: Oberherrschaft (dominium directum), Hochgerichtsbarkeit, Nieder- und Mittelgerichtsbarkeit, Grundherrschaft, Vogtei, Diözesangewalt, Zehnt und weitere Rechte.",
      "Jahresangaben sind einschließlich. Im Jahr eines Wechsels wird der neue Inhaber gezeigt. Ein Ort ohne eigenen Beleg für ein Recht übernimmt den Inhaber, der für sein Territorium in diesem Jahr belegt ist, heller dargestellt. Mehrere Inhaber zugleich (Kondominien, Gemeinherrschaften) sind schraffiert; verpfändete Rechte gestrichelt umrandet; Ansprüche und Streitfälle rot umrandet mit ⚠.",
      "Flächen sind Näherungen: Das Buch nennt, welche Orte zusammengehörten, nicht wo die Grenzen verliefen; jeder Ort erhält daher das Land, das ihm näher liegt als jedem anderen. Jede Art von Ort (Stadt, Dorf, Weiler, Burg, Abtei…) hat ihre eigene Form; eine hohle Form ist ein nur ungefähr verorteter Ort, bei der Gemeinde, zu der er gehört (Weiler, Wüstungen).",
      "Die Ansicht Territorien zeigt die Herrschaftsgebiete jedes Jahres in zwei Hierarchien: die Verwaltungsbezirke des Bellistums (Ämter, Schultheißereien, Kellereien, Meiereien…) und die von einem Lehnsherrn gehaltenen Lehen (Fürstentümer, Markgrafschaften, Grafschaften, Herrschaften, Lehen). Wo ein Amt und ein Lehen dieselben Orte umfassen, wie in Forbach oder Bolchen, werden beide gezeigt.",
    ] },
    { title: "Wie die Daten entstanden", paragraphs: [
      "Das gescannte Buch wurde über seine OCR-Textebene gelesen (Tesseract für Seiten ohne Textebene). Jeder Abschnitt von Buch I, Kapitel I, VI, VIII und IX, wurde dann von Claude (Anthropic) in strukturierte Fakten mit Seitenangaben übertragen, zusammengeführt, regelbasiert geprüft und teilweise von Hand durchgesehen. Manche Fakten sind daher noch Extraktionsergebnisse; die Konfidenzangaben und die Prüfliste zeigen welche. Viele Fakten wurden danach von Hand berichtigt oder ergänzt, auch aus Buch I, Kapitel II (die Herzöge, Ludwig von Guise und Henriette von Vaudémont: die Markgrafschaft Falkenberg, die Grafschaften Dalem und Bolchen, die Regierungszeiten der Herzöge) und aus einzelnen Stellen von Buch I, Kapitel VII, Buch II, Kapitel IV und Buch III, Kapitel II–IV; wo das Buch sich selbst oder anderen Quellen widerspricht, vermerkt es die Notiz des Eintrags.",
      "Die Orte wurden mit Wikidata und GeoNames verortet. Die deutschen Namen sind die historischen deutschen Ortsnamen, von Hand eingetragen, wo Wikidata nur den französischen nennt (Bolchen für Boulay, Kriechingen für Créhange); französischsprachige Dörfer behalten ihren französischen Namen. Die englischen Namen stammen aus Wikidata.",
      "Herrscher werden für die Jahre gezeigt, in denen das Buch sie belegt, erweitert auf ihre bekannten Regierungszeiten, wo Nachschlagewerke sie sicher angeben (Wikipedia, die Deutsche Biographie, Genealogien); die Daten vermerken, welche Jahre nicht aus dem Buch stammen. Ihre Namen und Titel sind übersetzt.",
    ] },
    { title: "Autor", paragraphs: [
      "Konzipiert, erarbeitet und geprüft von Siargey Kachanovich. Daten und Texte des Atlas stehen unter der Lizenz Creative Commons Namensnennung 4.0 (CC BY 4.0): Sie dürfen sie mit Quellenangabe weiterverwenden und bearbeiten. Der Code steht unter der MIT-Lizenz. Dies gilt nicht für das Buch selbst und die kurzen Zitate daraus, die den Rechten des Verlags unterliegen.",
    ] },
    { title: "Nachweise", paragraphs: [
      "Grundkarte: OpenFreeMap, © OpenMapTiles, Daten © OpenStreetMap-Mitwirkende (ODbL). Ortsdaten aus Wikidata (CC0) und GeoNames (CC BY 4.0).",
    ] },
  ],
  ja: [
    { title: "出典", paragraphs: [
      "Henri Hiegel, Le bailliage d'Allemagne de 1600 à 1632. L'administration, la justice, les finances et l'organisation militaire. Sarreguemines: Éditions Marcel Pierron, 1961.（アンリ・イジェル『ドイツ・バイイ管区 1600–1632年 ― 行政・司法・財政・軍事組織』）フランス国立図書館所蔵本を FeniXX が許諾のもとで電子復刻した版に拠る。",
      "すべての権利・変更・所属には、典拠となる本書の印刷ページ（「p. 51」）を付した。本サイトは本書の本文を転載せず、ページ番号で該当箇所を示す。",
    ] },
    { title: "地図が示すもの", paragraphs: [
      "1600年から1632年までの各年と各種の権利について、各集落でその権利を誰が保有していたかを示す：宗主権（上級所有権）、上級裁判権、中級・下級裁判権、土地領主権、教会守護権、司教区の管轄、十分の一税、その他の権限。",
      "年は両端を含む。権利が移った年には新しい保有者を表示する。ある権利について固有の記録がない地点は、その年に属していた領域について記録された保有者を薄い色で表示する。同時に複数の保有者がいる場合（共同統治・共同領主）は斜線、担保に入った権利（アンガージュマン）は破線の枠、主張や係争は赤い枠と ⚠ で示す。",
      "範囲は概略である。本書はどの地点がまとまっていたかを記すが、境界の位置は記していないため、各集落には他のどの集落よりも近い土地を割り当てた。地点の種類（都市・村・小村・城・修道院など）ごとに形が異なる。白抜きの形は、所属する自治体の位置に置いた、位置が概略にとどまる地点（小村・廃村）である。",
      "「領域」ビューは、各年の領域を二つの階層で示す。バイイ管区の行政区画（管区・代官区・城代管区・村長区など）と、領主から保有される封建的な称号（侯国・侯爵領・伯領・領・封土）である。フォルバックやブーレーのように管区と封土が同じ土地を共有する場合は、両方を示す。",
      "日本語の地名は Wikidata の日本語ラベルによる。ラベルのない小さな地点はフランス語の名称のまま表示し、領域名は「所在地名＋種別」（例：シエルク管区）で示した。",
    ] },
    { title: "データの作成方法", paragraphs: [
      "スキャンされた本書は OCR テキスト層（テキスト層のないページは Tesseract）で読み取った。第1部の第1・6・8・9章の各節を Claude（Anthropic）でページ付きの構造化された事実に変換し、統合したうえで規則による検査と一部の手作業による確認を行った。したがって一部の事実は抽出結果のままであり、信頼度の表示と確認リストがそれを示している。その後、多くの事実を手作業で修正・追加した。第1部第2章（ロレーヌ公、ギーズ公ルイとアンリエット・ド・ヴォーデモン：フォルクモン侯爵領、ダレム伯領とブーレー伯領、歴代公の在位）のほか、第1部第7章、第2部第4章、第3部第2〜4章の個別の箇所からも補った。本書が自らや他の資料と矛盾する場合は、その記録の注記に記した。",
      "地点の位置は Wikidata と GeoNames で特定した。ドイツ語名は各地の歴史的なドイツ語地名で、Wikidata にフランス語名しかない場合は手作業で入力した（ブーレー＝ボルヒェン、クレアンジュ＝クリーヒンゲン）。フランス語圏の村はフランス語名のままとした。英語名は Wikidata による。",
      "君主・領主は本書が記録する年について示し、参考文献（Wikipedia、ドイツ人名事典、系譜資料）で確実にわかる場合はその在位期間まで広げた。本書以外に由来する年はデータに注記している。君主・領主の名前と称号は翻訳した。",
    ] },
    { title: "作成者", paragraphs: [
      "企画・データ作成・確認：Siargey Kachanovich。本アトラスのデータと文章はクリエイティブ・コモンズ 表示 4.0 ライセンス（CC BY 4.0）で公開する。出典を明記すれば再利用・改変できる。コードは MIT ライセンスで公開する。ただし本書そのものと本書からの短い引用は対象外であり、出版社の権利に服する。",
    ] },
    { title: "クレジット", paragraphs: [
      "背景地図：OpenFreeMap、© OpenMapTiles、データ © OpenStreetMap contributors (ODbL)。地点データ：Wikidata (CC0)、GeoNames (CC BY 4.0)。",
    ] },
  ],
};

export function renderAbout(root: HTMLElement, data: Dataset, lang: Lang, store: Store): void {
  const c = data.meta.counts;
  const rights = data.meta.vocab.right_types;
  const section = (s: Section) => [h("h3", {}, s.title), ...s.paragraphs.map((p) => h("p", {}, p))];
  // Hiegel and Alix compared comes after how the data was made, before the author and the attributions.
  const sections = TEXT[lang];
  fill(root,
    h("article", { class: "about" },
      h("h2", {}, t("view_about", lang)),
      ...sections.slice(0, 3).flatMap(section),
      ...compareSection(data, lang, store),
      ...sections.slice(3).flatMap(section),
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
