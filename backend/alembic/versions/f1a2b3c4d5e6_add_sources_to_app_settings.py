"""add sources to app_settings

Revision ID: f1a2b3c4d5e6
Revises: e6f7a8b9c0d1
Create Date: 2026-06-01 13:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.config import tbl

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table(tbl("app_settings"), schema=None) as batch_op:
        batch_op.add_column(sa.Column("sources", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(tbl("app_settings"), schema=None) as batch_op:
        batch_op.drop_column("sources")
