"""Vercel Python entrypoint for the FastAPI control-plane API."""
from app.main import app

__all__ = ["app"]
