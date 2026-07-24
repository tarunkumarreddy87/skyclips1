import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities.pipeline import (
    build_timeline,
    complete_timeline,
    complete_run,
    fail_run,
    generate_script,
    generate_voice,
    parse_script,
    plan_scenes,
    run_research,
    validate_brief,
)
from src.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Connecting to Temporal at %s", settings.temporal_host)
    client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )

    from src.workflows.video_generation import HealthCheckWorkflow, VideoGenerationWorkflow, VideoRenderWorkflow

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue_orchestrator,
        workflows=[VideoGenerationWorkflow, VideoRenderWorkflow, HealthCheckWorkflow],
        activities=[
            validate_brief,
            run_research,
            generate_script,
            parse_script,
            generate_voice,
            plan_scenes,
            build_timeline,
            complete_timeline,
            complete_run,
            fail_run,
        ],
    )

    logger.info("Orchestrator worker started on queue '%s'", settings.temporal_task_queue_orchestrator)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
