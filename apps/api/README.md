# HANUMAN API

FastAPI backend for HANUMAN.

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /health` — liveness
- `GET /health/ready` — Postgres + Redis connectivity
- `POST /projects` — create project (prompt-first or script-first)
- `GET /projects` — list projects
- `GET /projects/{id}` — project detail with brief
- `POST /projects/{id}/upload-url` — presigned S3 upload URL (draft only)
- `POST /projects/{id}/quote` — generate quote from brief
- `GET /projects/{id}/quote` — get active quote
- `PATCH /projects/{id}/quote` — edit pending quote
- `POST /projects/{id}/approve` — approve quote (project → approved)

## Migrations

```bash
uv run alembic upgrade head
```
