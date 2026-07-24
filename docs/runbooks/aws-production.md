# HANUMAN Production Deployment

Deployed: 2026-07-20

## Architecture

```
Internet → ALB → ECS: web (Next.js)
                    ↓ (service discovery)
              ECS: api (FastAPI) → RDS PostgreSQL
              ECS: orchestrator-worker → Temporal
              ECS: media-worker → render-service → Remotion Lambda
              ECS: render-service → AWS Lambda + S3
              ECS: redis, temporal

S3 hanuman-artifacts-{account} ← final MP4s
S3 remotionlambda-* ← Remotion site + render output
```

## Deployment URLs (live)

| Service | URL |
|---------|-----|
| **Application (ALB)** | http://hanuman-prod-alb-1485638145.us-east-1.elb.amazonaws.com |
| **Render service (internal)** | http://render-service.hanuman.local:8081 |
| **API (internal)** | http://api.hanuman.local:8000 |

## AWS Resources Created

| Resource | ID / Name |
|----------|-----------|
| Remotion Lambda | `remotion-render-4-0-489-mem2048mb-disk2048mb-120sec` |
| Remotion Site | `hanuman-timeline` |
| Remotion S3 | `remotionlambda-useast1-bpvm9ei88s` |
| Artifacts S3 | `hanuman-artifacts-623271127861` |
| ECS Cluster | `hanuman-prod` |
| ALB | `hanuman-prod-alb-1485638145.us-east-1.elb.amazonaws.com` |
| ECR Repos | `hanuman/api`, `hanuman/web`, `hanuman/media`, `hanuman/orchestrator`, `hanuman/render-service` |
| IAM Role | `remotion-lambda-role` |
| CloudWatch Logs | `/ecs/hanuman-prod/*` |

## Environment Variables

See `infrastructure/aws/deployment-state.json` for live values.

### Remotion Lambda (all render paths)
```
REMOTION_FUNCTION_NAME=remotion-render-4-0-489-mem2048mb-disk2048mb-120sec
REMOTION_SERVE_URL=https://remotionlambda-useast1-bpvm9ei88s.s3.us-east-1.amazonaws.com/sites/hanuman-timeline/index.html
REMOTION_BUCKET_NAME=remotionlambda-useast1-bpvm9ei88s
RENDER_ENGINE=remotion-lambda
REMOTION_MAX_CONCURRENCY=8
REMOTION_ACCOUNT_CONCURRENCY_LIMIT=10
REMOTION_CONCURRENCY_PER_LAMBDA=2
REMOTION_FUNCTION_MEMORY_MB=3008
REMOTION_FUNCTION_TIMEOUT_SEC=900
```

Function name is stale (`…120sec`); live config is **3008 MB / 900 s**. Known-good validation (2026-07-24): IF stills S3 max chunk **515s**, OffthreadVideo slice max chunk **439s** — both under 900s. Details: `infrastructure/remotion-lambda/README.md` § Known-good config.

### Render Service
```
AWS_ACCESS_KEY_ID=<from IAM user>
AWS_SECRET_ACCESS_KEY=<from IAM user>
AWS_REGION=us-east-1
S3_BUCKET_NAME=hanuman-artifacts-623271127861
```

## Deploy Commands

```powershell
# Phase 1: S3, ECR, RDS, Secrets
.\infrastructure\aws\deploy.ps1

# Phase 2: ECS services
.\infrastructure\aws\deploy-ecs.ps1
```

## Render API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /render/start` | Start Lambda render |
| `GET /render/{id}/status` | Poll progress |
| `GET /render/{id}/result` | Get final URL |
| `DELETE /render/{id}` | Cancel render |

Product flow uses `POST /projects/{id}/render` → Temporal → media worker → render-service.

## Estimated Monthly Cost (us-east-1)

| Service | Estimate |
|---------|----------|
| ECS Fargate (6 tasks, 0.5 vCPU each) | ~$90–150 |
| RDS db.t4g.micro | ~$12 |
| ElastiCache / Redis on ECS | ~$5–15 |
| ALB | ~$20 |
| S3 storage (100 GB) | ~$2–5 |
| Remotion Lambda renders (10× 10min/mo) | ~$5–20 |
| CloudWatch logs | ~$5 |
| **Total** | **~$140–220/mo** (excluding LLM/TTS API costs) |

## Security Recommendations

1. Enable HTTPS on ALB with ACM certificate
2. Move AWS keys to IAM roles for ECS tasks (not env vars in render-service)
3. Enable S3 bucket policies blocking public access (done)
4. Rotate `INTERNAL_API_KEY` via Secrets Manager
5. Add WAF on ALB
6. Request Lambda concurrency quota increase (500+)
7. Add auth (Clerk/Auth0) before public launch

## Post-Deploy Checklist

- [ ] Run `alembic upgrade head` against RDS
- [ ] Create `temporal` database on RDS for Temporal server
- [ ] Set `OPENROUTER_API_KEY`, `PEXELS_API_KEY`, `SARVAM_API_KEY` in Secrets Manager
- [ ] Verify render: create project → generate → render → download MP4
- [ ] Request Lambda concurrency quota increase
