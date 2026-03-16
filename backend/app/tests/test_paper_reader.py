from datetime import datetime, timezone

import fitz

from app.db.session import SessionLocal
from app.models.db.paper_record import PaperRecord


def _now():
    return datetime.now(timezone.utc)


def _create_paper(db, *, title: str, pdf_local_path: str = '') -> PaperRecord:
    row = PaperRecord(
        source='arxiv',
        source_id=title.lower().replace(' ', '-'),
        title_en=title,
        abstract_en=f'{title} abstract',
        authors='A',
        year=2025,
        venue='arXiv',
        pdf_url='https://example.com/paper.pdf',
        pdf_local_path=pdf_local_path,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _write_pdf(path, text: str):
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    document.save(path)
    document.close()


def test_paper_reader_without_downloaded_pdf_returns_empty_reader(client):
    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader Without PDF')
        paper_id = paper.id

    response = client.get(f'/papers/{paper_id}/reader')
    assert response.status_code == 200
    payload = response.json()
    assert payload['paper']['id'] == paper_id
    assert payload['pdf_downloaded'] is False
    assert payload['reader_ready'] is False
    assert payload['paragraphs'] == []


def test_paper_reader_returns_paragraphs_for_downloaded_pdf(client, tmp_path):
    pdf_path = tmp_path / 'reader-paper.pdf'
    _write_pdf(pdf_path, 'First paragraph for reading.\n\nSecond paragraph for translation.')

    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader With PDF', pdf_local_path=str(pdf_path))
        paper_id = paper.id

    response = client.get(f'/papers/{paper_id}/reader')
    assert response.status_code == 200
    payload = response.json()
    assert payload['paper']['id'] == paper_id
    assert payload['pdf_downloaded'] is True
    assert payload['reader_ready'] is True
    assert len(payload['paragraphs']) >= 1
    assert payload['paragraphs'][0]['paragraph_id'] == 1
    assert 'paragraph' in payload['paragraphs'][0]['text'].lower()


def test_create_paper_annotation_and_reader_returns_annotations(client, tmp_path):
    pdf_path = tmp_path / 'reader-annotation-paper.pdf'
    _write_pdf(pdf_path, 'Baseline setup paragraph.\n\nAblation details paragraph.')

    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader Annotation Paper', pdf_local_path=str(pdf_path))
        paper_id = paper.id

    create_response = client.post(
        f'/papers/{paper_id}/annotations',
        json={
            'paragraph_id': 1,
            'selected_text': 'Baseline setup paragraph.',
            'note_text': '这里解释了实验的基础设定，后续复现时要先对齐。',
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created['paper_id'] == paper_id
    assert created['paragraph_id'] == 1
    assert created['selected_text'] == 'Baseline setup paragraph.'

    reader_response = client.get(f'/papers/{paper_id}/reader')
    assert reader_response.status_code == 200
    payload = reader_response.json()
    assert len(payload['annotations']) == 1
    assert payload['annotations'][0]['note_text'] == '这里解释了实验的基础设定，后续复现时要先对齐。'
    assert payload['annotations'][0]['paragraph_id'] == 1


def test_create_paper_annotation_requires_note_text(client, tmp_path):
    pdf_path = tmp_path / 'reader-annotation-empty-note.pdf'
    _write_pdf(pdf_path, 'Only paragraph.')

    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader Annotation Empty Note', pdf_local_path=str(pdf_path))
        paper_id = paper.id

    response = client.post(
        f'/papers/{paper_id}/annotations',
        json={
            'paragraph_id': 1,
            'selected_text': 'Only paragraph.',
            'note_text': '   ',
        },
    )
    assert response.status_code == 400
