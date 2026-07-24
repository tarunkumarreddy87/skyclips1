from temporalio.client import Client

from app.config import settings


class TemporalService:
    async def _client(self) -> Client:
        return await Client.connect(
            settings.temporal_host,
            namespace=settings.temporal_namespace,
        )

    async def start_video_generation(self, workflow_id: str, workflow_input: dict) -> str:
        client = await self._client()
        handle = await client.start_workflow(
            "VideoGenerationWorkflow",
            workflow_input,
            id=workflow_id,
            task_queue=settings.temporal_task_queue_orchestrator,
        )
        return handle.result_run_id or handle.id

    async def start_video_render(self, workflow_id: str, workflow_input: dict) -> str:
        client = await self._client()
        handle = await client.start_workflow(
            "VideoRenderWorkflow",
            workflow_input,
            id=workflow_id,
            task_queue=settings.temporal_task_queue_orchestrator,
        )
        return handle.result_run_id or handle.id
