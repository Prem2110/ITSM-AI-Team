"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

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
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, Sequence[str], None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    """Upgrade schema."""
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    """Downgrade schema."""
    ${downgrades if downgrades else "pass"}
