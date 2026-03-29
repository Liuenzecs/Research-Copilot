"""add paper title zh

Revision ID: 20260329_0005
Revises: 20260321_0004
Create Date: 2026-03-29 18:40:00
"""

from alembic import op
import sqlalchemy as sa


revision = '20260329_0005'
down_revision = '20260321_0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('papers', sa.Column('title_zh', sa.Text(), nullable=False, server_default=''))
    op.execute("UPDATE papers SET title_zh = '' WHERE title_zh IS NULL")


def downgrade() -> None:
    op.drop_column('papers', 'title_zh')
