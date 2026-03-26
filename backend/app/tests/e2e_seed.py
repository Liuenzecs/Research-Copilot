from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import fitz

from app.core.config import get_settings
from app.db import init_db as _db_init  # noqa: F401
from app.db.session import SessionLocal
from app.models.db.memory_record import MemoryItemRecord
from app.models.db.paper_record import PaperRecord, PaperResearchStateRecord
from app.models.db.reflection_record import ReflectionRecord
from app.models.db.reproduction_record import ReproductionRecord, ReproductionStepRecord
from app.models.db.summary_record import SummaryRecord
from app.services.pdf.reader import paper_reader_service
from app.services.project.service import project_service


FIXTURE_DATE = date(2026, 3, 18)


def _fixture_items() -> list[dict]:
    fixture_path = Path(__file__).with_name('e2e') / 'search_fixtures.json'
    return json.loads(fixture_path.read_text(encoding='utf-8'))


def _paper_copy(source_id: str) -> list[str]:
    if source_id == 'e2e-retrieval-study':
        return [
            'Introduction',
            'We study retrieval-augmented evidence synthesis for literature review agents.',
            'The system aligns evidence cards with explicit source snippets and comparison workflows.',
            'Methods',
            'We compare retrieval prompting, chunk selection, and evidence ranking under the same project interface.',
            'Results',
            'Retrieval improves evidence coverage and makes downstream comparison tables easier to audit.',
        ]
    if source_id == 'e2e-long-context-benchmark':
        return [
            'Introduction',
            'This benchmark evaluates long context literature agents across evidence extraction and review drafting.',
            'It reports dataset settings, metrics, and limitations for notebook-style research workflows.',
            'Results',
            'Long context methods reduce manual context switching but still need strong evidence traceability.',
        ]
    return [
        'Introduction',
        'This control paper covers unrelated vision tasks and should remain outside project-scoped filters.',
        'Results',
        'It is useful only as a negative control for E2E filtering checks.',
    ]


def _write_pdf(path: Path, title: str, paragraphs: list[str]) -> None:
    _write_pdf_document(path, title, paragraphs, include_figure=False)


def _make_png_bytes(width: int = 220, height: int = 140, color: int = 0xCC8844) -> bytes:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height), False)
    pix.clear_with(color)
    return pix.tobytes('png')


def _write_pdf_document(path: Path, title: str, paragraphs: list[str], *, include_figure: bool) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 72
    page.insert_text((72, y), title, fontsize=18)
    y += 36
    first_page_paragraphs = paragraphs if not include_figure else paragraphs[:4]
    for paragraph in first_page_paragraphs:
        page.insert_textbox(
            fitz.Rect(72, y, 523, y + 64),
            paragraph,
            fontsize=12,
            lineheight=1.35,
        )
        y += 78

    if include_figure:
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), f'{title} · Figure-first page', fontsize=16)
        page.insert_image(fitz.Rect(72, 120, 300, 280), stream=_make_png_bytes())
        page.insert_textbox(
            fitz.Rect(72, 300, 360, 352),
            'Figure 1. E2E evidence board overview for figure-first reading.',
            fontsize=12,
            lineheight=1.25,
        )
        y = 390
        for paragraph in paragraphs[4:]:
            page.insert_textbox(
                fitz.Rect(72, y, 523, y + 64),
                paragraph,
                fontsize=12,
                lineheight=1.35,
            )
            y += 78

    doc.save(path)
    doc.close()


def seed() -> None:
    settings = get_settings()
    pdf_dir = Path(settings.data_dir) / 'papers' / 'e2e'
    pdf_dir.mkdir(parents=True, exist_ok=True)

    with SessionLocal() as db:
        papers: dict[str, PaperRecord] = {}
        summaries: dict[str, SummaryRecord] = {}

        for item in _fixture_items():
            source_id = str(item['source_id'])
            pdf_path = pdf_dir / f'{source_id}.pdf'
            _write_pdf_document(
                pdf_path,
                str(item['title_en']),
                _paper_copy(source_id),
                include_figure=source_id == 'e2e-retrieval-study',
            )

            paper = PaperRecord(
                source=str(item['source']),
                source_id=source_id,
                title_en=str(item['title_en']),
                abstract_en=str(item['abstract_en']),
                authors=str(item['authors']),
                year=int(item['year']) if item.get('year') is not None else None,
                venue=str(item['venue']),
                doi=str(item.get('doi') or ''),
                paper_url=str(item.get('paper_url') or ''),
                openalex_id=str(item.get('openalex_id') or ''),
                semantic_scholar_id=str(item.get('semantic_scholar_id') or ''),
                citation_count=int(item.get('citation_count') or 0),
                reference_count=int(item.get('reference_count') or 0),
                pdf_url=str(item['pdf_url']),
                pdf_local_path=str(pdf_path.resolve()),
                published_at=datetime(int(item['year']), 1, 1, tzinfo=timezone.utc) if item.get('year') else None,
            )
            db.add(paper)
            db.flush()

            db.add(
                PaperResearchStateRecord(
                    paper_id=paper.id,
                    reading_status='reading' if source_id != 'hidden-control-paper' else 'queued',
                    interest_level=5 if source_id != 'hidden-control-paper' else 2,
                    repro_interest='high' if source_id != 'hidden-control-paper' else 'low',
                    is_core_paper=source_id != 'hidden-control-paper',
                )
            )

            summary = SummaryRecord(
                paper_id=paper.id,
                summary_type='quick',
                content_en=(
                    f"{paper.title_en} summary. Dataset benchmark accuracy result. "
                    "Evidence cards, comparison tables, and review drafting remain the key workflow."
                ),
                problem_en=f'How does {paper.title_en} support research notebook evidence synthesis?',
                method_en='Notebook-first evidence extraction with reusable summaries',
                contributions_en=f'{paper.title_en} improves evidence traceability in project workspaces.',
                limitations_en='The method still depends on careful evidence curation and project scoping.',
                future_work_en='Add stronger evaluation of human editing effort and review quality.',
                provider='heuristic',
                model='local',
            )
            db.add(summary)
            db.flush()

            papers[source_id] = paper
            summaries[source_id] = summary

        db.commit()

        for paper in papers.values():
            paper_reader_service.get_reader_payload(paper.id, paper.pdf_local_path)

        project = project_service.create_project(
            db,
            title='E2E Context Project',
            research_question='How should a project workspace compare retrieval-based literature agents?',
            goal='Verify project-scoped reflections, reproduction, and memory views.',
            seed_query='long context evidence synthesis',
        )
        project_service.add_paper(db, project=project, paper_id=papers['e2e-retrieval-study'].id, selection_reason='Core seeded paper')
        project_service.add_paper(db, project=project, paper_id=papers['e2e-long-context-benchmark'].id, selection_reason='Comparison seeded paper')

        project_reflection = ReflectionRecord(
            reflection_type='paper',
            related_paper_id=papers['e2e-retrieval-study'].id,
            related_summary_id=summaries['e2e-retrieval-study'].id,
            template_type='paper',
            stage='reading',
            lifecycle_status='draft',
            content_structured_json=json.dumps({'insight': 'Project reflection insight for E2E context'}),
            content_markdown='Project reflection insight for E2E context',
            is_report_worthy=True,
            report_summary='Project reflection insight for E2E context',
            event_date=FIXTURE_DATE,
        )
        hidden_reflection = ReflectionRecord(
            reflection_type='paper',
            related_paper_id=papers['hidden-control-paper'].id,
            related_summary_id=summaries['hidden-control-paper'].id,
            template_type='paper',
            stage='reading',
            lifecycle_status='draft',
            content_structured_json=json.dumps({'insight': 'Hidden reflection outside project'}),
            content_markdown='Hidden reflection outside project',
            is_report_worthy=False,
            report_summary='Hidden reflection outside project',
            event_date=FIXTURE_DATE,
        )
        db.add_all([project_reflection, hidden_reflection])
        db.flush()

        project_reproduction = ReproductionRecord(
            paper_id=papers['e2e-retrieval-study'].id,
            repo_id=None,
            plan_markdown='1. Prepare notebook workspace\n2. Compare evidence extraction quality\n3. Record reproduction notes',
            progress_summary='Context project reproduction in progress',
            progress_percent=45,
            status='in_progress',
        )
        hidden_reproduction = ReproductionRecord(
            paper_id=papers['hidden-control-paper'].id,
            repo_id=None,
            plan_markdown='1. Run unrelated control baseline',
            progress_summary='Hidden reproduction outside project',
            progress_percent=15,
            status='planned',
        )
        db.add_all([project_reproduction, hidden_reproduction])
        db.flush()

        db.add(
            ReproductionStepRecord(
                reproduction_id=project_reproduction.id,
                step_no=1,
                command='open notebook',
                purpose='Inspect evidence extraction behavior',
                risk_level='low',
                step_status='in_progress',
                progress_note='Working through seeded notebook workflow.',
                blocker_reason='',
                requires_manual_confirm=False,
                expected_output='A reproducible evidence extraction notebook run.',
            )
        )

        db.add_all(
            [
                MemoryItemRecord(
                    memory_type='ReflectionMemory',
                    ref_table='reflections',
                    ref_id=project_reflection.id,
                    layer='structured',
                    text_content='Project memory anchor for E2E context',
                    importance=0.9,
                ),
                MemoryItemRecord(
                    memory_type='ReflectionMemory',
                    ref_table='reflections',
                    ref_id=hidden_reflection.id,
                    layer='structured',
                    text_content='Hidden memory outside project',
                    importance=0.2,
                ),
            ]
        )

        db.commit()
        print(f'Seeded E2E workspace data in {settings.data_dir}. Project id={project.id}')


if __name__ == '__main__':
    seed()
