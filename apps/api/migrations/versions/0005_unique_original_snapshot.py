"""Enforce at most one is_original snapshot per project."""

from alembic import op

revision = "0005_unique_original_snapshot"
down_revision = "0004_timeline_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Demote duplicate originals before unique index (keep earliest per project).
    op.execute(
        """
        UPDATE timeline_snapshots AS t
        SET is_original = false,
            action_type = 'demoted',
            label = LEFT('Duplicate original (demoted) — ' || t.label, 255)
        WHERE t.is_original = true
          AND t.id NOT IN (
            SELECT kept.id FROM (
              SELECT DISTINCT ON (project_id) id
              FROM timeline_snapshots
              WHERE is_original = true
              ORDER BY project_id, created_at ASC
            ) AS kept
          )
        """
    )
    op.create_index(
        "uq_timeline_snapshots_one_original_per_project",
        "timeline_snapshots",
        ["project_id"],
        unique=True,
        postgresql_where="is_original = true",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_timeline_snapshots_one_original_per_project",
        table_name="timeline_snapshots",
    )
