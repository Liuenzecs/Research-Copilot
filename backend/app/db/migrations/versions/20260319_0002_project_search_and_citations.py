"""project search and citations

Revision ID: 20260319_0002
Revises: 20260318_0001
Create Date: 2026-03-19 09:30:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260319_0002'
down_revision = '20260318_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('papers', sa.Column('doi', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('papers', sa.Column('paper_url', sa.Text(), nullable=False, server_default=''))
    op.add_column('papers', sa.Column('openalex_id', sa.String(length=64), nullable=False, server_default=''))
    op.add_column('papers', sa.Column('semantic_scholar_id', sa.String(length=128), nullable=False, server_default=''))
    op.add_column('papers', sa.Column('citation_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('papers', sa.Column('reference_count', sa.Integer(), nullable=False, server_default='0'))
    op.create_index(op.f('ix_papers_openalex_id'), 'papers', ['openalex_id'], unique=False)
    op.create_index(op.f('ix_papers_semantic_scholar_id'), 'papers', ['semantic_scholar_id'], unique=False)

    op.create_table(
        'research_project_saved_searches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('query', sa.Text(), nullable=False),
        sa.Column('filters_json', sa.Text(), nullable=False),
        sa.Column('sort_mode', sa.String(length=30), nullable=False),
        sa.Column('last_run_id', sa.Integer(), nullable=True),
        sa.Column('last_result_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['research_projects.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_research_project_saved_searches_last_run_id'), 'research_project_saved_searches', ['last_run_id'], unique=False)
    op.create_index(op.f('ix_research_project_saved_searches_project_id'), 'research_project_saved_searches', ['project_id'], unique=False)
    op.create_index(op.f('ix_research_project_saved_searches_sort_mode'), 'research_project_saved_searches', ['sort_mode'], unique=False)

    op.create_table(
        'research_project_search_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('saved_search_id', sa.Integer(), nullable=True),
        sa.Column('query', sa.Text(), nullable=False),
        sa.Column('filters_json', sa.Text(), nullable=False),
        sa.Column('sort_mode', sa.String(length=30), nullable=False),
        sa.Column('result_count', sa.Integer(), nullable=False),
        sa.Column('warnings_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['research_projects.id']),
        sa.ForeignKeyConstraint(['saved_search_id'], ['research_project_saved_searches.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_research_project_search_runs_project_id'), 'research_project_search_runs', ['project_id'], unique=False)
    op.create_index(op.f('ix_research_project_search_runs_saved_search_id'), 'research_project_search_runs', ['saved_search_id'], unique=False)
    op.create_index(op.f('ix_research_project_search_runs_sort_mode'), 'research_project_search_runs', ['sort_mode'], unique=False)

    op.create_table(
        'research_project_saved_search_candidates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('saved_search_id', sa.Integer(), nullable=False),
        sa.Column('paper_id', sa.Integer(), nullable=False),
        sa.Column('rank_position', sa.Integer(), nullable=False),
        sa.Column('rank_score', sa.Float(), nullable=False),
        sa.Column('reason_json', sa.Text(), nullable=False),
        sa.Column('ai_reason_text', sa.Text(), nullable=False),
        sa.Column('triage_status', sa.String(length=20), nullable=False),
        sa.Column('first_seen_run_id', sa.Integer(), nullable=True),
        sa.Column('last_seen_run_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['saved_search_id'], ['research_project_saved_searches.id']),
        sa.ForeignKeyConstraint(['paper_id'], ['papers.id']),
        sa.ForeignKeyConstraint(['first_seen_run_id'], ['research_project_search_runs.id']),
        sa.ForeignKeyConstraint(['last_seen_run_id'], ['research_project_search_runs.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('saved_search_id', 'paper_id', name='uq_research_project_saved_search_candidate'),
    )
    op.create_index(
        op.f('ix_research_project_saved_search_candidates_saved_search_id'),
        'research_project_saved_search_candidates',
        ['saved_search_id'],
        unique=False,
    )
    op.create_index(op.f('ix_research_project_saved_search_candidates_paper_id'), 'research_project_saved_search_candidates', ['paper_id'], unique=False)
    op.create_index(
        op.f('ix_research_project_saved_search_candidates_first_seen_run_id'),
        'research_project_saved_search_candidates',
        ['first_seen_run_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_research_project_saved_search_candidates_last_seen_run_id'),
        'research_project_saved_search_candidates',
        ['last_seen_run_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_research_project_saved_search_candidates_triage_status'),
        'research_project_saved_search_candidates',
        ['triage_status'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_research_project_saved_search_candidates_triage_status'), table_name='research_project_saved_search_candidates')
    op.drop_index(op.f('ix_research_project_saved_search_candidates_last_seen_run_id'), table_name='research_project_saved_search_candidates')
    op.drop_index(op.f('ix_research_project_saved_search_candidates_first_seen_run_id'), table_name='research_project_saved_search_candidates')
    op.drop_index(op.f('ix_research_project_saved_search_candidates_paper_id'), table_name='research_project_saved_search_candidates')
    op.drop_index(op.f('ix_research_project_saved_search_candidates_saved_search_id'), table_name='research_project_saved_search_candidates')
    op.drop_table('research_project_saved_search_candidates')

    op.drop_index(op.f('ix_research_project_search_runs_sort_mode'), table_name='research_project_search_runs')
    op.drop_index(op.f('ix_research_project_search_runs_saved_search_id'), table_name='research_project_search_runs')
    op.drop_index(op.f('ix_research_project_search_runs_project_id'), table_name='research_project_search_runs')
    op.drop_table('research_project_search_runs')

    op.drop_index(op.f('ix_research_project_saved_searches_sort_mode'), table_name='research_project_saved_searches')
    op.drop_index(op.f('ix_research_project_saved_searches_project_id'), table_name='research_project_saved_searches')
    op.drop_index(op.f('ix_research_project_saved_searches_last_run_id'), table_name='research_project_saved_searches')
    op.drop_table('research_project_saved_searches')

    op.drop_index(op.f('ix_papers_semantic_scholar_id'), table_name='papers')
    op.drop_index(op.f('ix_papers_openalex_id'), table_name='papers')
    op.drop_column('papers', 'reference_count')
    op.drop_column('papers', 'citation_count')
    op.drop_column('papers', 'semantic_scholar_id')
    op.drop_column('papers', 'openalex_id')
    op.drop_column('papers', 'paper_url')
    op.drop_column('papers', 'doi')
