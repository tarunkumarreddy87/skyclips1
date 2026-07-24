import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities.render import render_video
from src.config import settings
from src.render.ffmpeg_pipeline import ffmpeg_available, ffmpeg_version

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    if not ffmpeg_available():
        logger.warning("FFmpeg not found on PATH; render will fail")

    logger.info("FFmpeg: %s", ffmpeg_version())
    logger.info("Connecting to Temporal at %s", settings.temporal_host)

    client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue_media,
        activities=[render_video],
    )

    logger.info("Media worker started on queue '%s'", settings.temporal_task_queue_media)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
