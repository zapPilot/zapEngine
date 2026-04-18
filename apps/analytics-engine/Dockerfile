FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.13 /uv /uvx /bin/

WORKDIR /app

COPY apps/analytics-engine/pyproject.toml ./pyproject.toml
COPY apps/analytics-engine/uv.lock ./uv.lock
COPY apps/analytics-engine/README.md ./README.md

RUN uv sync --locked --no-dev

FROM python:3.11-slim AS final

RUN useradd --create-home appuser \
 && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /home/appuser/app

COPY --from=builder /app/.venv /opt/venv
COPY apps/analytics-engine/src ./src
COPY apps/analytics-engine/pyproject.toml ./pyproject.toml
COPY apps/analytics-engine/README.md ./README.md

RUN chown -R appuser:appuser /home/appuser/app /opt/venv

USER appuser

ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/healthz || exit 1

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
