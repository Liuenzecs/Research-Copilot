from app.db.session import engine
from app.models.db.base import Base

# Import model modules for metadata registration
from app.models.db import idea_record  # noqa: F401
from app.models.db import memory_record  # noqa: F401
from app.models.db import note_record  # noqa: F401
from app.models.db import paper_record  # noqa: F401
from app.models.db import profile_record  # noqa: F401
from app.models.db import reflection_record  # noqa: F401
from app.models.db import repo_record  # noqa: F401
from app.models.db import reproduction_record  # noqa: F401
from app.models.db import summary_record  # noqa: F401
from app.models.db import task_artifact_record  # noqa: F401
from app.models.db import task_record  # noqa: F401
from app.models.db import translation_record  # noqa: F401


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)


if __name__ == '__main__':
    initialize_database()
    print('Database initialized.')
