import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_RUNTIME_ROOT = Path(tempfile.mkdtemp(prefix='research-copilot-tests-')).resolve()
TEST_DATA_DIR = TEST_RUNTIME_ROOT / 'data'
TEST_VECTOR_DIR = TEST_DATA_DIR / 'vectors'
TEST_DB_PATH = TEST_DATA_DIR / 'research_copilot.db'

os.environ['RESEARCH_COPILOT_ENV'] = 'test'
os.environ['RESEARCH_COPILOT_DATA_DIR'] = str(TEST_DATA_DIR)
os.environ['RESEARCH_COPILOT_VECTOR_DIR'] = str(TEST_VECTOR_DIR)
os.environ['RESEARCH_COPILOT_DB_URL'] = f"sqlite:///{TEST_DB_PATH.as_posix()}"

from app.db.init_db import initialize_database
from app.db.session import engine
from app.main import app
from app.models.db.base import Base


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text('DROP TABLE IF EXISTS alembic_version'))
    initialize_database()
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def pytest_sessionfinish(session, exitstatus):
    try:
        shutil.rmtree(TEST_RUNTIME_ROOT, ignore_errors=True)
    except OSError:
        pass
