from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

BACKEND_ROOT = Path(__file__).resolve().parents[3]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
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


config = context.config
if not config.get_main_option('sqlalchemy.url'):
    settings = get_settings()
    config.set_main_option('sqlalchemy.url', settings.db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option('sqlalchemy.url')
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, compare_type=True)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
