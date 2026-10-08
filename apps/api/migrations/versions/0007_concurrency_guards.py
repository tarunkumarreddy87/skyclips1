"""Prevent concurrent active runs and duplicate active quote versions."""

import sqlalchemy as sa
from alembic import op

revision = "0007_concurrency_guards"
down_revision = "0006_generation_run_credits"
branch_labels = None
depends_on = None


def _assert_no_existing_duplicates() -> None:
    connection = op.get_bind()
    duplicate_active_runs = connection.execute(
        sa.text(
            """
            SELECT project_id::text
            FROM generation_runs
            WHERE status IN ('QUEUED', 'RUNNING', 'queued', 'running')
            GROUP BY project_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """
        )
    ).scalars().all()
    duplicate_active_quotes = connection.execute(
        sa.text(
            """
            SELECT project_id::text
            FROM quotes
            WHERE is_active IS TRUE
            GROUP BY project_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """
        )
    ).scalars().all()
    duplicate_quote_versions = connection.execute(
        sa.text(
            """
            SELECT project_id::text || ':' || version::text
            FROM quotes
            GROUP BY project_id, version
            HAVING COUNT(*) > 1
            LIMIT 10
            """
        )
    ).scalars().all()
    problems: list[str] = []
    if duplicate_active_runs:
        problems.append("projects with multiple active runs: " + ", ".join(duplicate_active_runs))
    if duplicate_active_quotes:
        problems.append("projects with multiple active quotes: " + ", ".join(duplicate_active_quotes))
    if duplicate_quote_versions:
        problems.append("duplicate quote versions: " + ", ".join(duplicate_quote_versions))
    if problems:
        # Never silently pick a winner: an active run may carry a credit charge.
        raise RuntimeError(
            "Cannot install concurrency guards until duplicate rows are reconciled: "
            + "; ".join(problems)
        )


def upgrade() -> None:
    _assert_no_existing_duplicates()
    op.create_unique_constraint(
        "uq_quotes_project_version", "quotes", ["project_id", "version"]
    )
    op.create_index(
        "uq_quotes_one_active_per_project",
        "quotes",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("is_active IS TRUE"),
    )
    op.create_index(
        "uq_generation_runs_one_active_per_project",
        "generation_runs",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('QUEUED', 'RUNNING', 'queued', 'running')"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_generation_runs_one_active_per_project", table_name="generation_runs"
    )
    op.drop_index("uq_quotes_one_active_per_project", table_name="quotes")
    op.drop_constraint("uq_quotes_project_version", "quotes", type_="unique")
