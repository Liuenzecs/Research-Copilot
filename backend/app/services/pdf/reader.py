from __future__ import annotations

import json
import re
import shutil
import statistics
from pathlib import Path
from typing import Any

import fitz

from app.core.config import get_settings

CAPTION_PATTERN = re.compile(r'^\s*(figure|fig\.?)\s*\d+[\s:.\-]', re.IGNORECASE)
PAGE_IMAGE_SCALE = 2.15
PAGE_THUMBNAIL_SCALE = 0.34
MIN_FIGURE_WIDTH = 100
MIN_FIGURE_HEIGHT = 80
MIN_FIGURE_AREA = 18_000
FORMULA_HINT_PATTERN = re.compile(
    r'(=|≈|≃|≤|≥|±|∑|∫|√|→|←|↔|λ|μ|σ|α|β|γ|θ|π|\bsoftmax\b|\bargmax\b|\bargmin\b)',
    re.IGNORECASE,
)
HEADING_PREFIX_PATTERN = re.compile(r'^(\d+(\.\d+)*)\s+[A-Z]')


def _normalize_whitespace(text: str) -> str:
    text = (text or '').replace('\u00ad', '')
    text = re.sub(r'(\w)-\s+(\w)', r'\1\2', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _join_text(current: str, incoming: str) -> str:
    if not current:
        return incoming
    if not incoming:
        return current
    if current.endswith('-'):
        return f'{current[:-1]}{incoming}'
    return f'{current} {incoming}'.strip()


def _looks_like_page_number(text: str) -> bool:
    compact = re.sub(r'\s+', '', text)
    return bool(compact) and compact.isdigit() and len(compact) <= 4


def _bbox_union(first: list[float], second: list[float]) -> list[float]:
    return [
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[2], second[2]),
        max(first[3], second[3]),
    ]


class PaperReaderService:
    def resolve_pdf_path(self, pdf_local_path: str) -> Path:
        path = Path(pdf_local_path)
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        return path

    def get_reader_payload(self, paper_id: int, pdf_local_path: str) -> dict[str, Any]:
        if not pdf_local_path:
            return {
                'pdf_downloaded': False,
                'reader_ready': False,
                'paragraphs': [],
                'pages': [],
                'figures': [],
                'reader_notices': [],
                'text_notice': '当前尚未下载 PDF。请先下载论文后再进入原版页面阅读或辅助文本阅读。',
            }

        pdf_path = self.resolve_pdf_path(pdf_local_path)
        if not pdf_path.exists() or not pdf_path.is_file():
            return {
                'pdf_downloaded': True,
                'reader_ready': False,
                'paragraphs': [],
                'pages': [],
                'figures': [],
                'reader_notices': [],
                'text_notice': f'已记录 PDF 路径，但本地文件缺失：{pdf_path}',
            }

        manifest = self._ensure_manifest(paper_id, pdf_path)
        paragraphs = manifest.get('paragraphs', [])
        pages = [
            {
                'page_no': item['page_no'],
                'image_url': f"/papers/{paper_id}/reader/pages/{item['page_no']}",
                'thumbnail_url': f"/papers/{paper_id}/reader/pages/{item['page_no']}/thumbnail",
                'width': item['width'],
                'height': item['height'],
            }
            for item in manifest.get('pages', [])
        ]
        figures = [
            {
                'figure_id': item['figure_id'],
                'page_no': item['page_no'],
                'image_url': f"/papers/{paper_id}/reader/figures/{item['figure_id']}",
                'caption_text': item.get('caption_text', ''),
                'anchor_paragraph_id': item.get('anchor_paragraph_id'),
                'match_mode': item.get('match_mode', 'approximate'),
            }
            for item in manifest.get('figures', [])
        ]
        reader_notices = manifest.get('reader_notices', [])

        return {
            'pdf_downloaded': True,
            'reader_ready': bool(pages or paragraphs),
            'paragraphs': paragraphs,
            'pages': pages,
            'figures': figures,
            'reader_notices': reader_notices,
            'text_notice': manifest.get(
                'text_notice',
                '原版页面为主阅读视图；辅助文本用于搜索定位、选词翻译与批注，公式与版式请以原版页面为准。',
            ),
        }

    def get_page_preview_path(self, paper_id: int, pdf_local_path: str, page_no: int) -> Path | None:
        if page_no <= 0 or not pdf_local_path:
            return None
        pdf_path = self.resolve_pdf_path(pdf_local_path)
        if not pdf_path.exists() or not pdf_path.is_file():
            return None
        manifest = self._ensure_manifest(paper_id, pdf_path)
        page = next((item for item in manifest.get('pages', []) if item['page_no'] == page_no), None)
        if page is None:
            return None
        path = self._cache_root(paper_id) / page['file_name']
        return path if path.exists() else None

    def get_page_thumbnail_path(self, paper_id: int, pdf_local_path: str, page_no: int) -> Path | None:
        if page_no <= 0 or not pdf_local_path:
            return None
        pdf_path = self.resolve_pdf_path(pdf_local_path)
        if not pdf_path.exists() or not pdf_path.is_file():
            return None
        manifest = self._ensure_manifest(paper_id, pdf_path)
        page = next((item for item in manifest.get('pages', []) if item['page_no'] == page_no), None)
        if page is None:
            return None
        path = self._cache_root(paper_id) / page['thumbnail_file_name']
        return path if path.exists() else None

    def get_figure_path(self, paper_id: int, pdf_local_path: str, figure_id: int) -> Path | None:
        if figure_id <= 0 or not pdf_local_path:
            return None
        pdf_path = self.resolve_pdf_path(pdf_local_path)
        if not pdf_path.exists() or not pdf_path.is_file():
            return None
        manifest = self._ensure_manifest(paper_id, pdf_path)
        figure = next((item for item in manifest.get('figures', []) if item['figure_id'] == figure_id), None)
        if figure is None:
            return None
        path = self._cache_root(paper_id) / figure['file_name']
        return path if path.exists() else None

    def _cache_root(self, paper_id: int) -> Path:
        settings = get_settings()
        root = Path(settings.data_dir) / 'cache' / 'paper_reader' / str(paper_id)
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _manifest_path(self, paper_id: int) -> Path:
        return self._cache_root(paper_id) / 'reader_manifest.json'

    def _ensure_manifest(self, paper_id: int, pdf_path: Path) -> dict[str, Any]:
        manifest_path = self._manifest_path(paper_id)
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                if self._is_manifest_fresh(manifest, pdf_path):
                    return manifest
            except Exception:
                pass
        return self._build_manifest(paper_id, pdf_path)

    def _is_manifest_fresh(self, manifest: dict[str, Any], pdf_path: Path) -> bool:
        return (
            manifest.get('source_pdf_path') == str(pdf_path.resolve())
            and abs(float(manifest.get('source_pdf_mtime', 0.0)) - pdf_path.stat().st_mtime) < 0.001
        )

    def _build_manifest(self, paper_id: int, pdf_path: Path) -> dict[str, Any]:
        cache_root = self._cache_root(paper_id)
        if cache_root.exists():
            for child in cache_root.iterdir():
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                elif child.name != 'reader_manifest.json':
                    child.unlink(missing_ok=True)

        pages_dir = cache_root / 'pages'
        thumbnails_dir = cache_root / 'thumbnails'
        figures_dir = cache_root / 'figures'
        pages_dir.mkdir(parents=True, exist_ok=True)
        thumbnails_dir.mkdir(parents=True, exist_ok=True)
        figures_dir.mkdir(parents=True, exist_ok=True)

        reader_notices: list[str] = []
        with fitz.open(pdf_path) as doc:
            structured_blocks_by_page, body_font_size = self._collect_structured_blocks(doc)
            paragraphs, paragraph_meta, caption_blocks_by_page = self._build_paragraphs(
                structured_blocks_by_page,
                body_font_size,
            )
            pages = self._build_page_previews(doc, pages_dir, thumbnails_dir, reader_notices)
            figures = self._build_figures(doc, figures_dir, caption_blocks_by_page, paragraph_meta, reader_notices)

            if not paragraphs:
                paragraphs = self._build_fallback_paragraphs(doc)
                if paragraphs:
                    reader_notices.append('结构化辅助文本整理不完整，已回退到较粗粒度的文本模式。')

        text_notice = self._build_text_notice(paragraphs, pages, figures, reader_notices)
        manifest = {
            'source_pdf_path': str(pdf_path.resolve()),
            'source_pdf_mtime': pdf_path.stat().st_mtime,
            'paragraphs': paragraphs,
            'pages': pages,
            'figures': figures,
            'reader_notices': reader_notices,
            'text_notice': text_notice,
        }
        self._manifest_path(paper_id).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        return manifest

    def _collect_structured_blocks(
        self,
        doc: fitz.Document,
    ) -> tuple[dict[int, list[dict[str, Any]]], float]:
        blocks_by_page: dict[int, list[dict[str, Any]]] = {}
        repeated_edge_candidates: dict[str, int] = {}
        raw_pages: list[tuple[int, float, list[dict[str, Any]]]] = []
        font_sizes: list[float] = []

        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            page_width = float(page.rect.width)
            page_height = float(page.rect.height)
            page_dict = page.get_text('dict', sort=False)
            page_blocks: list[dict[str, Any]] = []

            for block_index, block in enumerate(page_dict.get('blocks', [])):
                if int(block.get('type', 0)) != 0:
                    continue

                line_texts: list[str] = []
                span_sizes: list[float] = []
                span_fonts: list[str] = []
                math_hint_count = 0
                alpha_count = 0
                digit_count = 0

                for line in block.get('lines', []):
                    spans = line.get('spans', [])
                    raw_line = ''.join(str(span.get('text', '')) for span in spans)
                    normalized_line = _normalize_whitespace(raw_line)
                    if not normalized_line:
                        continue
                    line_texts.append(normalized_line)
                    for span in spans:
                        text = str(span.get('text', '') or '')
                        size = float(span.get('size', 0.0) or 0.0)
                        if size > 0:
                            span_sizes.append(size)
                        font = str(span.get('font', '') or '').strip().lower()
                        if font:
                            span_fonts.append(font)
                        math_hint_count += len(FORMULA_HINT_PATTERN.findall(text))
                        alpha_count += sum(1 for char in text if char.isalpha())
                        digit_count += sum(1 for char in text if char.isdigit())

                if not line_texts:
                    continue

                text = _normalize_whitespace(' '.join(line_texts))
                if not text:
                    continue

                avg_font_size = statistics.mean(span_sizes) if span_sizes else 0.0
                max_font_size = max(span_sizes) if span_sizes else 0.0
                font_sizes.extend(size for size in span_sizes if size >= 7.5)
                bbox = [float(value) for value in block.get('bbox', (0.0, 0.0, 0.0, 0.0))]
                column_bucket = self._column_bucket(bbox, page_width)
                record = {
                    'block_id': f'{page_no}-{block_index}',
                    'page_no': page_no,
                    'bbox': bbox,
                    'text': text,
                    'line_texts': line_texts,
                    'avg_font_size': avg_font_size,
                    'max_font_size': max_font_size,
                    'font_names': sorted(set(span_fonts)),
                    'line_count': len(line_texts),
                    'page_width': page_width,
                    'page_height': page_height,
                    'column_bucket': column_bucket,
                    'math_hint_count': math_hint_count,
                    'alpha_count': alpha_count,
                    'digit_count': digit_count,
                }
                page_blocks.append(record)

                if len(text) <= 120 and (bbox[1] <= page_height * 0.08 or bbox[3] >= page_height * 0.92):
                    repeated_edge_candidates[text] = repeated_edge_candidates.get(text, 0) + 1

            raw_pages.append((page_no, page_width, page_blocks))

        repeated_edges = {text for text, count in repeated_edge_candidates.items() if count >= 2}
        body_font_size = statistics.median(font_sizes) if font_sizes else 12.0

        for page_no, page_width, page_blocks in raw_pages:
            kept_blocks = [block for block in page_blocks if not self._should_drop_edge_block(block, repeated_edges)]
            ordered = self._order_blocks(kept_blocks, page_width)
            blocks_by_page[page_no] = [
                {
                    **block,
                    'kind': self._classify_block(block, body_font_size),
                }
                for block in ordered
            ]
        return blocks_by_page, body_font_size

    def _should_drop_edge_block(self, block: dict[str, Any], repeated_edges: set[str]) -> bool:
        text = block['text']
        y0, y1 = block['bbox'][1], block['bbox'][3]
        page_height = block['page_height']
        near_edge = y0 <= page_height * 0.08 or y1 >= page_height * 0.92
        if not near_edge:
            return False
        if _looks_like_page_number(text):
            return True
        return text in repeated_edges

    def _column_bucket(self, bbox: list[float], page_width: float) -> str:
        x0, _y0, x1, _y1 = bbox
        width = x1 - x0
        center_x = (x0 + x1) / 2
        if width >= page_width * 0.72:
            return 'full'
        return 'left' if center_x < page_width / 2 else 'right'

    def _order_blocks(self, blocks: list[dict[str, Any]], page_width: float) -> list[dict[str, Any]]:
        if not blocks:
            return []

        full_width: list[dict[str, Any]] = []
        left_column: list[dict[str, Any]] = []
        right_column: list[dict[str, Any]] = []
        for block in blocks:
            bucket = block['column_bucket']
            if bucket == 'full':
                full_width.append(block)
            elif bucket == 'left':
                left_column.append(block)
            else:
                right_column.append(block)

        if len(left_column) >= 2 and len(right_column) >= 2:
            narrow_blocks = left_column + right_column
            first_narrow_top = min(block['bbox'][1] for block in narrow_blocks)
            last_narrow_bottom = max(block['bbox'][3] for block in narrow_blocks)

            top_full = [block for block in full_width if block['bbox'][3] <= first_narrow_top + 18]
            bottom_full = [block for block in full_width if block['bbox'][1] >= last_narrow_bottom - 18]
            middle_full = [block for block in full_width if block not in top_full and block not in bottom_full]

            return (
                sorted(top_full, key=lambda item: (item['bbox'][1], item['bbox'][0]))
                + sorted(left_column, key=lambda item: (item['bbox'][1], item['bbox'][0]))
                + sorted(middle_full, key=lambda item: (item['bbox'][1], item['bbox'][0]))
                + sorted(right_column, key=lambda item: (item['bbox'][1], item['bbox'][0]))
                + sorted(bottom_full, key=lambda item: (item['bbox'][1], item['bbox'][0]))
            )

        return sorted(blocks, key=lambda item: (item['bbox'][1], item['bbox'][0]))

    def _classify_block(self, block: dict[str, Any], body_font_size: float) -> str:
        text = block['text']
        if CAPTION_PATTERN.match(text):
            return 'caption'
        if self._looks_like_formula_block(block):
            return 'formula'
        if self._looks_like_heading_block(block, body_font_size):
            return 'heading'
        return 'body'

    def _looks_like_formula_block(self, block: dict[str, Any]) -> bool:
        text = block['text']
        if len(text) <= 6:
            return False

        symbol_hits = len(FORMULA_HINT_PATTERN.findall(text))
        special_char_hits = sum(
            1
            for char in text
            if char in '=+-*/^_<>[]{}()|~∑∫√≈≤≥±×·∥∈∂'
        )
        alpha_count = max(block.get('alpha_count', 0), 1)
        digit_count = block.get('digit_count', 0)
        hint_count = symbol_hits + special_char_hits + block.get('math_hint_count', 0) + digit_count

        if hint_count >= 10 and hint_count / max(len(text), 1) >= 0.12:
            return True
        if re.search(r'\b(eq\.?|theorem|lemma)\b', text, re.IGNORECASE):
            return True
        if '=' in text and alpha_count <= 80 and len(text.split()) <= 18:
            return True
        return False

    def _looks_like_heading_block(self, block: dict[str, Any], body_font_size: float) -> bool:
        text = block['text']
        if len(text) > 160:
            return False
        if CAPTION_PATTERN.match(text) or text.endswith(('.', ';', ':', '?', '!')):
            return False

        words = text.split()
        if len(words) > 18:
            return False

        avg_font_size = block.get('avg_font_size', 0.0) or body_font_size
        max_font_size = block.get('max_font_size', 0.0) or avg_font_size
        font_names = block.get('font_names', [])
        is_boldish = any('bold' in name or 'black' in name or 'medium' in name for name in font_names)
        starts_like_heading = bool(HEADING_PREFIX_PATTERN.match(text)) or text.isupper()

        if max_font_size >= body_font_size * 1.2 and block.get('line_count', 1) <= 4:
            return True
        if is_boldish and avg_font_size >= body_font_size * 1.08 and len(words) <= 14:
            return True
        return starts_like_heading and avg_font_size >= body_font_size * 1.02

    def _build_paragraphs(
        self,
        structured_blocks_by_page: dict[int, list[dict[str, Any]]],
        body_font_size: float,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[int, list[dict[str, Any]]]]:
        paragraphs: list[dict[str, Any]] = []
        paragraph_meta: list[dict[str, Any]] = []
        caption_blocks_by_page: dict[int, list[dict[str, Any]]] = {}
        paragraph_id = 1

        def append_paragraph(
            *,
            page_no: int,
            text: str,
            kind: str,
            bbox: list[float],
            track_for_anchor: bool,
        ) -> None:
            nonlocal paragraph_id
            paragraphs.append(
                {
                    'paragraph_id': paragraph_id,
                    'text': text,
                    'page_no': page_no,
                    'kind': kind,
                    'bbox': [round(value, 2) for value in bbox],
                }
            )
            if track_for_anchor:
                paragraph_meta.append(
                    {
                        'paragraph_id': paragraph_id,
                        'page_no': page_no,
                        'bbox': bbox,
                    }
                )
            paragraph_id += 1

        for page_no, blocks in structured_blocks_by_page.items():
            pending: dict[str, Any] | None = None
            for block in blocks:
                kind = block['kind']
                if kind == 'caption':
                    caption_blocks_by_page.setdefault(page_no, []).append(
                        {'block_id': block['block_id'], 'bbox': block['bbox'], 'text': block['text']}
                    )

                if kind != 'body':
                    if pending is not None:
                        append_paragraph(
                            page_no=page_no,
                            text=pending['text'],
                            kind='body',
                            bbox=pending['bbox'],
                            track_for_anchor=True,
                        )
                        pending = None
                    append_paragraph(
                        page_no=page_no,
                        text=block['text'],
                        kind=kind,
                        bbox=block['bbox'],
                        track_for_anchor=kind in {'body', 'heading'},
                    )
                    continue

                if pending is not None and self._should_merge_body_blocks(pending, block, body_font_size):
                    pending['text'] = _join_text(pending['text'], block['text'])
                    pending['bbox'] = _bbox_union(pending['bbox'], block['bbox'])
                    pending['avg_font_size'] = (pending['avg_font_size'] + block['avg_font_size']) / 2
                    continue

                if pending is not None:
                    append_paragraph(
                        page_no=page_no,
                        text=pending['text'],
                        kind='body',
                        bbox=pending['bbox'],
                        track_for_anchor=True,
                    )

                pending = {
                    'text': block['text'],
                    'bbox': block['bbox'],
                    'avg_font_size': block['avg_font_size'],
                    'column_bucket': block['column_bucket'],
                }

            if pending is not None:
                append_paragraph(
                    page_no=page_no,
                    text=pending['text'],
                    kind='body',
                    bbox=pending['bbox'],
                    track_for_anchor=True,
                )

        return paragraphs, paragraph_meta, caption_blocks_by_page

    def _should_merge_body_blocks(
        self,
        current: dict[str, Any],
        incoming: dict[str, Any],
        body_font_size: float,
    ) -> bool:
        if current['column_bucket'] != incoming['column_bucket']:
            return False

        current_bbox = current['bbox']
        incoming_bbox = incoming['bbox']
        vertical_gap = incoming_bbox[1] - current_bbox[3]
        if vertical_gap > max(28.0, body_font_size * 1.9):
            return False

        aligned = abs(current_bbox[0] - incoming_bbox[0]) <= 28
        if not aligned:
            return False

        size_gap = abs(current['avg_font_size'] - incoming.get('avg_font_size', current['avg_font_size']))
        if size_gap > max(2.4, body_font_size * 0.22):
            return False

        current_text = current['text']
        if len(current_text) >= 48 and re.search(r'[.!?:"”)]$', current_text):
            return False
        return True

    def _build_fallback_paragraphs(self, doc: fitz.Document) -> list[dict[str, Any]]:
        paragraphs: list[dict[str, Any]] = []
        paragraph_id = 1
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            blocks = page.get_text('blocks', sort=True)
            for block in blocks:
                if len(block) < 5:
                    continue
                x0, y0, x1, y1, text, *_rest = block
                normalized = _normalize_whitespace(text or '')
                if not normalized:
                    continue
                paragraphs.append(
                    {
                        'paragraph_id': paragraph_id,
                        'text': normalized,
                        'page_no': page_no,
                        'kind': 'body',
                        'bbox': [float(x0), float(y0), float(x1), float(y1)],
                    }
                )
                paragraph_id += 1
        return paragraphs

    def _build_page_previews(
        self,
        doc: fitz.Document,
        pages_dir: Path,
        thumbnails_dir: Path,
        reader_notices: list[str],
    ) -> list[dict[str, Any]]:
        pages: list[dict[str, Any]] = []
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            try:
                page_pix = page.get_pixmap(matrix=fitz.Matrix(PAGE_IMAGE_SCALE, PAGE_IMAGE_SCALE), alpha=False)
                page_file_name = f'pages/page_{page_no}.png'
                page_path = pages_dir / f'page_{page_no}.png'
                page_pix.save(page_path)

                thumb_pix = page.get_pixmap(matrix=fitz.Matrix(PAGE_THUMBNAIL_SCALE, PAGE_THUMBNAIL_SCALE), alpha=False)
                thumbnail_file_name = f'thumbnails/page_{page_no}.png'
                thumbnail_path = thumbnails_dir / f'page_{page_no}.png'
                thumb_pix.save(thumbnail_path)

                pages.append(
                    {
                        'page_no': page_no,
                        'file_name': page_file_name,
                        'thumbnail_file_name': thumbnail_file_name,
                        'width': page_pix.width,
                        'height': page_pix.height,
                    }
                )
            except Exception as exc:
                reader_notices.append(f'第 {page_no} 页预览生成失败：{exc}')
        return pages

    def _build_figures(
        self,
        doc: fitz.Document,
        figures_dir: Path,
        caption_blocks_by_page: dict[int, list[dict[str, Any]]],
        paragraph_meta: list[dict[str, Any]],
        reader_notices: list[str],
    ) -> list[dict[str, Any]]:
        figures: list[dict[str, Any]] = []
        paragraph_meta_by_page: dict[int, list[dict[str, Any]]] = {}
        for item in paragraph_meta:
            paragraph_meta_by_page.setdefault(item['page_no'], []).append(item)

        figure_id = 1
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            seen_xrefs: set[int] = set()
            for image_index, image_info in enumerate(page.get_images(full=True), start=1):
                xref = int(image_info[0])
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                try:
                    rects = page.get_image_rects(xref)
                except Exception:
                    rects = []
                if not rects:
                    continue

                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.width < MIN_FIGURE_WIDTH or pix.height < MIN_FIGURE_HEIGHT or pix.width * pix.height < MIN_FIGURE_AREA:
                        continue
                    if pix.alpha or pix.n > 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    file_name = f'figures/figure_{figure_id}.png'
                    path = figures_dir / f'figure_{figure_id}.png'
                    pix.save(path)
                except Exception as exc:
                    reader_notices.append(f'第 {page_no} 页第 {image_index} 张图片提取失败：{exc}')
                    continue

                rect = rects[0]
                caption_block = self._find_caption_block(rect, caption_blocks_by_page.get(page_no, []))
                anchor_paragraph_id = self._find_anchor_paragraph_id(
                    rect,
                    paragraph_meta_by_page.get(page_no, []),
                    caption_block['bbox'] if caption_block else None,
                )
                figures.append(
                    {
                        'figure_id': figure_id,
                        'page_no': page_no,
                        'file_name': file_name,
                        'caption_text': caption_block['text'] if caption_block else '',
                        'anchor_paragraph_id': anchor_paragraph_id,
                        'match_mode': 'caption' if caption_block else 'approximate',
                    }
                )
                figure_id += 1
        return figures

    def _find_caption_block(self, image_rect: fitz.Rect, caption_blocks: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not caption_blocks:
            return None
        best: dict[str, Any] | None = None
        best_distance: float | None = None
        for block in caption_blocks:
            x0, y0, x1, y1 = block['bbox']
            overlap = max(0.0, min(image_rect.x1, x1) - max(image_rect.x0, x0))
            overlap_ratio = overlap / max(1.0, min(image_rect.width, x1 - x0))
            below_distance = y0 - image_rect.y1
            above_distance = image_rect.y0 - y1
            valid = (
                (0 <= below_distance <= 170 and overlap_ratio >= 0.2)
                or (0 <= above_distance <= 90 and overlap_ratio >= 0.2)
            )
            if not valid:
                continue
            distance = abs(below_distance) if below_distance >= 0 else abs(above_distance)
            if best is None or (best_distance is not None and distance < best_distance):
                best = block
                best_distance = distance
        return best

    def _find_anchor_paragraph_id(
        self,
        image_rect: fitz.Rect,
        paragraph_meta: list[dict[str, Any]],
        caption_bbox: list[float] | None,
    ) -> int | None:
        if not paragraph_meta:
            return None

        if caption_bbox is not None:
            above_caption = [item for item in paragraph_meta if item['bbox'][3] <= caption_bbox[1] + 12]
            if above_caption:
                return min(above_caption, key=lambda item: abs(caption_bbox[1] - item['bbox'][3]))['paragraph_id']
            below_caption = [item for item in paragraph_meta if item['bbox'][1] >= caption_bbox[3] - 12]
            if below_caption:
                return min(below_caption, key=lambda item: abs(item['bbox'][1] - caption_bbox[3]))['paragraph_id']

        above_image = [item for item in paragraph_meta if item['bbox'][3] <= image_rect.y1 + 12]
        if above_image:
            return min(above_image, key=lambda item: abs(image_rect.y0 - item['bbox'][3]))['paragraph_id']

        image_center = (image_rect.y0 + image_rect.y1) / 2
        return min(
            paragraph_meta,
            key=lambda item: abs(((item['bbox'][1] + item['bbox'][3]) / 2) - image_center),
        )['paragraph_id']

    def _build_text_notice(
        self,
        paragraphs: list[dict[str, Any]],
        pages: list[dict[str, Any]],
        figures: list[dict[str, Any]],
        reader_notices: list[str],
    ) -> str:
        if not pages and not paragraphs:
            return 'PDF 已下载，但暂未整理出可稳定阅读的内容。你仍可继续使用摘要、心得和研究状态。'
        if pages and paragraphs and not reader_notices:
            return '原版页面已准备完成；辅助文本可用于搜索定位、选词翻译与批注，公式与版式请以原版页面为准。'
        if pages and paragraphs:
            return '原版页面可正常阅读；辅助文本或图像提取有部分降级，公式与复杂版式建议回到原版页面查看。'
        if pages:
            return '已生成原版页面阅读视图，但辅助文本整理不完整；建议优先使用原版页面阅读。'
        return '当前为降级辅助文本模式；排版、公式和复杂图文关系可能不完整，请优先参考原版页面。'


paper_reader_service = PaperReaderService()
