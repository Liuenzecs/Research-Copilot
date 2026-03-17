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


def _make_png_bytes(width: int = 180, height: int = 120, color: int = 0xCC8844) -> bytes:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height), False)
    pix.clear_with(color)
    return pix.tobytes('png')


def _write_pdf_with_image(path):
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_textbox(
        fitz.Rect(48, 70, 250, 220),
        'Baseline setup paragraph. This paragraph should stay near the inserted figure for reader anchoring.',
        fontsize=12,
    )
    page.insert_textbox(
        fitz.Rect(320, 72, 540, 220),
        'Right column context paragraph. The structured reader should not put this before the left column block.',
        fontsize=12,
    )
    page.insert_image(fitz.Rect(60, 250, 260, 390), stream=_make_png_bytes())
    page.insert_textbox(
        fitz.Rect(60, 400, 290, 460),
        'Figure 1. Sample architecture overview used for testing figure extraction.',
        fontsize=12,
    )
    document.save(path)
    document.close()


def _write_two_column_pdf(path):
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_textbox(fitz.Rect(40, 60, 250, 180), 'Left column first block.', fontsize=12)
    page.insert_textbox(fitz.Rect(40, 220, 250, 360), 'Left column second block.', fontsize=12)
    page.insert_textbox(fitz.Rect(320, 70, 540, 190), 'Right column first block.', fontsize=12)
    page.insert_textbox(fitz.Rect(320, 230, 540, 360), 'Right column second block.', fontsize=12)
    document.save(path)
    document.close()


def _write_pdf_with_repeated_header_and_formula(path):
    document = fitz.open()
    for page_index in range(2):
        page = document.new_page(width=595, height=842)
        page.insert_textbox(fitz.Rect(60, 30, 540, 65), 'Research Copilot Header', fontsize=11)
        page.insert_textbox(
            fitz.Rect(60, 90, 540, 150),
            f'{page_index + 1} Introduction',
            fontsize=18,
            fontname='helv',
        )
        page.insert_textbox(
            fitz.Rect(60, 170, 520, 330),
            'This paragraph explains the method in plain language and should remain readable in auxiliary text mode.',
            fontsize=12,
        )
        page.insert_textbox(
            fitz.Rect(80, 360, 520, 420),
            'softmax(QK^T / sqrt(d_k)) V = Attention(Q, K, V)',
            fontsize=12,
        )
        page.insert_textbox(fitz.Rect(290, 790, 320, 820), str(page_index + 1), fontsize=11)
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
    assert payload['pages'] == []
    assert payload['figures'] == []


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
    assert payload['paragraphs'][0]['page_no'] == 1
    assert payload['paragraphs'][0]['kind'] in {'body', 'heading'}
    assert len(payload['paragraphs'][0]['bbox']) == 4
    assert 'paragraph' in payload['paragraphs'][0]['text'].lower()


def test_paper_reader_two_column_order_is_more_natural(client, tmp_path):
    pdf_path = tmp_path / 'reader-two-column.pdf'
    _write_two_column_pdf(pdf_path)

    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader Two Column', pdf_local_path=str(pdf_path))
        paper_id = paper.id

    response = client.get(f'/papers/{paper_id}/reader')
    assert response.status_code == 200
    payload = response.json()
    texts = [item['text'] for item in payload['paragraphs']]
    assert any('Left column first block' in text for text in texts[:2])
    assert any('Left column second block' in text for text in texts[:3])
    right_index = next(index for index, text in enumerate(texts) if 'Right column first block' in text)
    left_second_index = next(index for index, text in enumerate(texts) if 'Left column second block' in text)
    assert left_second_index < right_index


def test_paper_reader_returns_pages_and_figures_with_controlled_urls(client, tmp_path):
    pdf_path = tmp_path / 'reader-image.pdf'
    _write_pdf_with_image(pdf_path)

    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader Image Paper', pdf_local_path=str(pdf_path))
        paper_id = paper.id

    response = client.get(f'/papers/{paper_id}/reader')
    assert response.status_code == 200
    payload = response.json()
    assert payload['reader_ready'] is True
    assert len(payload['pages']) == 1
    assert payload['pages'][0]['page_no'] == 1
    assert payload['pages'][0]['image_url'] == f'/papers/{paper_id}/reader/pages/1'
    assert payload['pages'][0]['thumbnail_url'] == f'/papers/{paper_id}/reader/pages/1/thumbnail'

    assert len(payload['figures']) >= 1
    figure = payload['figures'][0]
    assert figure['page_no'] == 1
    assert figure['image_url'] == f"/papers/{paper_id}/reader/figures/{figure['figure_id']}"
    assert 'Figure 1' in figure['caption_text']
    assert figure['match_mode'] == 'caption'
    assert figure['anchor_paragraph_id'] is not None

    page_image_response = client.get(payload['pages'][0]['image_url'])
    assert page_image_response.status_code == 200
    assert page_image_response.headers['content-type'].startswith('image/png')

    thumbnail_response = client.get(payload['pages'][0]['thumbnail_url'])
    assert thumbnail_response.status_code == 200
    assert thumbnail_response.headers['content-type'].startswith('image/png')

    figure_image_response = client.get(figure['image_url'])
    assert figure_image_response.status_code == 200
    assert figure_image_response.headers['content-type'].startswith('image/png')


def test_paper_reader_classifies_heading_formula_and_drops_repeated_header(client, tmp_path):
    pdf_path = tmp_path / 'reader-formula.pdf'
    _write_pdf_with_repeated_header_and_formula(pdf_path)

    with SessionLocal() as db:
        paper = _create_paper(db, title='Reader Formula Paper', pdf_local_path=str(pdf_path))
        paper_id = paper.id

    response = client.get(f'/papers/{paper_id}/reader')
    assert response.status_code == 200
    payload = response.json()

    texts = [item['text'] for item in payload['paragraphs']]
    assert all('Research Copilot Header' not in text for text in texts)

    heading = next(item for item in payload['paragraphs'] if 'Introduction' in item['text'])
    assert heading['kind'] == 'heading'

    formula = next(item for item in payload['paragraphs'] if 'Attention(Q, K, V)' in item['text'])
    assert formula['kind'] == 'formula'

    body = next(item for item in payload['paragraphs'] if 'plain language' in item['text'])
    assert body['kind'] == 'body'


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
