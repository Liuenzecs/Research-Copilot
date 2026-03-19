"""workspace top10 enhancements

Revision ID: 20260319_0003
Revises: 20260319_0002
Create Date: 2026-03-19 13:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '20260319_0003'
down_revision = '20260319_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('papers') as batch_op:
        batch_op.add_column(sa.Column('merged_into_paper_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('pdf_status', sa.String(length=30), nullable=False, server_default='missing'))
        batch_op.add_column(sa.Column('pdf_status_message', sa.Text(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('pdf_last_checked_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('integrity_status', sa.String(length=30), nullable=False, server_default='warning'))
        batch_op.add_column(sa.Column('integrity_note', sa.Text(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('metadata_last_checked_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key('fk_papers_merged_into_paper_id', 'papers', ['merged_into_paper_id'], ['id'])
        batch_op.create_index(op.f('ix_papers_merged_into_paper_id'), ['merged_into_paper_id'], unique=False)
        batch_op.create_index(op.f('ix_papers_pdf_status'), ['pdf_status'], unique=False)
        batch_op.create_index(op.f('ix_papers_integrity_status'), ['integrity_status'], unique=False)

    with op.batch_alter_table('weekly_reports') as batch_op:
        batch_op.add_column(sa.Column('project_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_weekly_reports_project_id', 'research_projects', ['project_id'], ['id'])
        batch_op.create_index(op.f('ix_weekly_reports_project_id'), ['project_id'], unique=False)

    op.create_table(
        'project_activity_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('ref_type', sa.String(length=50), nullable=False),
        sa.Column('ref_id', sa.Integer(), nullable=True),
        sa.Column('metadata_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['research_projects.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_project_activity_events_project_id'), 'project_activity_events', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_activity_events_event_type'), 'project_activity_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_project_activity_events_ref_type'), 'project_activity_events', ['ref_type'], unique=False)
    op.create_index(op.f('ix_project_activity_events_ref_id'), 'project_activity_events', ['ref_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_project_activity_events_ref_id'), table_name='project_activity_events')
    op.drop_index(op.f('ix_project_activity_events_ref_type'), table_name='project_activity_events')
    op.drop_index(op.f('ix_project_activity_events_event_type'), table_name='project_activity_events')
    op.drop_index(op.f('ix_project_activity_events_project_id'), table_name='project_activity_events')
    op.drop_table('project_activity_events')

    with op.batch_alter_table('weekly_reports') as batch_op:
        batch_op.drop_index(op.f('ix_weekly_reports_project_id'))
        batch_op.drop_constraint('fk_weekly_reports_project_id', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('papers') as batch_op:
        batch_op.drop_index(op.f('ix_papers_integrity_status'))
        batch_op.drop_index(op.f('ix_papers_pdf_status'))
        batch_op.drop_index(op.f('ix_papers_merged_into_paper_id'))
        batch_op.drop_constraint('fk_papers_merged_into_paper_id', type_='foreignkey')
        batch_op.drop_column('metadata_last_checked_at')
        batch_op.drop_column('integrity_note')
        batch_op.drop_column('integrity_status')
        batch_op.drop_column('pdf_last_checked_at')
        batch_op.drop_column('pdf_status_message')
        batch_op.drop_column('pdf_status')
        batch_op.drop_column('merged_into_paper_id')
