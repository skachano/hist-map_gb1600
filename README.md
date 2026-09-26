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
```

The source PDF goes in `pdf/` (git-ignored; licensed copy, not redistributable).
