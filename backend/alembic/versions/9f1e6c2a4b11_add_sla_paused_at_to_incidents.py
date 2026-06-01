"""add_sla_paused_at_to_incidents

Revision ID: 9f1e6c2a4b11
Revises: 683feaeb59b7
Create Date: 2026-05-31 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.config import tbl


# revision identifiers, used by Alembic.
revision: str = "9f1e6c2a4b11"
down_revision: Union[str, Sequence[str], None] = "683feaeb59b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table(tbl("incidents"), schema=None) as batch_op:
        batch_op.add_column(sa.Column("sla_paused_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(tbl("incidents"), schema=None) as batch_op:
        batch_op.drop_column("sla_paused_at")
