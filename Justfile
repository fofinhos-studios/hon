set dotenv-load := true

backend_dir := "backend"
frontend_dir := "frontend"

default:
    @just --list

install:
    cd {{backend_dir}} && uv sync --group dev
    cd {{frontend_dir}} && bun install

build:
    cd {{backend_dir}} && uv build
    cd {{frontend_dir}} && bun run build

test:
    cd {{backend_dir}} && uv run pytest
    cd {{frontend_dir}} && bun test

check:
    cd {{backend_dir}} && uv run ruff check . && uv run ty check
    cd {{frontend_dir}} && bun run typecheck && bun run biome check src

backend-run:
    cd {{backend_dir}} && uv run uvicorn hon.main:app --app-dir src --reload --host 0.0.0.0 --port 8000

frontend-run:
    cd {{frontend_dir}} && bun run dev --host 0.0.0.0 --port 5173

run:
    bash -lc ' \
      trap "kill 0" EXIT INT TERM; \
      (cd {{backend_dir}} && uv run uvicorn hon.main:app --app-dir src --reload --host 0.0.0.0 --port 8000) & \
      (cd {{frontend_dir}} && bun run dev --host 0.0.0.0 --port 5173) & \
      wait \
    '
