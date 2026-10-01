# Bailliage d'Allemagne 1600–1632 — Rights Atlas

Interactive map of who held which rights over the settlements and territories of the
Lorraine *bailliage d'Allemagne*, based on H. Hiegel (1961). See [doc/Plan.md](doc/Plan.md).

Everything runs in Docker (rootless Docker works without extra config).

```sh
cp .env.example .env   # add ANTHROPIC_API_KEY (needed from Stage 3)
make build             # build images
make dev               # http://localhost:5173 (builds web data first if missing)
make test              # pytest + vitest
make e2e               # Playwright end-to-end, accessibility and performance tests (starts the dev server)
make extract           # Stage 1: PDF -> data/raw/ (page text, sections, index CSVs)
make validate          # Stage 2: check data/curated/*.csv against schema and vocab.yaml
make schema            # Stage 2: export JSON Schemas to data/schema/
make extract-llm-plan SECTIONS=priority     # Stage 3: token count + cost estimate (free)
make extract-llm-submit SECTIONS=priority   # Stage 3: half-price batch extraction (costs money)
make extract-llm-collect SECTIONS=priority  # Stage 3: wait for the batch, parse results
make curate            # Stage 4: rebuild data/curated/*.csv + data/review/report.md
make geocode curate    # Stage 5: coordinates + fr/de/en names (Wikidata, GeoNames), then rebuild
make geometry          # Stage 6: settlement cells + territory areas -> data/geometry/*.geojson
make build-data        # Stage 7: compile everything into web/public/data/ for the app
```

The source PDF goes in `pdf/` (git-ignored; licensed copy, not redistributable).

Screenshots of the running app (headless Chromium in Docker, dev server must be up):

```sh
docker compose run --rm e2e node scripts/screenshot.mjs "#/map?year=1624&right=high_justice&lang=fr" shots/a.png
```

## Deployment

`.github/workflows/pages.yml` publishes the atlas on GitHub Pages on every push to `main`: it runs
the tests, compiles `web/public/data/` from the committed `data/curated/` and `data/geometry/`
(`build-data`; the book and the extraction caches are not needed), builds the app with Vite under
`/<repository name>/` and deploys `web/dist/`. One-time setup: Settings → Pages → Source:
"GitHub Actions". The base map is OpenFreeMap's "positron" style (no API key).

## Licence

© 2026 Siargey Kachanovich. The code is under the [MIT License](LICENSE); the data
(`data/curated/`, `data/geometry/`, `web/public/data/`) and the text are under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see [LICENSE-DATA](LICENSE-DATA)). This
does not cover Hiegel's book or the short quotations from it, the OpenStreetMap base map (ODbL),
or the Wikidata (CC0) and GeoNames (CC BY 4.0) data, which keep their own terms.
