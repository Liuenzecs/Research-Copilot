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

    assert payload[paper_memory_id]['jump_target'] == {'kind': 'paper', 'path': f'/papers/{paper_id}'}
    assert payload[paper_memory_id]['retrieval_mode'] == 'fallback'
    assert payload[paper_memory_id]['match_reason'] == '当前语义召回不足，按记忆重要度与最近性回退展示'
    assert payload[paper_memory_id]['context_hint'] == '关联论文，建议回到论文工作区继续阅读'
    assert payload[summary_memory_id]['jump_target'] == {'kind': 'paper', 'path': f'/papers/{paper_id}?summary_id={summary_id}'}
    assert payload[summary_memory_id]['context_hint'] == '关联摘要，建议回到所属论文工作区继续阅读'
    assert payload[repro_memory_id]['jump_target'] == {'kind': 'reproduction', 'path': f'/reproduction?reproduction_id={reproduction_id}'}
    assert payload[repro_memory_id]['context_hint'] == '关联复现记录，建议回到复现工作区继续推进'
    assert payload[reflection_memory_id]['jump_target'] == {'kind': 'reflection', 'path': f'/reflections?reflection_id={reflection_id}'}
    assert payload[reflection_memory_id]['context_hint'] == '关联心得，建议回到心得页面继续整理'
    assert payload[repo_memory_id]['jump_target'] == {'kind': 'reproduction', 'path': f'/reproduction?paper_id={paper_id}'}
    assert payload[repo_memory_id]['context_hint'] == '关联代码仓对应的复现上下文，建议回到复现工作区继续推进'
    assert payload[idea_memory_id]['jump_target'] == {'kind': 'brainstorm', 'path': '/brainstorm'}
    assert payload[idea_memory_id]['context_hint'] == '关联灵感记录，建议回到灵感页面继续扩展'
    assert payload[repo_without_paper_memory_id]['jump_target'] is None
    assert payload[repo_without_paper_memory_id]['context_hint'] is None
    assert payload[unknown_memory_id]['jump_target'] is None
    assert payload[unknown_memory_id]['context_hint'] is None


def test_memory_query_returns_semantic_explanations(client, monkeypatch):
    with SessionLocal() as db:
        paper = _create_paper(db, source_id='semantic-memory-paper', title='Semantic Memory Paper')
        paper_memory = _create_memory(db, memory_type='PaperMemory', ref_table='papers', ref_id=paper.id, text_content='semantic paper memory')
        db.commit()
        paper_memory_id = paper_memory.id

    monkeypatch.setattr(
        'app.services.memory.retriever.semantic_query',
        lambda query, top_k=10: [{'id': f'{paper_memory_id}:0', 'distance': 0.02}],
    )

    response = client.post('/memory/query', json={'query': 'semantic memory', 'memory_types': [], 'layers': [], 'top_k': 5})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]['id'] == paper_memory_id
    assert payload[0]['retrieval_mode'] == 'semantic'
    assert payload[0]['match_reason'] == '与当前检索问题语义接近'
    assert payload[0]['context_hint'] == '关联论文，建议回到论文工作区继续阅读'
    assert payload[0]['jump_target']['kind'] == 'paper'


def test_memory_query_keeps_existing_shape_when_no_records(client, monkeypatch):
    monkeypatch.setattr('app.services.memory.retriever.semantic_query', lambda query, top_k=10: [])

    payload = client.post('/memory/query', json={'query': 'anything', 'memory_types': [], 'layers': [], 'top_k': 5})
    assert payload.status_code == 200
    assert isinstance(payload.json(), list)


def test_memory_recent_list_returns_persisted_rows(client):
    with SessionLocal() as db:
        paper = _create_paper(db, source_id='recent-memory-paper', title='Recent Memory Paper')
        first = _create_memory(db, memory_type='PaperMemory', ref_table='papers', ref_id=paper.id, text_content='first recent memory')
        second = _create_memory(db, memory_type='PaperMemory', ref_table='papers', ref_id=paper.id, text_content='second recent memory')
        db.commit()
        first_id = first.id
        second_id = second.id

    response = client.get('/memory?limit=10')
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 2
    ids = [item['id'] for item in payload]
    assert ids.index(second_id) < ids.index(first_id)
    assert payload[0]['match_reason']
    assert payload[0]['retrieval_mode'] == 'fallback'
