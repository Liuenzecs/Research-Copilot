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
