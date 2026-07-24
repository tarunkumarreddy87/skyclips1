import enum


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    QUOTED = "quoted"
    APPROVED = "approved"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EntryPath(str, enum.Enum):
    PROMPT_FIRST = "prompt_first"
    SCRIPT_FIRST = "script_first"


class FormatMode(str, enum.Enum):
    DOCUMENTARY = "documentary"
    LISTICLE = "listicle"


class QuoteStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SUPERSEDED = "superseded"


class GenerationRunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProgressStageStatus(str, enum.Enum):
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"


class ArtifactType(str, enum.Enum):
    RESEARCH = "research"
    SCRIPT = "script"
    NARRATION = "narration"
    NARRATION_SEGMENT = "narration_segment"
    SCENES = "scenes"
    SCENE_ASSET = "scene_asset"
    TIMELINE = "timeline"
    FINAL_VIDEO = "final_video"
