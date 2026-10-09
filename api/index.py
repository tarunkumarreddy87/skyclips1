"""Vercel Python entrypoint for the FastAPI HTTP API.

The production database, Redis, Temporal, and S3 endpoints are supplied through
Vercel environment variables. Long-running render workers remain on the worker
runtime; this function exposes the API control plane.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
sys.path.insert(0, str(ROOT / "packages" / "timeline-schema" / "python"))

from app.main import app  # noqa: E402

__all__ = ["app"]
