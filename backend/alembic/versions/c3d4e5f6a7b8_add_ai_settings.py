"""add ai settings to app_settings

Revision ID: c3d4e5f6a7b8
Revises: 9f1e6c2a4b11
Create Date: 2026-06-01 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.config import tbl

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "9f1e6c2a4b11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table(tbl("app_settings"), schema=None) as batch_op:
        batch_op.add_column(sa.Column("ai_enabled", sa.SmallInteger(), nullable=True, server_default="0"))
        batch_op.add_column(sa.Column("openrouter_api_key", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("openrouter_model", sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(tbl("app_settings"), schema=None) as batch_op:
        batch_op.drop_column("openrouter_model")
        batch_op.drop_column("openrouter_api_key")
        batch_op.drop_column("ai_enabled")
