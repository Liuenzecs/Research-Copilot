from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app.db import init_db
from app.models.db.base import Base


class _FakeSettings:
    def __init__(self, db_url: str, data_dir: Path):
        self.db_url = db_url
        self.data_dir = str(data_dir)


def _bind_temp_runtime(monkeypatch, tmp_path: Path):
    db_path = tmp_path / 'research_copilot.db'
    data_dir = tmp_path / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f'sqlite:///{db_path.as_posix()}', connect_args={'check_same_thread': False})
    settings = _FakeSettings(f'sqlite:///{db_path.as_posix()}', data_dir)
    monkeypatch.setattr(init_db, 'engine', engine)
    monkeypatch.setattr(init_db, 'get_settings', lambda: settings)
    return engine, db_path, data_dir


def test_initialize_database_upgrades_new_database(monkeypatch, tmp_path):
    engine, _, _ = _bind_temp_runtime(monkeypatch, tmp_path)
    try:
        init_db.initialize_database()
        tables = set(inspect(engine).get_table_names())
        assert 'papers' in tables
        assert 'research_projects' in tables
        assert 'alembic_version' in tables
    finally:
        engine.dispose()


def test_initialize_database_stamps_existing_matching_schema(monkeypatch, tmp_path):
    engine, db_path, data_dir = _bind_temp_runtime(monkeypatch, tmp_path)
    try:
        Base.metadata.create_all(bind=engine)
        init_db.initialize_database()

        tables = set(inspect(engine).get_table_names())
        assert 'alembic_version' in tables
        backup_files = list((data_dir / 'backups').glob('*-research_copilot.db'))
        assert backup_files
        assert db_path.exists()
    finally:
        engine.dispose()


def test_initialize_database_fails_fast_on_unexpected_schema(monkeypatch, tmp_path):
    engine, _, data_dir = _bind_temp_runtime(monkeypatch, tmp_path)
    try:
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE legacy_only (id INTEGER PRIMARY KEY, label TEXT)'))

        with pytest.raises(RuntimeError, match='Alembic baseline'):
            init_db.initialize_database()

        backup_files = list((data_dir / 'backups').glob('*-research_copilot.db'))
        assert backup_files
    finally:
        engine.dispose()
