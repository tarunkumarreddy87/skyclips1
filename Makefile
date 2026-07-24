COMPOSE_FILE := infrastructure/docker-compose.yml
COMPOSE_ENV := --env-file .env
COMPOSE := docker compose $(COMPOSE_ENV) -f $(COMPOSE_FILE)

.PHONY: up down logs ps init-minio up-all api web orchestrator media migrate install render-service

up:
	$(COMPOSE) up -d postgres redis minio temporal temporal-ui
	$(COMPOSE) run --rm minio-init
	@echo "Infrastructure ready."
	@$(COMPOSE) ps

up-all:
	$(COMPOSE) up --build -d
	@echo "Full stack started. API: http://localhost:8000/health  Web: http://localhost:3000"
	@$(COMPOSE) ps

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

init-minio:
	$(COMPOSE) run --rm minio-init

install:
	pnpm install
	cd apps/api && uv sync
	cd workers/orchestrator && uv sync
	cd workers/media && uv sync

migrate:
	cd apps/api && uv run alembic upgrade head

# Host-run services use localhost endpoints even if docker compose leaked service hostnames.
HOST_APP_ENV := TEMPORAL_HOST=localhost:7233

api:
	cd apps/api && $(HOST_APP_ENV) uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

web:
	cd apps/web && pnpm dev

orchestrator:
	cd workers/orchestrator && $(HOST_APP_ENV) uv run python -m src.worker

media:
	cd workers/media && $(HOST_APP_ENV) uv run python -m src.worker

render-service:
	cd render-service && pnpm dev
