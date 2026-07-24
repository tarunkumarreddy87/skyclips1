"""Add timeline_snapshots for editor autosave history."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0004_timeline_snapshots"
down_revision = "0003_brief_quote_model_brand"
branch_labels = None
depends_on = None

# Retention is enforced in application code (keep original + last N snapshots).
MAX_SNAPSHOTS_NOTE = 50


def upgrade() -> None:
    op.create_table(
        "timeline_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False, server_default="autosave"),
        sa.Column("is_original", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("editor_s3_key", sa.String(length=1024), nullable=True),
        sa.Column("timeline_s3_key", sa.String(length=1024), nullable=False),
        sa.Column("metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_timeline_snapshots_project_created",
        "timeline_snapshots",
        ["project_id", "created_at"],
    )
    op.create_index(
        "ix_timeline_snapshots_project_original",
        "timeline_snapshots",
        ["project_id", "is_original"],
    )


def downgrade() -> None:
    op.drop_index("ix_timeline_snapshots_project_original", table_name="timeline_snapshots")
    op.drop_index("ix_timeline_snapshots_project_created", table_name="timeline_snapshots")
    op.drop_table("timeline_snapshots")
