# HANUMAN Infrastructure

## Full stack (Docker Compose)

From the **repository root**:

```bash
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up --build -d
```

This starts:

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Application database |
| `redis` | 6379 | Cache / readiness checks |
| `minio` | 9000, 9001 | S3-compatible object storage |
| `temporal` | 7233 | Workflow engine |
| `temporal-ui` | 8080 | Temporal Web UI |
| `migrate` | — | One-shot Alembic migrations |
| `api` | 8000 | FastAPI (`GET /health`) |
| `orchestrator` | — | Temporal worker (logs on startup) |
| `media` | — | FFmpeg worker (logs on startup) |
| `web` | 3000 | Next.js frontend |

### Verify

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
open http://localhost:3000
open http://localhost:8080
```

### Logs

```bash
docker compose -f infrastructure/docker-compose.yml logs -f api orchestrator media
```

### Stop

```bash
docker compose -f infrastructure/docker-compose.yml down
```

## Infrastructure only (local dev)

If you prefer running app processes on the host (hot reload):

```bash
make up
make init-minio
make migrate
make api        # terminal 1
make orchestrator
make media
make web
```

See [../README.md](../README.md) and [../docs/runbooks/local-dev.md](../docs/runbooks/local-dev.md).
