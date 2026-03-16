from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.db.memory_record import MemoryItemRecord
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.summary_record import SummaryRecord


def _now():
    return datetime.now(timezone.utc)


def test_library_list_exposes_my_paper_flags_and_recent_activity(client):
    with SessionLocal() as db:
        now = _now()
        paper = PaperRecord(
            source='arxiv',
            source_id='library-paper',
            title_en='Library Paper',
            abstract_en='Library abstract',
            authors='Alice, Bob',
            year=2025,
            venue='arXiv',
            pdf_url='https://arxiv.org/pdf/library-paper.pdf',
            pdf_local_path='backend/data/papers/library-paper.pdf',
            created_at=now,
            updated_at=now,
        )
        db.add(paper)
        db.flush()

        state = PaperResearchStateRecord(
            paper_id=paper.id,
            reading_status='reading',
            interest_level=4,
            repro_interest='high',
            is_core_paper=True,
            last_opened_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(state)
        db.flush()

        db.add(
            SummaryRecord(
                paper_id=paper.id,
                summary_type='quick',
                content_en='summary',
                created_at=now,
                updated_at=now,
            )
        )
        db.add(
            ReflectionRecord(
                reflection_type='paper',
                related_paper_id=paper.id,
                related_summary_id=None,
                template_type='paper',
                stage='deep_read',
                lifecycle_status='draft',
                content_structured_json='{}',
                content_markdown='reflection',
                is_report_worthy=False,
                report_summary='summary',
                event_date=now.date(),
                created_at=now,
                updated_at=now,
            )
        )
        db.add(
            ReproductionRecord(
                paper_id=paper.id,
                repo_id=None,
                plan_markdown='# plan',
                progress_summary='progress',
                progress_percent=20,
                status='planned',
                created_at=now,
                updated_at=now,
            )
        )
        db.add(
            MemoryItemRecord(
                memory_type='PaperMemory',
                ref_table='papers',
                ref_id=paper.id,
                layer='structured',
                text_content='memory',
                importance=0.8,
                archived=False,
                pinned=False,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    response = client.get('/library/list')
    assert response.status_code == 200
    payload = response.json()
    assert payload['total'] == 1
    item = payload['items'][0]
    assert item['authors'] == 'Alice, Bob'
    assert item['is_downloaded'] is True
    assert item['in_memory'] is True
    assert item['memory_count'] == 1
    assert item['summary_count'] == 1
    assert item['reflection_count'] == 1
    assert item['reproduction_count'] == 1
    assert item['is_my_library'] is True
    assert item['last_activity_at']
    assert item['last_activity_label']
