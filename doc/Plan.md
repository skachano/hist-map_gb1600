# Bailliage d'Allemagne 1600–1632: Rights Atlas (Plan)

## 1. Context & goal
This is an interactive web app that visualises who held which rights over each settlement and territory of the Lorraine *bailliage d'Allemagne* (German Bailiwick) from 1600 to 1632. A year slider drives every screen. The only source is Henri Hiegel, *Le bailliage d'Allemagne de 1600 à 1632* (1961), found in `pdf/`. It is a 320-page scan with an OCR text layer, a place-name index (p. 283), a glossary (p. 303) and a map "Le bailliage d'Allemagne en 1630" (p. 310).

The relevant content is mostly in Livre I:
- ch. I: extent of the bailiwick, office by office (pp. 9–23)
- ch. VI: administration of the offices and fiefs (pp. 49–89)
- ch. VIII: relations with the Empire, imperial fiefs, Créhange, Bitche, Sarrewerden, Fénétrange, Phalsbourg/Lixheim (pp. 96–127)
- ch. IX: disputes, condominiums, francs-alleux, boundaries (pp. 128–154)

Livre III ch. III (seigneuries particulières) also contains some of it.

### Decisions taken
- **Geometry:** settlement points are geocoded (Wikidata/GeoNames). Territory areas are derived from their member villages. A georeferenced overlay of the p. 310 map is an optional later layer.
- **Extraction:** a Python pipeline sends book sections to the Claude API and gets back structured JSON with page citations. A human then reviews the results, and the curated CSV/YAML files are the source of truth.
- **Environment:** all tooling runs in Docker containers. Nothing is installed on the host except Docker.
- **Frontend:** Vite + TypeScript + MapLibre GL. It is a static SPA with no backend and is served from a container.
- **Copyright:** the PDF is a licensed copy. The PDF, the extracted text and long quotes stay out of git (`.gitignore`). Curated data stores page references and short snippets only.

## 2. Data model
IDs are slugs (`sierck`, `duchy-lorraine`). Every fact carries `source_page`, `confidence` (high/medium/low) and `notes`.

### `places`: settlements and territories
| field | description |
|---|---|
| `id`, `kind` | `settlement` or `territory` |
| `name_en`, `name_fr`, `name_de` | canonical names (e.g. Sarreguemines / Saargemünd) |
| `variants[]` | historic spellings from the book (e.g. *Wistorff*, *Udern*) |
| `place_type` | key into the trilingual vocabulary below |
| `lat`, `lon`, `wikidata_id`, `geonames_id` | geometry and external IDs |
| `modern_country` | FR / DE / LU |

### `place_types`: trilingual vocabulary
| key | en | fr | de |
|---|---|---|---|
| village | village | village | Dorf |
| hamlet | hamlet | hameau | Weiler |
| town | town | ville | Stadt |
| castle | castle | château | Burg |
| abbey | abbey | abbaye | Abtei |
| office | office | office | Amt |
| provostship | provostship | prévôté | Schultheißerei / Propstei |
| castellany | castellany | châtellenie | Kellerei |
| lordship | lordship | seigneurie | Herrschaft |
| county | county | comté | Grafschaft |
| marquisate | marquisate | marquisat | Markgrafschaft |
| fief | fief | fief | Lehen |
| condominium | condominium | condominium | Kondominium |
| advocacy | advocacy | vouerie | Vogtei |
| free allod | allod | franc-alleu | Allod |

The list is extended as extraction finds new types.

### `memberships`: territorial hierarchy over time
`child_id`, `parent_id`, `from_year`, `to_year`, `source_page`.

Examples: village → prévôté → office → bailliage; Sarrewerden joins in 1629; Lixheim joins in 1623.

### `entities`: political entities
| field | description |
|---|---|
| `id`, `name_en/fr/de` | |
| `entity_type` | duchy, electorate, temporal bishopric, diocese, county, imperial lordship, abbey/chapter, military order (Teutonic Order), noble house, free village community, city (Metz / Pays messin) |
| `color` | fixed palette colour for the map |

### `rulers`: owners/heads of the political entities
`entity_id`, `person_name`, `title`, `from_year`, `to_year`, `source_page`.

Examples: Charles III (to 1608), Henri II (1608–1624), François II and Charles IV (1624–25), the counts of Nassau-Saarbrücken, the Rhingraves, the Créhange family, and the engagistes of Sarreguemines.

### `rights`: the core table, one row per (place, right, holder, period)
| field | description |
|---|---|
| `place_id`, `holder_id` | FK to `places` and `entities` |
| `right_type` | `suzerain` (dominium directum), `high_justice` (haute justice), `manorial_lord` (seigneurie foncière), `advocate` (avouerie/Vogtei), `spiritual_lord` (diocesan authority), plus other jurisdictions found in the book: `middle_low_justice`, `tithe`, `safeguard` (sauvegarde), `tax_aide` (aide générale), `military` (monstres/garrison), `tabellionage`, `appeal_jurisdiction` |
| `share` | a fraction (e.g. `1/2` for Saargau-Merzig with Trier), or `joint` for undivided co-holding with unknown fractions |
| `from_year`, `to_year` | inclusive; empty = before / after what the source covers |
| `from_precision`, `to_precision` | `exact` / `circa` / `before` / `after` / `attested` (only known for that year) |
| `status` | `held`, `pledged` (held by an engagiste; replaces a separate `engagement` right type), `claimed`, `contested`, `sequestered`, `renounced` |
| `is_disputed` | bool |
| `disputed_with[]` | entity IDs |
| `source_page`, `snippet`, `confidence` | provenance |

### `events`: ownership changes
`year`, `place_id`, `right_type`, `from_holder`, `to_holder`, `event_type` (purchase, pledge, redemption, inheritance, treaty/accommodement, confiscation, boundary settlement), `source_page`, `description`.

The events table feeds the "years when owners changed" lists.

### Derived data (not stored)
- `snapshot(year)`: for each place and right type, the list of holders with status.
- Overlaps: more than one non-share holder for the same (place, right, year), or `is_disputed`.

## 3. App screens
All screens share the year slider (1600–1632, with play/step), a UI language toggle (EN/FR/DE, which switches both labels and place names) and a place/entity detail panel.

1. **Rights map:** one tab per right type (suzerain, high justice, manorial lord, advocate, spiritual lord, other).
   - Settlements are points and territories are derived polygons, coloured by holder.
   - Shares are drawn as split/pie symbols, contested places are hatched, and each holder's status is shown as an outline style.
   - The legend lists the holders active in the chosen year.
2. **Disputes & overlaps:** highlights places where `is_disputed` is set or where several claimants hold the same right. A side list shows the parties and sources.
3. **Political entity view:** pick an entity (e.g. Nassau-Saarbrücken or the Bishopric of Metz). The screen shows:
   - a map of everything it holds, broken down by right type, for the chosen year
   - its rulers timeline
   - its holdings gained and lost from 1600 to 1632
4. **Place detail** (panel or page) includes:
   - names in EN/FR/DE and the historic variants
   - place type in EN/FR/DE
   - parent territories
   - a rights table for the chosen year
   - a Gantt-style timeline per right type
   - a list of change years (events) and source pages
5. **Rights matrix:** a table of places × right types for the chosen year. It can be filtered by office or holder and exported to CSV.
6. **Changes timeline:** a chronological list of all events from 1600 to 1632. Clicking an event jumps the slider to its year and focuses its place.

## 4. Repository & Docker layout
```
hist_map/
  docker-compose.yml        # services: pipeline, web, (e2e), (serve)
  docker/pipeline.Dockerfile  # python:3.12 + pymupdf, pydantic, anthropic, pandas,
                            #   shapely, geopandas, SPARQLWrapper, requests, pytest (+ GDAL for georef stage)
  docker/web.Dockerfile       # node:22 + vite, typescript, maplibre-gl, vitest, playwright
  Makefile                  # make extract / review / geocode / build-data / dev / test
  pdf/                      # source PDF (git-ignored)
  pipeline/                 # Python package: text, llm_extract, resolve, geocode, geometry, build, validate
  data/raw/                 # per-page text, section chunks (git-ignored)
  data/extracted/           # LLM output JSONL (git-ignored or committed, TBD)
  data/curated/             # SOURCE OF TRUTH: places.csv, entities.csv, rulers.csv, rights.csv, events.csv, vocab.yaml, overrides.yaml
  web/                      # Vite app; web/public/data/ gets built JSON/GeoJSON
  doc/Plan.md
```
The Claude API key is passed as `ANTHROPIC_API_KEY` through an `.env` file (git-ignored).

`hist_map/` currently sits inside the home-directory dotfiles git repo. Stage 0 therefore runs `git init` in `hist_map/` so the project gets its own repository.

## 5. Development stages

### Stage 0: Project setup
- Tasks:
  - `git init`, `.gitignore`
  - Dockerfiles, `docker-compose.yml`, `Makefile`
  - empty pipeline package and Vite skeleton
- Done when: `make dev` serves a blank MapLibre map from the container, and `make test` runs pytest and vitest in containers.

### Stage 1: Text extraction
- Tasks:
  - Use PyMuPDF to extract per-page text and map PDF page numbers to printed page numbers.
  - Clean up the OCR: fix letter-spaced words ("L o r r a i n e"), remove hyphenation, separate footnotes.
  - Split the text into sections using the table of contents (p. 307).
  - Parse the place-name index (p. 283) and the glossary (p. 303) into a seed gazetteer and vocabulary.
- Done when: `data/raw/sections/*.txt` and `gazetteer_seed.csv` exist, and a spot check of 10 pages looks clean.
- **Status: done.** Run `make extract` (first run about 10 min of OCR; cached runs take seconds). What we learned about the scan:
  - Printed page numbers are read from the footers by OCR, then fitted with a Viterbi pass. The fit finds unnumbered inserts at PDF 130–131, 148–149 (plates) and 261–262 (fortifications map); printed = PDF − 1/3/5/7.
  - The OCR layer's font sizes are unreliable. Endnotes are separated from body text by line pitch, character width and column width instead.
  - Letter-spaced lines are rebuilt from glyph positions. Blank stretches of a page are OCR'd and kept only when Tesseract's confidence is ≥ 70; this recovers the tables on pp. 22 and 218.
  - pp. 260–268 (military musters per locality) are sideways tables with no text layer. Their Tesseract output has usable numbers but poor names. **Follow-up:** transcribe them with Claude vision in Stage 3.
  - Output: `data/raw/pages.jsonl`, `toc.json`, 109 `sections/L*-C*-S*.txt` (with `[p. N]` markers and `[n]` note calls), per-chapter `*-notes.txt`, `gazetteer_seed.csv` (1190 places), `persons_index.csv`, `glossary.csv`.

### Stage 2: Schema & vocabularies
- Tasks:
  - Define pydantic models and a JSON Schema for all tables.
  - Write `vocab.yaml` with trilingual labels for place types, right types and statuses.
  - Write a validator for FK integrity, year ranges within 1600–1632 (earlier dates are clamped but recorded), and overlapping periods.
- Done when: the validator runs on hand-written sample rows (e.g. Sierck, Saargau-Merzig, Sarrewerden).
- **Status: done.** Code is in `pipeline/bailliage/data/` (`models.py`, `store.py`, `validate.py`, `schema.py`). The source of truth is `data/curated/*.csv` plus `vocab.yaml`; `make validate` checks it and `make schema` writes `data/schema/*.schema.json`, which Stage 3 reuses as the structured-output format.
  - CSV conventions: list cells are `|`-separated, empty cells take the defaults, and `source_page` looks like `49`, `50-52` or `14;131`.
  - Periods are inclusive. A transfer year appears under both the old and the new holder; the validator treats that as a handover, and the app shows the new holder.
  - Vocabulary keys are checked by the validator rather than by code, so new types need only a `vocab.yaml` entry.
  - Validation rules:
    - **Errors:** foreign keys, vocabulary membership, missing `source_page`, shares above 1, membership cycles.
    - **Warnings:** unexplained overlaps (no shares, no claim, no dispute flag), inconsistent dispute flags, events not mirrored by rights, periods outside 1600–1632.
  - Sample data (43 rights, 9 events), validated with 0 errors and 0 warnings:
    - **Sierck:** justice rights, the 1624 pledges to Henriette de Vaudémont, the Chémery dispute of 1616–1620.
    - **Saargau-Merzig:** the ½/½ condominium and the 1620 accommodation.
    - **Sarrewerden:** the Nassau vs Lorraine dispute, the 1629 Speyer judgment and occupation, the 1632 inheritance.

### Stage 3: LLM-assisted extraction
- Tasks:
  - Send one section per call to the Claude API (latest model, configurable), using tool/structured output that matches the schema.
  - Put the gazetteer and entity list in the prompt so names are normalised.
  - Require page citations and a snippet for every fact.
  - Cache responses by section hash so re-runs cost nothing.
  - Run the priority sections (Livre I ch. I, VI, VIII, IX) first and the rest after.
- Done when: `data/extracted/*.jsonl` covers the priority chapters, and a sample of about 30 facts is checked against the book.
- **Status: priority chapters submitted.** Code is in `pipeline/bailliage/extract/`. Commands:
  - `make extract-llm-plan` counts tokens (free).
  - `make extract-llm-submit` sends a half-price batch.
  - `make extract-llm-collect` waits for batches and parses the results.
  - `make extract-llm-realtime` is for small reruns.
  - Use `SECTIONS=priority|all|<ids>` to choose sections.
- Settings: `claude-opus-5`, adaptive thinking at **medium** effort, Batches API (half price), structured output.
  - Sections over 5k characters are split into chunks, each starting with its `[p. N]` marker.
  - Each request carries the book-index entries for its pages, so place names come back canonical.
  - The system prompt (instructions, vocabularies, known entity ids) is cached.
- Robustness:
  - Every paid response is saved raw before it's parsed, and a request hash skips unchanged chunks.
  - The output schema uses `""`/`0` as "unknown" (nullable fields made the compiled grammar too large for the API) and has its `$ref`s inlined.
  - Missing fields are filled leniently and listed in `filled_fields`.
- Pilot lessons:
  - High effort and one request per section cost ~$0.05–0.30 per 1k characters, and the dense Sierck village list overran the 64k output cap.
  - With chunking, medium effort and batches, the cost is **~$0.045 per 1k characters**.
- Quality check against the Stage 2 hand-curated rows: 30 of 43 matched exactly. Most of the rest are modelling choices, such as the pre-1629 Sarrewerden dispute recorded as rival suzerainty rather than high justice, or `charles-iv-lorraine` used instead of `duchy-lorraine`. Stage 4 settles these conventions.
- Still to do:
  - the other 69 sections (~$32 for the whole book), if wanted after Stage 4 review
  - the sideways muster tables (pp. 260–268) via Claude vision

### Stage 4: Review & curation
- Tasks:
  - Merge and deduplicate the extracted facts and resolve entities (variants → canonical IDs).
  - Write them to `data/curated/*.csv`.
  - Generate a review report (low-confidence items, conflicts, unresolved names, places without rights).
  - Correct the data by hand, iterating until the validator passes.
- Done when: the validator is green and every row has a `source_page`.
- **Status: first pass done.** Code is in `pipeline/bailliage/curate/`; `make curate` rebuilds everything. The data now flows like this:
  - `data/extracted/*.json` (Stage 3), plus hand-entered rows in `data/curated/manual/*.csv`, plus review decisions in `data/curated/rules.yaml`,
  - produce the generated tables `data/curated/*.csv` and the review queue `data/review/report.md`.
  - Hand edits go into `manual/` or `rules.yaml`, never into the generated tables, so the build can always be re-run.
- Resolution:
  - Settlements go through the book-index entry the model echoed back, then an exact or close name match (OCR slips). Places that share a name get the canton appended (`bizing-sierck`).
  - Territories are keyed by type plus base name (`L'office de Siersberg` → `office-siersberg`), separately from the town that shares the name. A place's kind follows its place type.
  - Entity IDs are canonical after `entity_aliases`. The reigning duke maps to `duchy-lorraine`; engagistes and princes holding in their own name stay persons.
- Merge rules:
  - Identical rights are merged, pooling their pages.
  - Transfer events date the open-ended rights of the old and new holder.
  - Overlapping rows for the same holder merge into the dated row.
  - Memberships in sovereign states are dropped; that allegiance is already recorded as suzerainty.
  - Manual rows win for any (place, right) or entity they cover.
- Validation conventions:
  - Facts before 1600 are *info*, kept as background.
  - Overlapping manorial lordship or tithe holders are *info*: co-lordship was the norm.
  - An event without matching rights rows is *info*; one that contradicts its rights rows is a *warning*.
- Result (priority chapters): 1,333 places, ~350 entities, 2,480 rights, 424 events, 1,964 memberships. **0 errors**, 137 warnings.
- Next: work through the 137 warnings in `data/review/report.md` (mostly suzerainty or high justice overlaps that the book describes as disputes). Record decisions in `rules.yaml`.


### Stage 5: Geocoding & names
- Tasks:
  - Query Wikidata SPARQL for fr/de names within the bounding box (~6.0–7.6°E, 48.6–49.8°N) to get coordinates and en/fr/de labels.
  - Use GeoNames as a fallback.
  - Resolve ambiguities and unlocatable places (lost villages, *Wüstungen*) in `overrides.yaml`.
- Done when: at least 95% of settlements have coordinates, and the rest are flagged and listed in the report.

### Stage 6: Territory geometry
- Tasks:
  - Build Voronoi cells from all settlement points, clipped to a buffered regional hull.
  - Dissolve the cells by territory membership per year; there is one version per change year, not per year.
  - Optionally, georeference the p. 310 map with GDAL and serve it as a raster overlay.
- Done when: the territory GeoJSON renders without gaps, and territory changes (1623 Lixheim, 1629 Sarrewerden) are visible.

### Stage 7: Data build
- Tasks:
  - Compile the curated data into compact `web/public/data/*.json` plus GeoJSON: places, entities, rulers, rights as intervals, events and territory versions.
  - Snapshots are computed on the client.
- Done when: the build is deterministic and the data size stays under about 2 MB.

### Stage 8: Frontend core
- Tasks:
  - App shell, routing, a global store (year, language, selected place/entity, right type).
  - Year slider with play control, MapLibre map with point and polygon layers.
  - `snapshot(year)` logic with vitest tests.
  - i18n for UI strings and names.
- Done when: moving the slider recolours the map for one right type.

### Stage 9: Screens
Implement the six screens from §3 in order:
1. Rights map
2. Place detail
3. Entity view
4. Disputes
5. Matrix
6. Changes timeline

For each screen, add a colour-blind-safe holder palette, legends and hatching for disputes.
- Done when: every screen works for all years and all three languages.

### Stage 10: QA & polish
- Tasks:
  - Playwright e2e tests in a container: slider, language switch, place panel, disputed place.
  - Accessibility pass, performance check, and an "About & sources" page with citation and copyright notes.

### Stage 11: Deployment
- Tasks:
  - A multi-stage Docker build: Vite build, then nginx serving the static files.
  - Optionally, deploy to GitHub Pages or a similar host.

## 6. Risks & open points
- **OCR quality:** letter-spacing and hyphenation errors. Stage 1 cleans them up, and uncertain cases get a manual check.
- **Sparse dates:** the book often gives no precise years. The `from_precision`/`to_precision` fields record this, and the UI shows uncertain periods as faded or dashed.
- **The five right types are not always explicit in the text.** The LLM must mark inferred facts `confidence: low`, and they need review.
- **Lost and ambiguous villages** (e.g. Bizing appears twice). These are handled in `overrides.yaml` and shown in a "not located" list.
- **Voronoi areas are approximations.** The UI labels them as approximate.
- **Copyright:** do not publish the book text, and keep snippets short.

## 7. Verification (per stage)
- `make test`: pytest runs the text cleanup, the schema validator and the geometry checks; vitest runs the snapshot and overlap logic.
- `make validate`: checks curated data integrity and prints a coverage report (places with rights, geocoded share, low-confidence count).
- Manual checks against the book for known cases:
  - Saargau-Merzig is a ½ Lorraine / ½ Trier condominium.
  - Sarrewerden becomes Lorraine in 1629.
  - Lixheim joins the bailiwick in 1623.
  - Sarreguemines claims autonomy from the bailiwick, confirmed in 1616.
  - The Metz enclaves (Albestroff, Haboudange) are under the Bishop of Metz.
- `make e2e`: Playwright runs in a container against `make dev`.
