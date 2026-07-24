#!/usr/bin/env sh
# Wait for core infrastructure services (used in CI or scripted startup).
set -e

host="${1:-localhost}"

echo "Waiting for Postgres on ${host}:5432..."
until pg_isready -h "$host" -p 5432 -U hanuman -d hanuman 2>/dev/null; do sleep 1; done

echo "Waiting for Redis on ${host}:6379..."
until redis-cli -h "$host" -p 6379 ping 2>/dev/null | grep -q PONG; do sleep 1; done

echo "All services ready."
