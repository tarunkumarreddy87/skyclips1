"""Track generation credit charges for safe failure refunds."""

import sqlalchemy as sa
from alembic import op

revision = "0006_generation_run_credits"
down_revision = "0005_unique_original_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generation_runs",
        sa.Column("credit_charged_amount", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("generation_runs", "credit_charged_amount")
