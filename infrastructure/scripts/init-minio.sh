#!/usr/bin/env sh
set -e
docker compose -f infrastructure/docker-compose.yml run --rm minio-init
