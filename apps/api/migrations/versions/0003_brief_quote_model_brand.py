"""Add model_id and brand_profile_id to briefs and quotes."""

from alembic import op
import sqlalchemy as sa

revision = "0003_brief_quote_model_brand"
down_revision = "0002_core_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "briefs",
        sa.Column("model_id", sa.String(length=64), nullable=False, server_default="hanuman-v1"),
    )
    op.add_column(
        "briefs",
        sa.Column("brand_profile_id", sa.String(length=64), nullable=False, server_default="bp-1"),
    )
    op.add_column(
        "quotes",
        sa.Column("model_id", sa.String(length=64), nullable=False, server_default="hanuman-v1"),
    )
    op.add_column(
        "quotes",
        sa.Column("brand_profile_id", sa.String(length=64), nullable=False, server_default="bp-1"),
    )


def downgrade() -> None:
    op.drop_column("quotes", "brand_profile_id")
    op.drop_column("quotes", "model_id")
    op.drop_column("briefs", "brand_profile_id")
    op.drop_column("briefs", "model_id")
