# Stage 1: Build stage
FROM python:3.11-slim AS builder

# Install system dependencies for building python packages
RUN apt-get update && apt-get install -y \
    gcc \
    curl && rm -rf /var/lib/apt/lists/*

# Install uv (use a current, valid tag)
COPY --from=ghcr.io/astral-sh/uv:0.8.13 /uv /uvx /bin/

# Optional: pre-create a venv (uv will still manage .venv by default)
RUN python -m venv /opt/venv || true
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Copy only necessary files for dependency installation
COPY pyproject.toml uv.lock README.md ./

# Install dependencies (assert lockfile is used)
RUN uv sync --locked --no-dev

# Stage 2: Final stage
FROM python:3.11-slim AS final

# Create a non-root user
RUN useradd --create-home appuser && \
    apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/appuser/app

# Copy the uv-managed virtual environment from builder stage
# uv sync creates an in-project .venv under /app by default
COPY --from=builder /app/.venv /opt/venv

# Copy application code
COPY . .

# Set ownership and permissions
RUN chown -R appuser:appuser /home/appuser/app /opt/venv

# Switch to non-root user
USER appuser

# Set path to use the virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/healthz || exit 1

# Run the application (via module to avoid PATH issues)
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
