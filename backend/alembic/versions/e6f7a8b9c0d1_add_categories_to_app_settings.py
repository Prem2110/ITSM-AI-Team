"""add categories to app_settings

Revision ID: e6f7a8b9c0d1
Revises: c3d4e5f6a7b8
Create Date: 2026-06-01 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.config import tbl

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table(tbl("app_settings"), schema=None) as batch_op:
        batch_op.add_column(sa.Column("categories", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(tbl("app_settings"), schema=None) as batch_op:
        batch_op.drop_column("categories")
