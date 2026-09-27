# Bailliage d'Allemagne 1600–1632 — Rights Atlas

Interactive map of who held which rights over the settlements and territories of the
Lorraine *bailliage d'Allemagne*, based on H. Hiegel (1961). See [doc/Plan.md](doc/Plan.md).

Everything runs in Docker (rootless Docker works without extra config).

```sh
cp .env.example .env   # add ANTHROPIC_API_KEY (needed from Stage 3)
make build             # build images
make dev               # http://localhost:5173
make test              # pytest + vitest
make extract           # Stage 1: PDF -> data/raw/ (page text, sections, index CSVs)
make validate          # Stage 2: check data/curated/*.csv against schema and vocab.yaml
make schema            # Stage 2: export JSON Schemas to data/schema/
make extract-llm-plan SECTIONS=priority     # Stage 3: token count + cost estimate (free)
make extract-llm-submit SECTIONS=priority   # Stage 3: half-price batch extraction (costs money)
make extract-llm-collect SECTIONS=priority  # Stage 3: wait for the batch, parse results
make curate            # Stage 4: rebuild data/curated/*.csv + data/review/report.md
make geocode curate    # Stage 5: coordinates + fr/de/en names (Wikidata, GeoNames), then rebuild
```

The source PDF goes in `pdf/` (git-ignored; licensed copy, not redistributable).
