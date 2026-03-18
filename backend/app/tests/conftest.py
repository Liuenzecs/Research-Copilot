import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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
