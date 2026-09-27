# All tooling runs in Docker; nothing but Docker is needed on the host.
# Rootless Docker: container root == host user, so no user: mapping is needed.

COMPOSE  := docker compose
PIPELINE := $(COMPOSE) run --rm pipeline
WEB      := $(COMPOSE) run --rm web

.PHONY: help build install dev test test-py test-web extract validate schema curate geocode geometry extract-llm-plan extract-llm-submit extract-llm-collect extract-llm-realtime pipeline-shell web-shell clean

help:
	@echo "make build          Build the Docker images"
	@echo "make install        Install web dependencies (inside the web container)"
	@echo "make dev            Run the Vite dev server on http://localhost:5173"
	@echo "make test           Run pytest and vitest in containers"
	@echo "make extract        Stage 1: PDF -> data/raw/ (pages, sections, index CSVs)"
	@echo "make validate       Stage 2: check data/curated/ (FKs, vocab, periods, overlaps)"
	@echo "make schema         Stage 2: export JSON Schema per table to data/schema/"
	@echo "make curate         Stage 4: rebuild data/curated/*.csv + data/review/report.md"
	@echo "make geocode        Stage 5: coordinates + fr/de/en names (Wikidata), then run make curate"
	@echo "make geometry       Stage 6: settlement cells + territory areas -> data/geometry/"
	@echo "make extract-llm-plan SECTIONS=priority   Stage 3: token count + cost estimate (no model calls)"
	@echo "make extract-llm-submit SECTIONS=priority  Stage 3: submit a half-price batch (costs money)"
	@echo "make extract-llm-collect SECTIONS=priority Stage 3: wait for batches and parse results"
	@echo "make extract-llm-realtime SECTIONS=...     Stage 3: full-price direct calls (small reruns)"
	@echo "make pipeline-shell Shell in the pipeline container"
	@echo "make web-shell      Shell in the web container"

build:
	$(COMPOSE) build

web/node_modules: web/package.json web/package-lock.json
	$(WEB) npm ci
	@touch web/node_modules

install: web/node_modules

dev: web/node_modules
	$(COMPOSE) up web

test: test-py test-web

test-py:
	$(PIPELINE) pytest -q

test-web: web/node_modules
	$(WEB) npm test

pipeline-shell:
	$(PIPELINE) bash

web-shell:
	$(WEB) bash

clean:
	$(COMPOSE) down --remove-orphans
	rm -rf web/node_modules web/dist

extract:
	$(PIPELINE) python -m bailliage extract-text

validate:
	$(PIPELINE) python -m bailliage validate

schema:
	$(PIPELINE) python -m bailliage schema

SECTIONS ?= priority

extract-llm-plan:
	$(PIPELINE) python -m bailliage extract-llm --plan --sections $(SECTIONS)

extract-llm-submit:
	$(PIPELINE) python -m bailliage extract-llm --submit --sections $(SECTIONS)

extract-llm-collect:
	$(PIPELINE) python -m bailliage extract-llm --collect --wait --sections $(SECTIONS)

extract-llm-realtime:
	$(PIPELINE) python -m bailliage extract-llm --realtime --sections $(SECTIONS)

curate:
	$(PIPELINE) python -m bailliage curate

geocode:
	$(PIPELINE) python -m bailliage geocode

geometry:
	$(PIPELINE) python -m bailliage geometry
