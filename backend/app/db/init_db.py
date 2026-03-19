from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.core.config import PROJECT_ROOT, get_settings
from app.db.session import engine
from app.models.db.base import Base

# Import model modules for metadata registration.
from app.models.db import idea_record  # noqa: F401
from app.models.db import memory_record  # noqa: F401
from app.models.db import note_record  # noqa: F401
from app.models.db import paper_annotation_record  # noqa: F401
from app.models.db import paper_record  # noqa: F401
from app.models.db import profile_record  # noqa: F401
from app.models.db import project_activity_record  # noqa: F401
from app.models.db import reflection_record  # noqa: F401
from app.models.db import research_project_record  # noqa: F401
from app.models.db import repo_record  # noqa: F401
from app.models.db import reproduction_record  # noqa: F401
from app.models.db import summary_record  # noqa: F401
from app.models.db import task_artifact_record  # noqa: F401
from app.models.db import task_record  # noqa: F401
from app.models.db import translation_record  # noqa: F401
from app.models.db import weekly_report_record  # noqa: F401


ALEMBIC_BASELINE_REVISION = '20260318_0001'
POST_BASELINE_TABLES = {
    'research_project_saved_searches',
    'research_project_search_runs',
    'research_project_saved_search_candidates',
    'project_activity_events',
}
POST_BASELINE_INDEXES = {
    'ix_research_project_saved_searches_last_run_id',
    'ix_research_project_saved_searches_project_id',
    'ix_research_project_saved_searches_sort_mode',
    'ix_research_project_search_runs_project_id',
    'ix_research_project_search_runs_saved_search_id',
    'ix_research_project_search_runs_sort_mode',
    'ix_research_project_saved_search_candidates_first_seen_run_id',
    'ix_research_project_saved_search_candidates_last_seen_run_id',
    'ix_research_project_saved_search_candidates_paper_id',
    'ix_research_project_saved_search_candidates_saved_search_id',
    'ix_research_project_saved_search_candidates_triage_status',
    'ix_papers_openalex_id',
    'ix_papers_semantic_scholar_id',
    'ix_papers_merged_into_paper_id',
    'ix_papers_pdf_status',
    'ix_papers_integrity_status',
    'ix_weekly_reports_project_id',
    'ix_project_activity_events_project_id',
    'ix_project_activity_events_event_type',
    'ix_project_activity_events_ref_type',
    'ix_project_activity_events_ref_id',
}
POST_BASELINE_FKS = {
    'fk_papers_merged_into_paper_id',
    'fk_weekly_reports_project_id',
}
POST_BASELINE_FK_COLUMNS = {
    ('papers', ('merged_into_paper_id',), 'papers'),
    ('weekly_reports', ('project_id',), 'research_projects'),
}
POST_BASELINE_COLUMNS = {
    ('papers', 'doi'),
    ('papers', 'paper_url'),
    ('papers', 'openalex_id'),
    ('papers', 'semantic_scholar_id'),
    ('papers', 'citation_count'),
    ('papers', 'reference_count'),
    ('papers', 'merged_into_paper_id'),
    ('papers', 'pdf_status'),
    ('papers', 'pdf_status_message'),
    ('papers', 'pdf_last_checked_at'),
    ('papers', 'integrity_status'),
    ('papers', 'integrity_note'),
    ('papers', 'metadata_last_checked_at'),
    ('weekly_reports', 'project_id'),
}


def _build_alembic_config() -> Config:
    settings = get_settings()
    config = Config(str(PROJECT_ROOT / 'backend' / 'alembic.ini'))
    config.set_main_option('script_location', str(PROJECT_ROOT / 'backend' / 'app' / 'db' / 'migrations'))
    config.set_main_option('sqlalchemy.url', settings.db_url)
    return config


def _sqlite_db_path() -> Path | None:
    db_url = get_settings().db_url
    prefix = 'sqlite:///'
    if not db_url.startswith(prefix) or ':memory:' in db_url.lower():
        return None
    return Path(db_url[len(prefix):]).resolve()


def _backup_database() -> Path | None:
    db_path = _sqlite_db_path()
    if db_path is None or not db_path.exists():
        return None
    backup_dir = Path(get_settings().data_dir) / 'backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = backup_dir / f'{timestamp}-research_copilot.db'
    shutil.copy2(db_path, backup_path)
    return backup_path


def _schema_diffs() -> list[tuple]:
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={'compare_type': True})
        return compare_metadata(context, Base.metadata)


def _is_known_post_baseline_diff(diff: tuple) -> bool:
    operation = diff[0] if diff else None
    if operation == 'add_table':
        table = diff[1]
        return getattr(table, 'name', '') in POST_BASELINE_TABLES
    if operation == 'add_index':
        index = diff[1]
        return getattr(index, 'name', '') in POST_BASELINE_INDEXES
    if operation == 'add_column':
        table_name = diff[2]
        column = diff[3]
        return (str(table_name), getattr(column, 'name', '')) in POST_BASELINE_COLUMNS
    if operation == 'add_fk':
        constraint = diff[1]
        if getattr(constraint, 'name', '') in POST_BASELINE_FKS:
            return True
        table_name = getattr(getattr(constraint, 'table', None), 'name', '')
        constrained_columns = tuple(element.parent.name for element in getattr(constraint, 'elements', []))
        referred_table = ''
        elements = getattr(constraint, 'elements', [])
        if elements:
            referred_table = getattr(getattr(elements[0], 'column', None), 'table', None)
            referred_table = getattr(referred_table, 'name', '')
        return (table_name, constrained_columns, referred_table) in POST_BASELINE_FK_COLUMNS
    return False


def initialize_database() -> None:
    config = _build_alembic_config()
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())

    if not tables:
        command.upgrade(config, 'head')
        return

    if 'alembic_version' in tables:
        command.upgrade(config, 'head')
        return

    backup_path = _backup_database()
    diffs = _schema_diffs()
    if diffs:
        if all(_is_known_post_baseline_diff(diff) for diff in diffs):
            command.stamp(config, ALEMBIC_BASELINE_REVISION)
            command.upgrade(config, 'head')
            return
        preview = '; '.join(str(item) for item in diffs[:5])
        backup_note = f' Backup created at {backup_path}.' if backup_path is not None else ''
        raise RuntimeError(
            'Existing database schema does not match the Alembic baseline.'
            f'{backup_note} Diffs: {preview}'
        )

    command.stamp(config, 'head')


if __name__ == '__main__':
    initialize_database()
    print('Database initialized and migrated to head.')
