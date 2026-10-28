# Cryptiq backend. Requires uv (https://docs.astral.sh/uv/). Run from /backend.
PY := uv run python
RAW ?= data/raw


.PHONY: run-fixture

.PHONY: download verify-data smoke-queries compare-engines
.PHONY: setup data fixture labels explore train demo-wallets load-graph install-queries verify-graph \
        run test test-tg lint typecheck openapi record-replays benchmark smoke audit

setup:            ## install deps into .venv
	uv sync

download:         ## fetch Elliptic++ into data/raw (SRC=hf|gdrive) and verify it is real data (not LFS pointers)
	uv run --group data python -m scripts.download_data --source $(or $(SRC),hf)

verify-data:      ## check data/raw: LFS pointers, sizes, row counts vs the published figures
	$(PY) -m scripts.download_data --verify-only

explore:          ## inspect raw Elliptic++ CSVs -> artifacts/data_summary.json
	$(PY) -m scripts.explore_data --raw $(RAW)

data: explore     ## raw CSVs -> data/processed/*.parquet (+ splits, graph features) and labels
	$(PY) -m scripts.build_processed --raw $(RAW)
	$(PY) -m scripts.fetch_labels

FIXTURE_ENV := DATA_DIR=./data/fixture ARTIFACTS_DIR=./data/fixture/artifacts DEMO_MODE=true GRAPH_ENGINE=networkx \
               DATABASE_URL=sqlite:///./data/fixture/dev.sqlite

fixture:          ## SYNTHETIC fake dataset (DEMO- addresses) + trained model, for offline dev only
	$(PY) -m scripts.make_fixture --out data/fixture/raw
	$(PY) -m scripts.build_processed --raw data/fixture/raw --out data/fixture/processed --source synthetic_fixture
	$(FIXTURE_ENV) $(PY) -m scripts.train
	$(FIXTURE_ENV) $(PY) -m scripts.export_demo_wallets

run-fixture:      ## run the API on the synthetic fixture (responses carry isMock: true)
	$(FIXTURE_ENV) uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

train:            ## train baseline + graph model, calibrate, choose thresholds, write model card
	$(PY) -m scripts.train
	$(PY) -m scripts.export_demo_wallets

load-graph:       ## upsert processed graph into TigerGraph (resumable)
	$(PY) -m scripts.load_tigergraph

install-queries:
	$(PY) -m scripts.install_queries

verify-graph:
	$(PY) -m scripts.verify_graph

smoke-queries:    ## one smoke check per installed GSQL query
	$(PY) -m scripts.smoke_queries

compare-engines:  ## TigerGraph vs NetworkX on demo + random wallets, latency p50/p95, hub safety
	$(PY) -m scripts.compare_engines --random 50 --calls 60 --hubs 5

run:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	uv run pytest -q -m "not tigergraph"

test-tg:
	uv run pytest -q -m tigergraph

lint:
	uv run ruff check app scripts tests
	uv run mypy app

openapi:          ## regenerate ../docs/openapi.json
	$(PY) -m scripts.gen_openapi

record-replays:   ## record REAL responses for demo wallets into artifacts/replay/
	$(PY) -m scripts.record_replays

benchmark:
	$(PY) -m scripts.run_benchmark --sample-size 25

smoke:            ## hit every endpoint of a running server
	$(PY) -m scripts.smoke --base http://localhost:8000

audit:
	uv run pip-audit
