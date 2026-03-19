from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.repo_record import RepoRecord
from app.models.db.reproduction_record import ReproductionRecord, ReproductionStepRecord
from app.models.db.research_project_record import ResearchProjectPaperRecord
from app.models.db.summary_record import SummaryRecord
from app.models.db.weekly_report_record import WeeklyReportRecord
from app.models.schemas.report import WeeklyReportContextResponse
from app.services.project.activity import project_activity_service


def _week_bounds(week_start: date, week_end: date) -> tuple[datetime, datetime]:
    start = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
    end = datetime.combine(week_end, time.max, tzinfo=timezone.utc)
    return start, end


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso_datetime(value: datetime) -> str:
    return _as_utc(value).isoformat()


class ReportingService:
    @staticmethod
    def default_week_range(today: date | None = None) -> tuple[date, date]:
        today = today or date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        return week_start, week_end

    def _project_paper_ids(self, db: Session, project_id: int | None) -> set[int]:
        if not project_id:
            return set()
        return {
            int(paper_id)
            for (paper_id,) in db.execute(
                select(ResearchProjectPaperRecord.paper_id).where(ResearchProjectPaperRecord.project_id == project_id)
            ).all()
        }

    def _load_paper_map(self, db: Session, paper_ids: set[int]) -> dict[int, PaperRecord]:
        if not paper_ids:
            return {}
        rows = db.execute(select(PaperRecord).where(PaperRecord.id.in_(paper_ids))).scalars().all()
        return {row.id: row for row in rows}

    def _load_repo_map(self, db: Session, repo_ids: set[int]) -> dict[int, RepoRecord]:
        if not repo_ids:
            return {}
        rows = db.execute(select(RepoRecord).where(RepoRecord.id.in_(repo_ids))).scalars().all()
        return {row.id: row for row in rows}

    def _snapshot_payload(self, context: dict) -> dict:
        return WeeklyReportContextResponse(**context).model_dump(mode='json')

    def _paper_activity_items(self, db: Session, week_start: date, week_end: date, project_paper_ids: set[int] | None = None) -> list[dict]:
        start_dt, end_dt = _week_bounds(week_start, week_end)
        activity_candidates: list[dict] = []
        allowed_paper_ids = project_paper_ids or set()

        created_papers = (
            db.execute(
                select(PaperRecord)
                .where(PaperRecord.created_at >= start_dt)
                .where(PaperRecord.created_at <= end_dt)
            )
            .scalars()
            .all()
        )
        for paper in created_papers:
            if allowed_paper_ids and paper.id not in allowed_paper_ids:
                continue
            activity_candidates.append(
                {
                    'paper_id': paper.id,
                    'last_activity_at': _as_utc(paper.created_at),
                    'activity_type': 'added',
                    'activity_summary': '本周新加入系统。',
                }
            )

        summaries = (
            db.execute(
                select(SummaryRecord)
                .where(SummaryRecord.created_at >= start_dt)
                .where(SummaryRecord.created_at <= end_dt)
                .order_by(SummaryRecord.created_at.desc())
            )
            .scalars()
            .all()
        )
        for summary in summaries:
            if allowed_paper_ids and summary.paper_id not in allowed_paper_ids:
                continue
            activity_candidates.append(
                {
                    'paper_id': summary.paper_id,
                    'last_activity_at': _as_utc(summary.created_at),
                    'activity_type': 'summary',
                    'activity_summary': f"本周生成了 {summary.summary_type} 摘要。",
                }
            )

        reflections = (
            db.execute(
                select(ReflectionRecord)
                .where(ReflectionRecord.event_date >= week_start)
                .where(ReflectionRecord.event_date <= week_end)
                .where(ReflectionRecord.related_paper_id.is_not(None))
                .order_by(ReflectionRecord.event_date.desc(), ReflectionRecord.created_at.desc())
            )
            .scalars()
            .all()
        )
        for reflection in reflections:
            if allowed_paper_ids and reflection.related_paper_id not in allowed_paper_ids:
                continue
            activity_candidates.append(
                {
                    'paper_id': reflection.related_paper_id,
                    'last_activity_at': datetime.combine(reflection.event_date, time.max, tzinfo=timezone.utc),
                    'activity_type': 'reflection',
                    'activity_summary': reflection.report_summary or '本周新增了论文心得。',
                }
            )

        state_updates = (
            db.execute(
                select(PaperResearchStateRecord)
                .where(PaperResearchStateRecord.updated_at >= start_dt)
                .where(PaperResearchStateRecord.updated_at <= end_dt)
                .order_by(PaperResearchStateRecord.updated_at.desc())
            )
            .scalars()
            .all()
        )
        for state in state_updates:
            if allowed_paper_ids and state.paper_id not in allowed_paper_ids:
                continue
            activity_candidates.append(
                {
                    'paper_id': state.paper_id,
                    'last_activity_at': _as_utc(state.updated_at),
                    'activity_type': 'state_update',
                    'activity_summary': f"本周更新了阅读状态：{state.reading_status}。",
                }
            )

        reproductions = (
            db.execute(
                select(ReproductionRecord)
                .where(ReproductionRecord.updated_at >= start_dt)
                .where(ReproductionRecord.updated_at <= end_dt)
                .where(ReproductionRecord.paper_id.is_not(None))
                .order_by(ReproductionRecord.updated_at.desc())
            )
            .scalars()
            .all()
        )
        for reproduction in reproductions:
            if allowed_paper_ids and reproduction.paper_id not in allowed_paper_ids:
                continue
            activity_candidates.append(
                {
                    'paper_id': reproduction.paper_id,
                    'last_activity_at': _as_utc(reproduction.updated_at),
                    'activity_type': 'reproduction',
                    'activity_summary': reproduction.progress_summary or f"本周推进了复现，状态为 {reproduction.status}。",
                }
            )

        latest_by_paper: dict[int, dict] = {}
        for item in activity_candidates:
            paper_id = item['paper_id']
            if paper_id is None:
                continue
            existing = latest_by_paper.get(paper_id)
            if existing is None or item['last_activity_at'] > existing['last_activity_at']:
                latest_by_paper[paper_id] = item

        paper_map = self._load_paper_map(db, set(latest_by_paper.keys()))
        result = []
        for paper_id, item in latest_by_paper.items():
            paper = paper_map.get(paper_id)
            if paper is None:
                continue
            result.append(
                {
                    'paper_id': paper.id,
                    'title_en': paper.title_en,
                    'source': paper.source,
                    'year': paper.year,
                    'last_activity_at': _iso_datetime(item['last_activity_at']),
                    'activity_type': item['activity_type'],
                    'activity_summary': item['activity_summary'],
                }
            )

        result.sort(key=lambda item: item['last_activity_at'], reverse=True)
        return result[:20]

    def get_context(self, db: Session, week_start: date, week_end: date, project_id: int | None = None) -> dict:
        start_dt, end_dt = _week_bounds(week_start, week_end)
        project_paper_ids = self._project_paper_ids(db, project_id)

        reflection_stmt = (
            select(ReflectionRecord)
            .where(ReflectionRecord.event_date >= week_start)
            .where(ReflectionRecord.event_date <= week_end)
            .where(ReflectionRecord.is_report_worthy.is_(True))
            .order_by(ReflectionRecord.event_date.desc(), ReflectionRecord.created_at.desc())
        )
        if project_paper_ids:
            reflection_stmt = reflection_stmt.where(
                or_(
                    ReflectionRecord.related_paper_id.in_(project_paper_ids),
                    ReflectionRecord.related_reproduction_id.in_(
                        select(ReproductionRecord.id).where(ReproductionRecord.paper_id.in_(project_paper_ids))
                    ),
                )
            )
        report_worthy_reflections = db.execute(reflection_stmt).scalars().all()

        reflection_paper_ids = {row.related_paper_id for row in report_worthy_reflections if row.related_paper_id is not None}
        recent_papers = self._paper_activity_items(db, week_start, week_end, project_paper_ids if project_paper_ids else None)

        reproduction_stmt = (
            select(ReproductionRecord)
            .where(ReproductionRecord.updated_at >= start_dt)
            .where(ReproductionRecord.updated_at <= end_dt)
            .order_by(ReproductionRecord.updated_at.desc())
        )
        if project_paper_ids:
            reproduction_stmt = reproduction_stmt.where(ReproductionRecord.paper_id.in_(project_paper_ids))
        reproductions = db.execute(reproduction_stmt).scalars().all()
        reproduction_paper_ids = {row.paper_id for row in reproductions if row.paper_id is not None}
        reproduction_repo_ids = {row.repo_id for row in reproductions if row.repo_id is not None}

        blocker_stmt = (
            select(ReproductionStepRecord)
            .where(ReproductionStepRecord.step_status == 'blocked')
            .where(
                or_(
                    and_(ReproductionStepRecord.blocked_at.is_not(None), ReproductionStepRecord.blocked_at >= start_dt, ReproductionStepRecord.blocked_at <= end_dt),
                    and_(ReproductionStepRecord.updated_at >= start_dt, ReproductionStepRecord.updated_at <= end_dt),
                )
            )
            .order_by(ReproductionStepRecord.blocked_at.desc(), ReproductionStepRecord.updated_at.desc(), ReproductionStepRecord.id.desc())
        )
        if project_paper_ids:
            blocker_stmt = blocker_stmt.where(
                ReproductionStepRecord.reproduction_id.in_(
                    select(ReproductionRecord.id).where(ReproductionRecord.paper_id.in_(project_paper_ids))
                )
            )
        blocker_steps = db.execute(blocker_stmt).scalars().all()

        blocker_reproduction_ids = {row.reproduction_id for row in blocker_steps}
        blocker_reproduction_map: dict[int, ReproductionRecord] = {}
        if blocker_reproduction_ids:
            blocker_reproduction_rows = (
                db.execute(select(ReproductionRecord).where(ReproductionRecord.id.in_(blocker_reproduction_ids)))
                .scalars()
                .all()
            )
            blocker_reproduction_map = {row.id: row for row in blocker_reproduction_rows}
            reproduction_paper_ids.update({row.paper_id for row in blocker_reproduction_rows if row.paper_id is not None})
            reproduction_repo_ids.update({row.repo_id for row in blocker_reproduction_rows if row.repo_id is not None})

        paper_map = self._load_paper_map(db, reflection_paper_ids | reproduction_paper_ids)
        repo_map = self._load_repo_map(db, reproduction_repo_ids)

        next_actions: list[str] = []
        for step in blocker_steps[:5]:
            if step.blocker_reason:
                next_actions.append(f'处理阻塞步骤 {step.step_no}: {step.blocker_reason[:120]}')
            else:
                next_actions.append(f'处理阻塞步骤 {step.step_no}')

        for reflection in report_worthy_reflections[:5]:
            if reflection.report_summary:
                next_actions.append(f'整理汇报要点: {reflection.report_summary[:120]}')

        project_activity = [
            item.model_dump(mode='json')
            for item in project_activity_service.list_preview(db, project_id, limit=8)
        ] if project_id else []

        return {
            'week_start': week_start,
            'week_end': week_end,
            'project_id': project_id,
            'report_worthy_reflections': [
                {
                    'id': row.id,
                    'event_date': row.event_date.isoformat(),
                    'reflection_type': row.reflection_type,
                    'report_summary': row.report_summary,
                    'related_paper_id': row.related_paper_id,
                    'related_paper_title': paper_map[row.related_paper_id].title_en if row.related_paper_id in paper_map else None,
                    'related_reproduction_id': row.related_reproduction_id,
                    'related_task_id': row.related_task_id,
                }
                for row in report_worthy_reflections
            ],
            'recent_papers': recent_papers,
            'reproduction_progress': [
                {
                    'reproduction_id': row.id,
                    'paper_id': row.paper_id,
                    'paper_title': paper_map[row.paper_id].title_en if row.paper_id in paper_map else None,
                    'repo_id': row.repo_id,
                    'repo_label': (
                        f"{repo_map[row.repo_id].owner}/{repo_map[row.repo_id].name}"
                        if row.repo_id in repo_map and (repo_map[row.repo_id].owner or repo_map[row.repo_id].name)
                        else 'paper-only'
                    ),
                    'status': row.status,
                    'progress_percent': row.progress_percent,
                    'progress_summary': row.progress_summary,
                    'updated_at': _iso_datetime(row.updated_at),
                }
                for row in reproductions
            ],
            'blockers': [
                {
                    'reproduction_id': step.reproduction_id,
                    'paper_id': blocker_reproduction_map[step.reproduction_id].paper_id if step.reproduction_id in blocker_reproduction_map else None,
                    'paper_title': (
                        paper_map[blocker_reproduction_map[step.reproduction_id].paper_id].title_en
                        if step.reproduction_id in blocker_reproduction_map
                        and blocker_reproduction_map[step.reproduction_id].paper_id in paper_map
                        else None
                    ),
                    'step_id': step.id,
                    'step_no': step.step_no,
                    'command': step.command,
                    'blocker_reason': step.blocker_reason,
                    'blocked_at': _iso_datetime(step.blocked_at) if step.blocked_at else None,
                }
                for step in blocker_steps
            ],
            'next_actions': next_actions[:10],
            'project_activity': project_activity,
        }

    def build_markdown(self, context: dict, title: str) -> str:
        lines = [
            f"# {title}",
            '',
            f"周期: {context['week_start']} 至 {context['week_end']}",
            '',
            '## 值得汇报的研究心得',
        ]

        reflections = context['report_worthy_reflections']
        if not reflections:
            lines.append('- 本周暂无标记为可汇报的心得。')
        else:
            for item in reflections[:10]:
                lines.append(f"- ({item['event_date']}) {item['report_summary'] or '无摘要'}")

        lines.append('')
        lines.append('## 近期论文进展')
        papers = context['recent_papers']
        if not papers:
            lines.append('- 本周暂无论文活动记录。')
        else:
            for item in papers[:8]:
                lines.append(f"- [{item['paper_id']}] {item['title_en']} · {item['activity_summary']}")

        lines.append('')
        lines.append('## 复现进展与阻塞')
        reproduction_progress = context['reproduction_progress']
        blockers = context['blockers']
        if not reproduction_progress:
            lines.append('- 本周暂无复现进展记录。')
        else:
            for item in reproduction_progress[:8]:
                percent = f"{item['progress_percent']}%" if item['progress_percent'] is not None else '未设置'
                repo_label = item['repo_label'] or 'paper-only'
                lines.append(
                    f"- 复现#{item['reproduction_id']} · {item['paper_title'] or '未关联论文'} · {repo_label} · 状态={item['status']} · 进度={percent} · {item['progress_summary'] or '无摘要'}"
                )

        if blockers:
            lines.append('')
            lines.append('### 主要阻塞')
            for item in blockers[:8]:
                lines.append(
                    f"- 复现#{item['reproduction_id']} 步骤{item['step_no']} · {item['paper_title'] or '未关联论文'}: {item['blocker_reason'] or '待补充'}"
                )

        if context.get('project_activity'):
            lines.append('')
            lines.append('## 项目轨迹摘要')
            for item in context['project_activity'][:8]:
                lines.append(f"- {item['title']}: {item['message']}")

        lines.append('')
        lines.append('## 下周行动')
        actions = context['next_actions']
        if not actions:
            lines.append('- 补充本周复盘与下一步计划。')
        else:
            for action in actions:
                lines.append(f'- {action}')

        return '\n'.join(lines)

    def create_draft(
        self,
        db: Session,
        week_start: date,
        week_end: date,
        title: str,
        generated_task_id: int | None = None,
        project_id: int | None = None,
    ) -> WeeklyReportRecord:
        context = self.get_context(db, week_start, week_end, project_id=project_id)
        markdown = self.build_markdown(context, title)
        snapshot_payload = self._snapshot_payload(context)

        row = WeeklyReportRecord(
            project_id=project_id,
            week_start=week_start,
            week_end=week_end,
            title=title,
            draft_markdown=markdown,
            status='draft',
            source_snapshot_json=json.dumps(snapshot_payload, ensure_ascii=False),
            generated_task_id=generated_task_id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def update_draft(
        self,
        db: Session,
        row: WeeklyReportRecord,
        *,
        title: str | None = None,
        draft_markdown: str | None = None,
        status: str | None = None,
    ) -> WeeklyReportRecord:
        if title is not None:
            row.title = title
        if draft_markdown is not None:
            row.draft_markdown = draft_markdown
        if status is not None:
            row.status = status
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def list_drafts(self, db: Session, status: str | None = None, project_id: int | None = None) -> list[WeeklyReportRecord]:
        stmt = select(WeeklyReportRecord)
        if status:
            stmt = stmt.where(WeeklyReportRecord.status == status)
        if project_id is not None:
            stmt = stmt.where(WeeklyReportRecord.project_id == project_id)
        stmt = stmt.order_by(WeeklyReportRecord.week_start.desc(), WeeklyReportRecord.created_at.desc())
        return db.execute(stmt).scalars().all()


reporting_service = ReportingService()
