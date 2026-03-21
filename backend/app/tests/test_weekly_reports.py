import json
from datetime import date, datetime, time, timedelta, timezone

from app.db.session import SessionLocal
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord, ReproductionStepRecord
from app.models.db.summary_record import SummaryRecord


def _week_range() -> tuple[date, date]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _dt(day: date, hour: int = 12) -> datetime:
    return datetime.combine(day, time(hour=hour), tzinfo=timezone.utc)


def _create_paper(db, *, source_id: str, title: str, created_at: datetime) -> PaperRecord:
    paper = PaperRecord(
        source='arxiv',
        source_id=source_id,
        title_en=title,
        abstract_en=f'{title} abstract',
        authors='A',
        year=2025,
        venue='arXiv',
        pdf_url=f'https://example.com/{source_id}.pdf',
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(paper)
    db.flush()
    return paper


def _create_summary(db, *, paper: PaperRecord, created_at: datetime, summary_type: str = 'quick') -> SummaryRecord:
    summary = SummaryRecord(
        paper_id=paper.id,
        summary_type=summary_type,
        content_en=f'{paper.title_en} summary',
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(summary)
    db.flush()
    return summary


def _create_reflection(
    db,
    *,
    paper: PaperRecord,
    event_date: date,
    created_at: datetime,
    report_summary: str,
    is_report_worthy: bool = True,
) -> ReflectionRecord:
    reflection = ReflectionRecord(
        reflection_type='paper',
        related_paper_id=paper.id,
        template_type='paper',
        stage='deep_read',
        lifecycle_status='draft',
        content_structured_json=json.dumps({'summary': report_summary}, ensure_ascii=False),
        content_markdown=report_summary,
        is_report_worthy=is_report_worthy,
        report_summary=report_summary,
        event_date=event_date,
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(reflection)
    db.flush()
    return reflection


def _create_state(db, *, paper: PaperRecord, updated_at: datetime, read_at: date | None = None) -> PaperResearchStateRecord:
    state = PaperResearchStateRecord(
        paper_id=paper.id,
        reading_status='deep_read',
        interest_level=4,
        repro_interest='high',
        is_core_paper=False,
        read_at=read_at,
        created_at=updated_at,
        updated_at=updated_at,
    )
    db.add(state)
    db.flush()
    return state


def _create_repo(db, *, paper: PaperRecord, updated_at: datetime) -> RepoRecord:
    repo = RepoRecord(
        paper_id=paper.id,
        platform='github',
        repo_url=f'https://github.com/test/{paper.source_id}',
        owner='test',
        name=paper.source_id,
        stars=10,
        forks=2,
        readme_summary='repo summary',
        created_at=updated_at,
        updated_at=updated_at,
    )
    db.add(repo)
    db.flush()
    return repo


def _create_reproduction(
    db,
    *,
    paper: PaperRecord,
    updated_at: datetime,
    progress_summary: str,
    repo: RepoRecord | None = None,
) -> ReproductionRecord:
    reproduction = ReproductionRecord(
        paper_id=paper.id,
        repo_id=repo.id if repo else None,
        plan_markdown=f'# Plan for {paper.title_en}',
        progress_summary=progress_summary,
        progress_percent=50,
        status='in_progress',
        created_at=updated_at,
        updated_at=updated_at,
    )
    db.add(reproduction)
    db.flush()
    return reproduction


def _create_step(
    db,
    *,
    reproduction: ReproductionRecord,
    updated_at: datetime,
    step_status: str,
    blocker_reason: str = '',
    blocked_at: datetime | None = None,
) -> ReproductionStepRecord:
    step = ReproductionStepRecord(
        reproduction_id=reproduction.id,
        step_no=1,
        command='python run.py',
        purpose='Run baseline',
        risk_level='medium',
        step_status=step_status,
        progress_note='latest note',
        blocker_reason=blocker_reason,
        blocked_at=blocked_at,
        requires_manual_confirm=True,
        expected_output='baseline result',
        created_at=updated_at,
        updated_at=updated_at,
    )
    db.add(step)
    db.flush()
    return step


def test_weekly_report_context_strictly_filters_each_section(client):
    week_start, week_end = _week_range()
    outside_dt = _dt(week_start - timedelta(days=7), 9)
    summary_dt = _dt(week_start + timedelta(days=1), 10)
    reflection_dt = _dt(week_start + timedelta(days=2), 11)
    reproduction_dt = _dt(week_start + timedelta(days=3), 12)
    blocked_dt = _dt(week_start + timedelta(days=4), 13)

    with SessionLocal() as db:
        current_paper = _create_paper(db, source_id='weekly-current', title='Current Paper', created_at=outside_dt)
        old_paper = _create_paper(db, source_id='weekly-old', title='Old Paper', created_at=outside_dt)

        current_repo = _create_repo(db, paper=current_paper, updated_at=reproduction_dt)

        _create_summary(db, paper=current_paper, created_at=summary_dt)
        _create_summary(db, paper=old_paper, created_at=outside_dt)

        current_reflection = _create_reflection(
            db,
            paper=current_paper,
            event_date=week_start + timedelta(days=2),
            created_at=reflection_dt,
            report_summary='本周值得汇报的论文心得',
        )
        _create_reflection(
            db,
            paper=old_paper,
            event_date=week_start - timedelta(days=1),
            created_at=outside_dt,
            report_summary='上周心得，不应进入本周上下文',
        )

        current_reproduction = _create_reproduction(
            db,
            paper=current_paper,
            repo=current_repo,
            updated_at=reproduction_dt,
            progress_summary='本周推进了复现计划',
        )
        old_reproduction = _create_reproduction(
            db,
            paper=old_paper,
            updated_at=outside_dt,
            progress_summary='旧复现进展',
        )

        current_step = _create_step(
            db,
            reproduction=current_reproduction,
            updated_at=blocked_dt,
            step_status='blocked',
            blocker_reason='当前周阻塞',
            blocked_at=blocked_dt,
        )
        _create_step(
            db,
            reproduction=old_reproduction,
            updated_at=outside_dt,
            step_status='blocked',
            blocker_reason='旧阻塞',
            blocked_at=outside_dt,
        )
        db.commit()
        current_paper_id = current_paper.id
        current_reflection_id = current_reflection.id
        current_reproduction_id = current_reproduction.id
        current_step_id = current_step.id

    response = client.get(f'/reports/weekly/context?week_start={week_start}&week_end={week_end}')
    assert response.status_code == 200
    payload = response.json()

    assert [item['id'] for item in payload['report_worthy_reflections']] == [current_reflection_id]
    assert payload['report_worthy_reflections'][0]['related_paper_title'] == 'Current Paper'

    assert [item['paper_id'] for item in payload['recent_papers']] == [current_paper_id]
    assert payload['recent_papers'][0]['activity_type'] == 'reproduction'

    assert [item['reproduction_id'] for item in payload['reproduction_progress']] == [current_reproduction_id]
    assert payload['reproduction_progress'][0]['paper_title'] == 'Current Paper'
    assert payload['reproduction_progress'][0]['repo_label'] == 'test/weekly-current'

    assert [item['step_id'] for item in payload['blockers']] == [current_step_id]
    assert payload['blockers'][0]['blocker_reason'] == '当前周阻塞'
    assert payload['blockers'][0]['paper_title'] == 'Current Paper'

    assert any('当前周阻塞' in item for item in payload['next_actions'])
    assert any('本周值得汇报的论文心得' in item for item in payload['next_actions'])
    assert all('上周' not in item for item in payload['next_actions'])


def test_weekly_report_recent_papers_aggregates_dedupes_and_orders_latest_activity(client):
    week_start, week_end = _week_range()
    old_created_at = _dt(week_start - timedelta(days=14), 9)

    added_dt = _dt(week_start, 9)
    summary_dt = _dt(week_start + timedelta(days=1), 10)
    reflection_dt = _dt(week_start + timedelta(days=2), 11)
    state_dt = _dt(week_start + timedelta(days=3), 12)
    state_read_at = week_start + timedelta(days=3)
    reproduction_dt = _dt(week_start + timedelta(days=4), 13)
    multi_summary_dt = _dt(week_start + timedelta(days=1), 8)
    multi_reproduction_dt = _dt(week_start + timedelta(days=5), 14)

    with SessionLocal() as db:
        added_paper = _create_paper(db, source_id='paper-added', title='Added Paper', created_at=added_dt)
        summary_paper = _create_paper(db, source_id='paper-summary', title='Summary Paper', created_at=old_created_at)
        reflection_paper = _create_paper(db, source_id='paper-reflection', title='Reflection Paper', created_at=old_created_at)
        state_paper = _create_paper(db, source_id='paper-state', title='State Paper', created_at=old_created_at)
        reproduction_paper = _create_paper(db, source_id='paper-reproduction', title='Reproduction Paper', created_at=old_created_at)
        multi_paper = _create_paper(db, source_id='paper-multi', title='Multi Activity Paper', created_at=old_created_at)

        _create_summary(db, paper=summary_paper, created_at=summary_dt)
        _create_reflection(
            db,
            paper=reflection_paper,
            event_date=week_start + timedelta(days=2),
            created_at=reflection_dt,
            report_summary='本周记录论文心得',
        )
        _create_state(db, paper=state_paper, updated_at=state_dt, read_at=state_read_at)
        _create_reproduction(
            db,
            paper=reproduction_paper,
            updated_at=reproduction_dt,
            progress_summary='本周推进了复现',
        )
        _create_summary(db, paper=multi_paper, created_at=multi_summary_dt)
        _create_reproduction(
            db,
            paper=multi_paper,
            updated_at=multi_reproduction_dt,
            progress_summary='同一篇论文后来又推进了复现',
        )
        db.commit()
        added_paper_id = added_paper.id
        summary_paper_id = summary_paper.id
        reflection_paper_id = reflection_paper.id
        state_paper_id = state_paper.id
        reproduction_paper_id = reproduction_paper.id
        multi_paper_id = multi_paper.id

    response = client.get(f'/reports/weekly/context?week_start={week_start}&week_end={week_end}')
    assert response.status_code == 200
    recent_papers = response.json()['recent_papers']

    ordered_ids = [item['paper_id'] for item in recent_papers]
    assert ordered_ids == [
        multi_paper_id,
        reproduction_paper_id,
        state_paper_id,
        reflection_paper_id,
        summary_paper_id,
        added_paper_id,
    ]
    assert len(ordered_ids) == len(set(ordered_ids)) == 6

    activity_by_paper = {item['paper_id']: item['activity_type'] for item in recent_papers}
    assert activity_by_paper[added_paper_id] == 'added'
    assert activity_by_paper[summary_paper_id] == 'summary'
    assert activity_by_paper[reflection_paper_id] == 'reflection'
    assert activity_by_paper[state_paper_id] == 'read'
    assert activity_by_paper[reproduction_paper_id] == 'reproduction'
    assert activity_by_paper[multi_paper_id] == 'reproduction'


def test_weekly_report_draft_snapshot_stays_stable_after_context_changes(client):
    week_start, week_end = _week_range()
    reflection_one_dt = _dt(week_start + timedelta(days=1), 10)
    reflection_two_dt = _dt(week_start + timedelta(days=2), 11)

    with SessionLocal() as db:
        paper = _create_paper(db, source_id='paper-draft', title='Draft Paper', created_at=reflection_one_dt)
        _create_reflection(
            db,
            paper=paper,
            event_date=week_start + timedelta(days=1),
            created_at=reflection_one_dt,
            report_summary='第一条周报心得',
        )
        db.commit()

    draft_response = client.post(
        '/reports/weekly/drafts',
        json={'week_start': week_start.isoformat(), 'week_end': week_end.isoformat(), 'title': '本周汇报'},
    )
    assert draft_response.status_code == 200
    draft_payload = draft_response.json()
    draft_id = draft_payload['id']

    assert len(draft_payload['source_snapshot_json']['report_worthy_reflections']) == 1
    assert draft_payload['source_snapshot_json']['report_worthy_reflections'][0]['report_summary'] == '第一条周报心得'
    assert '第一条周报心得' in draft_payload['draft_markdown']

    with SessionLocal() as db:
        draft_paper = db.get(PaperRecord, draft_payload['source_snapshot_json']['recent_papers'][0]['paper_id'])
        _create_reflection(
            db,
            paper=draft_paper,
            event_date=week_start + timedelta(days=2),
            created_at=reflection_two_dt,
            report_summary='第二条周报心得',
        )
        db.commit()

    live_context = client.get(f'/reports/weekly/context?week_start={week_start}&week_end={week_end}')
    assert live_context.status_code == 200
    assert len(live_context.json()['report_worthy_reflections']) == 2

    saved_draft = client.get(f'/reports/weekly/drafts/{draft_id}')
    assert saved_draft.status_code == 200
    assert len(saved_draft.json()['source_snapshot_json']['report_worthy_reflections']) == 1
    assert saved_draft.json()['source_snapshot_json']['report_worthy_reflections'][0]['report_summary'] == '第一条周报心得'
    assert '第二条周报心得' not in saved_draft.json()['draft_markdown']

    patch_response = client.patch(f'/reports/weekly/drafts/{draft_id}', json={'status': 'finalized'})
    assert patch_response.status_code == 200
    assert patch_response.json()['status'] == 'finalized'

    history = client.get('/reports/weekly/drafts')
    assert history.status_code == 200
    assert any(item['id'] == draft_id for item in history.json())
