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
        preview = '; '.join(str(item) for item in diffs[:5])
        backup_note = f' Backup created at {backup_path}.' if backup_path is not None else ''
        raise RuntimeError(
            'Existing database schema does not match the Alembic baseline.'
            f'{backup_note} Diffs: {preview}'
        )

    command.stamp(config, ALEMBIC_BASELINE_REVISION)
    command.upgrade(config, 'head')


if __name__ == '__main__':
    initialize_database()
    print('Database initialized and migrated to head.')
