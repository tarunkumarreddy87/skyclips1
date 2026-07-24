from temporalio import activity


@activity.defn(name="stub_ping")
async def stub_ping(project_id: str) -> str:
    """Phase 0 stub activity. Replaced by real pipeline activities in Phase 3+."""
    activity.logger.info("stub_ping for project %s", project_id)
    return f"stub-ok:{project_id}"
