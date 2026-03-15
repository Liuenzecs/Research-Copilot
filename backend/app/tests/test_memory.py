from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.db.idea_record import IdeaRecord
from app.models.db.memory_record import MemoryItemRecord
from app.models.db.paper_record import PaperRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord
from app.models.db.summary_record import SummaryRecord


def _now():
    return datetime.now(timezone.utc)


def _create_paper(db, *, source_id: str, title: str) -> PaperRecord:
    now = _now()
    row = PaperRecord(
        source='arxiv',
        source_id=source_id,
        title_en=title,
        abstract_en=f'{title} abstract',
        authors='A',
        year=2025,
        venue='arXiv',
        pdf_url=f'https://example.com/{source_id}.pdf',
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def _create_memory(db, *, memory_type: str, ref_table: str, ref_id: int | None, text_content: str) -> MemoryItemRecord:
    now = _now()
    row = MemoryItemRecord(
        memory_type=memory_type,
        layer='structured',
        ref_table=ref_table,
        ref_id=ref_id,
        text_content=text_content,
        importance=0.8,
        pinned=False,
        archived=False,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def test_memory_query_returns_precise_jump_targets(client, monkeypatch):
    monkeypatch.setattr('app.services.memory.retriever.semantic_query', lambda query, top_k=10: [])

    with SessionLocal() as db:
        paper = _create_paper(db, source_id='memory-paper', title='Memory Paper')
        summary = SummaryRecord(
            paper_id=paper.id,
            summary_type='quick',
            content_en='summary',
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(summary)
        db.flush()

        reproduction = ReproductionRecord(
            paper_id=paper.id,
            repo_id=None,
            plan_markdown='# plan',
            progress_summary='progress',
            progress_percent=40,
            status='in_progress',
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(reproduction)
        db.flush()

        reflection = ReflectionRecord(
            reflection_type='paper',
            related_paper_id=paper.id,
            related_summary_id=summary.id,
            template_type='paper',
            stage='deep_read',
            lifecycle_status='draft',
            content_structured_json='{}',
            content_markdown='note',
            is_report_worthy=False,
            report_summary='reflection',
            event_date=_now().date(),
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(reflection)
        db.flush()

        repo = RepoRecord(
            paper_id=paper.id,
            platform='github',
            repo_url='https://github.com/test/memory-paper',
            owner='test',
            name='memory-paper',
            stars=1,
            forks=0,
            readme_summary='repo',
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(repo)
        db.flush()

        repo_without_paper = RepoRecord(
            paper_id=None,
            platform='github',
            repo_url='https://github.com/test/no-paper',
            owner='test',
            name='no-paper',
            stars=1,
            forks=0,
            readme_summary='repo',
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(repo_without_paper)
        db.flush()

        idea = IdeaRecord(
            paper_id=None,
            idea_type='idea',
            content='idea content',
            priority=3,
            status='new',
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(idea)
        db.flush()

        paper_memory = _create_memory(db, memory_type='PaperMemory', ref_table='papers', ref_id=paper.id, text_content='paper memory')
        summary_memory = _create_memory(db, memory_type='SummaryMemory', ref_table='summaries', ref_id=summary.id, text_content='summary memory')
        repro_memory = _create_memory(db, memory_type='ReproMemory', ref_table='reproductions', ref_id=reproduction.id, text_content='repro memory')
        reflection_memory = _create_memory(db, memory_type='ReflectionMemory', ref_table='reflections', ref_id=reflection.id, text_content='reflection memory')
        repo_memory = _create_memory(db, memory_type='RepoMemory', ref_table='repos', ref_id=repo.id, text_content='repo memory')
        repo_without_paper_memory = _create_memory(db, memory_type='RepoMemory', ref_table='repos', ref_id=repo_without_paper.id, text_content='repo without paper')
        idea_memory = _create_memory(db, memory_type='IdeaMemory', ref_table='ideas', ref_id=idea.id, text_content='idea memory')
        unknown_memory = _create_memory(db, memory_type='UnknownMemory', ref_table='unknown', ref_id=999, text_content='unknown memory')
        db.commit()
        paper_id = paper.id
        summary_id = summary.id
        reproduction_id = reproduction.id
        reflection_id = reflection.id
        paper_memory_id = paper_memory.id
        summary_memory_id = summary_memory.id
        repro_memory_id = repro_memory.id
        reflection_memory_id = reflection_memory.id
        repo_memory_id = repo_memory.id
        repo_without_paper_memory_id = repo_without_paper_memory.id
        idea_memory_id = idea_memory.id
        unknown_memory_id = unknown_memory.id

    response = client.post('/memory/query', json={'query': 'memory', 'memory_types': [], 'layers': [], 'top_k': 10})
    assert response.status_code == 200
    payload = {item['id']: item for item in response.json()}

    assert payload[paper_memory_id]['jump_target'] == {'kind': 'paper', 'path': f'/search?paper_id={paper_id}'}
    assert payload[summary_memory_id]['jump_target'] == {'kind': 'paper', 'path': f'/search?paper_id={paper_id}&summary_id={summary_id}'}
    assert payload[repro_memory_id]['jump_target'] == {'kind': 'reproduction', 'path': f'/reproduction?reproduction_id={reproduction_id}'}
    assert payload[reflection_memory_id]['jump_target'] == {'kind': 'reflection', 'path': f'/reflections?reflection_id={reflection_id}'}
    assert payload[repo_memory_id]['jump_target'] == {'kind': 'reproduction', 'path': f'/reproduction?paper_id={paper_id}'}
    assert payload[idea_memory_id]['jump_target'] == {'kind': 'brainstorm', 'path': '/brainstorm'}
    assert payload[repo_without_paper_memory_id]['jump_target'] is None
    assert payload[unknown_memory_id]['jump_target'] is None


def test_memory_query_keeps_existing_shape_when_no_records(client, monkeypatch):
    monkeypatch.setattr('app.services.memory.retriever.semantic_query', lambda query, top_k=10: [])

    payload = client.post('/memory/query', json={'query': 'anything', 'memory_types': [], 'layers': [], 'top_k': 5})
    assert payload.status_code == 200
    assert isinstance(payload.json(), list)
