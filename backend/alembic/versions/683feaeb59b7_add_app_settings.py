"""add_app_settings

Revision ID: 683feaeb59b7
Revises: 1662b6fded47
Create Date: 2026-05-27 11:21:20.189951

POST-PROCESS CHECKLIST (autogenerate does NOT do this — fix before running):
1. Replace bare table names:  op.create_table('users', ...)  ->  op.create_table(tbl('users'), ...)
2. Replace FK refs:           ['users.id']                  ->  [f"{tbl('users')}.id"]
3. Replace constraint names:  op.f('pk_users')              ->  f"pk_{tbl('users')}"
4. Replace sa.JSON():         sa.JSON()                     ->  JSONText()  (for JSON/dict columns)

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.config import tbl
from app.types import JSONText


# revision identifiers, used by Alembic.
revision: str = '683feaeb59b7'
down_revision: Union[str, Sequence[str], None] = '1662b6fded47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(tbl('app_settings'),
    sa.Column('id', sa.String(length=16), nullable=False),
    sa.Column('company_name', sa.String(length=255), nullable=False),
    sa.Column('timezone', sa.String(length=100), nullable=False),
    sa.Column('sla_targets', JSONText(), nullable=True),
    sa.Column('resolution_codes', JSONText(), nullable=True),
    sa.Column('setup_completed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('setup_completed_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['setup_completed_by'], [f"{tbl('users')}.id"], name=f"fk_{tbl('app_settings')}_setup_completed_by_{tbl('users')}"),
    sa.PrimaryKeyConstraint('id', name=f"pk_{tbl('app_settings')}")
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table(tbl('app_settings'))
