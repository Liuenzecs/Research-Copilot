"""ai curation and read_at enhancements

Revision ID: 20260321_0004
Revises: 20260319_0003
Create Date: 2026-03-21 12:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '20260321_0004'
down_revision = '20260319_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('paper_research_state') as batch_op:
        batch_op.add_column(sa.Column('read_at', sa.Date(), nullable=True))
        batch_op.create_index(op.f('ix_paper_research_state_read_at'), ['read_at'], unique=False)

    with op.batch_alter_table('research_project_saved_searches') as batch_op:
        batch_op.add_column(sa.Column('search_mode', sa.String(length=20), nullable=False, server_default='manual'))
        batch_op.add_column(sa.Column('user_need', sa.Text(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('selection_profile', sa.String(length=30), nullable=False, server_default='balanced'))
        batch_op.add_column(sa.Column('target_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.create_index(op.f('ix_research_project_saved_searches_search_mode'), ['search_mode'], unique=False)

    with op.batch_alter_table('research_project_saved_search_candidates') as batch_op:
        batch_op.add_column(sa.Column('selected_by_ai', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('selection_bucket', sa.String(length=30), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('selection_rank', sa.Integer(), nullable=True))
        batch_op.create_index(op.f('ix_research_project_saved_search_candidates_selected_by_ai'), ['selected_by_ai'], unique=False)
        batch_op.create_index(op.f('ix_research_project_saved_search_candidates_selection_bucket'), ['selection_bucket'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('research_project_saved_search_candidates') as batch_op:
        batch_op.drop_index(op.f('ix_research_project_saved_search_candidates_selection_bucket'))
        batch_op.drop_index(op.f('ix_research_project_saved_search_candidates_selected_by_ai'))
        batch_op.drop_column('selection_rank')
        batch_op.drop_column('selection_bucket')
        batch_op.drop_column('selected_by_ai')

    with op.batch_alter_table('research_project_saved_searches') as batch_op:
        batch_op.drop_index(op.f('ix_research_project_saved_searches_search_mode'))
        batch_op.drop_column('target_count')
        batch_op.drop_column('selection_profile')
        batch_op.drop_column('user_need')
        batch_op.drop_column('search_mode')

    with op.batch_alter_table('paper_research_state') as batch_op:
        batch_op.drop_index(op.f('ix_paper_research_state_read_at'))
        batch_op.drop_column('read_at')
