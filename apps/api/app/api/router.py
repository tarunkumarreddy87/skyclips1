from fastapi import APIRouter

from app.api.routes import editor_agent, generation, health, media_proxies, projects, render, stock

api_router = APIRouter()
from app.api.routes import channel_settings
api_router.include_router(channel_settings.router, tags=["channel-settings"])
api_router.include_router(health.router, tags=["health"])
api_router.include_router(projects.router, tags=["projects"])
api_router.include_router(media_proxies.router, tags=["media"])
api_router.include_router(generation.router, tags=["generation"])
api_router.include_router(render.router)
api_router.include_router(editor_agent.router, tags=["editor-agent"])
api_router.include_router(stock.router)
api_router.include_router(generation.internal_router)

from app.api.routes import image_cutout
api_router.include_router(image_cutout.router, tags=["media"])
