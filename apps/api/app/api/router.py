from fastapi import APIRouter

from app.api.routes import editor_agent, generation, health, projects, render, stock

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(projects.router, tags=["projects"])
api_router.include_router(generation.router, tags=["generation"])
api_router.include_router(render.router)
api_router.include_router(editor_agent.router, tags=["editor-agent"])
api_router.include_router(stock.router)
api_router.include_router(generation.internal_router)
