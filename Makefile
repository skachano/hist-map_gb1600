# All tooling runs in Docker; nothing but Docker is needed on the host.
# Rootless Docker: container root == host user, so no user: mapping is needed.

COMPOSE  := docker compose
PIPELINE := $(COMPOSE) run --rm pipeline
WEB      := $(COMPOSE) run --rm web

.PHONY: help build install dev test test-py test-web pipeline-shell web-shell clean

help:
	@echo "make build          Build the Docker images"
	@echo "make install        Install web dependencies (inside the web container)"
	@echo "make dev            Run the Vite dev server on http://localhost:5173"
	@echo "make test           Run pytest and vitest in containers"
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
