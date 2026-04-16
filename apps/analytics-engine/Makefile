.PHONY: help install install-hooks dev test test-backtesting-signal-coverage lint format duplicate-check service-reachability-check clean docker

DMA_SIGNAL_TESTS = \
	tests/services/backtesting/signals/dma_gated_fgi/test_regime_classifier.py \
	tests/services/backtesting/signals/dma_gated_fgi/test_utils.py \
	tests/services/backtesting/signals/test_contracts.py \
	tests/services/backtesting/dma_gated_fgi/test_dma_gated_fgi_runtime.py \
	tests/services/backtesting/dma_gated_fgi/test_dma_gated_fgi_runtime_slope.py \
	tests/services/backtesting/dma_gated_fgi/test_dma_gated_fgi_metadata.py \
	tests/services/backtesting/dma_gated_fgi/test_dma_gated_fgi_signal_output.py \
	tests/services/backtesting/strategies/test_dma_gated_fgi.py

help:		## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install:	## Install dependencies with uv
	uv sync

install-hooks:	## Install git hooks (pre-commit runs on every commit)
	uv run pre-commit install

dev:		## Start development server with hot reload
	uv run uvicorn src.main:app --reload --port 8001 --host 0.0.0.0

test:		## Run tests with coverage
	uv run pytest -v --cov=src --cov-report=html --cov-report=term

test-backtesting-signal-coverage:	## Run focused DMA signal coverage gate
	uv run pytest -q $(DMA_SIGNAL_TESTS) --cov=src/services/backtesting/signals/dma_gated_fgi --cov-report=term-missing --cov-fail-under=98

test-scripts:	## Run bash script tests with bats
	@echo "🧪 Running script tests..."
	@bats tests/scripts/*.bats

test-all:	## Run all tests (Python + bash scripts)
	@echo "🧪 Running all tests..."
	make test-scripts
	make test

test-watch:	## Run tests in watch mode (install pytest-watch for auto-rerun)
	uv run pytest -v --cov=src

lint:		## Run linting with ruff and duplicate detection
	uv run ruff check src/ tests/
	uv run ruff format --check src/ tests/
	uv run mypy src/
	uv run python scripts/check_service_reachability.py
	uv run pylint --rcfile=pyproject.toml src/

format:		## Format code with ruff
	uv run ruff format src/ tests/
	uv run ruff check --fix src/ tests/

type-check:	## Run type checking
	uv run mypy src/

duplicate-check:	## Check for duplicate code (using workaround for pylint 4.x bug)
	@echo "⚠️  Using check_duplicates.py (pylint 4.x has a duplicate detection bug)"
	uv run python check_duplicates.py

service-reachability-check:	## Validate router-to-service dependency reachability
	uv run python scripts/check_service_reachability.py

clean:		## Clean cache and build files
	find . -type d -name __pycache__ -delete
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf .mypy_cache
	rm -rf .ruff_cache

# Docker commands
docker:		## Build and run with Docker Compose
	docker-compose up --build

docker-prod:	## Build production image
	docker build -t analytics-engine:latest .

docker-clean:	## Clean Docker images and containers
	docker-compose down -v
	docker system prune -f

# Development utilities
deps-update:	## Update dependencies
	uv lock --upgrade

deps-audit:	## Audit dependencies for security issues
	uv audit

# Analysis scripts
analyze-btc-sentiment:	## Generate BTC price & sentiment chart (default: all data)
	uv run python scripts/analyze_btc_sentiment.py

analyze-btc-sentiment-365:	## Generate BTC price & sentiment chart (last 365 days)
	uv run python scripts/analyze_btc_sentiment.py --days 365

pre-commit: format lint	## Run pre-commit checks
	bats tests/scripts/*.bats
	uv run pytest -x

# Production commands
prod-check:	## Production readiness check
	@echo "🔍 Checking production readiness..."
	uv run ruff check src/
	uv run mypy src/
	uv run python scripts/check_service_reachability.py
	uv run pylint --rcfile=pyproject.toml src/
	uv run pytest
	@echo "✅ Production checks passed!"

deploy-check:	## Pre-deployment validation
	make prod-check
	make docker-prod
	@echo "🚀 Ready for deployment!"
