from __future__ import annotations

import json
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db.paper_record import PaperRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.reproduction_record import ReproductionRecord, ReproductionStepRecord
from app.models.db.task_record import TaskRecord
from app.models.db.weekly_report_record import WeeklyReportRecord


class ReportingService:
    @staticmethod
    def default_week_range(today: date | None = None) -> tuple[date, date]:
        today = today or date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        return week_start, week_end

    def get_context(self, db: Session, week_start: date, week_end: date) -> dict:
        report_worthy_reflections = (
            db.execute(
                select(ReflectionRecord)
                .where(ReflectionRecord.event_date >= week_start)
                .where(ReflectionRecord.event_date <= week_end)
                .where(ReflectionRecord.is_report_worthy.is_(True))
                .order_by(ReflectionRecord.event_date.desc())
            )
            .scalars()
            .all()
        )

        recent_papers = (
            db.execute(select(PaperRecord).order_by(PaperRecord.created_at.desc()).limit(20))
            .scalars()
            .all()
        )

        reproductions = (
            db.execute(select(ReproductionRecord).order_by(ReproductionRecord.updated_at.desc()).limit(20))
            .scalars()
            .all()
        )

        blocker_steps = (
            db.execute(
                select(ReproductionStepRecord)
                .where(ReproductionStepRecord.step_status == 'blocked')
                .order_by(ReproductionStepRecord.updated_at.desc())
            )
            .scalars()
            .all()
        )

        next_actions: list[str] = []
        for step in blocker_steps[:5]:
            if step.blocker_reason:
                next_actions.append(f'处理阻塞步骤 {step.step_no}: {step.blocker_reason[:120]}')
            else:
                next_actions.append(f'处理阻塞步骤 {step.step_no}')

        for reflection in report_worthy_reflections[:5]:
            if reflection.report_summary:
                next_actions.append(f'整理汇报要点: {reflection.report_summary[:120]}')

        return {
            'week_start': week_start,
            'week_end': week_end,
            'report_worthy_reflections': [
                {
                    'id': x.id,
                    'event_date': x.event_date.isoformat(),
                    'reflection_type': x.reflection_type,
                    'report_summary': x.report_summary,
                    'related_paper_id': x.related_paper_id,
                    'related_reproduction_id': x.related_reproduction_id,
                    'related_task_id': x.related_task_id,
                }
                for x in report_worthy_reflections
            ],
            'recent_papers': [
                {
                    'id': p.id,
                    'title_en': p.title_en,
                    'source': p.source,
                    'year': p.year,
                    'created_at': p.created_at.isoformat(),
                }
                for p in recent_papers
            ],
            'reproduction_progress': [
                {
                    'id': r.id,
                    'paper_id': r.paper_id,
                    'repo_id': r.repo_id,
                    'status': r.status,
                    'progress_percent': r.progress_percent,
                    'progress_summary': r.progress_summary,
                    'updated_at': r.updated_at.isoformat(),
                }
                for r in reproductions
            ],
            'blockers': [
                {
                    'reproduction_id': s.reproduction_id,
                    'step_id': s.id,
                    'step_no': s.step_no,
                    'command': s.command,
                    'blocker_reason': s.blocker_reason,
                    'blocked_at': s.blocked_at.isoformat() if s.blocked_at else None,
                }
                for s in blocker_steps
            ],
            'next_actions': next_actions[:10],
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
            lines.append('- 本周暂无新增论文记录。')
        else:
            for item in papers[:8]:
                lines.append(f"- [{item['id']}] {item['title_en']} ({item['source']})")

        lines.append('')
        lines.append('## 复现进展与阻塞')
        repro = context['reproduction_progress']
        blockers = context['blockers']
        if not repro:
            lines.append('- 本周暂无复现进展记录。')
        else:
            for item in repro[:8]:
                percent = f"{item['progress_percent']}%" if item['progress_percent'] is not None else '未设置'
                lines.append(f"- 复现#{item['id']} 状态={item['status']} 进度={percent}")

        if blockers:
            lines.append('')
            lines.append('### 主要阻塞')
            for item in blockers[:8]:
                lines.append(f"- 复现#{item['reproduction_id']} 步骤{item['step_no']}: {item['blocker_reason'] or '待补充'}")

        lines.append('')
        lines.append('## 下周行动')
        actions = context['next_actions']
        if not actions:
            lines.append('- 补充本周复盘与下一步计划。')
        else:
            for action in actions:
                lines.append(f'- {action}')

        return '\n'.join(lines)

    def create_draft(self, db: Session, week_start: date, week_end: date, title: str, generated_task_id: int | None = None) -> WeeklyReportRecord:
        context = self.get_context(db, week_start, week_end)
        markdown = self.build_markdown(context, title)

        row = WeeklyReportRecord(
            week_start=week_start,
            week_end=week_end,
            title=title,
            draft_markdown=markdown,
            status='draft',
            source_snapshot_json=json.dumps(context, ensure_ascii=False, default=str),
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

    def list_drafts(self, db: Session, status: str | None = None) -> list[WeeklyReportRecord]:
        stmt = select(WeeklyReportRecord)
        if status:
            stmt = stmt.where(WeeklyReportRecord.status == status)
        stmt = stmt.order_by(WeeklyReportRecord.week_start.desc(), WeeklyReportRecord.created_at.desc())
        return db.execute(stmt).scalars().all()


reporting_service = ReportingService()
