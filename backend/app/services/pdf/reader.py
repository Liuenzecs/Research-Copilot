from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import fitz

from app.core.config import get_settings

CAPTION_PATTERN = re.compile(r'^\s*(figure|fig\.?)\s*\d+[\s:.-]', re.IGNORECASE)
PAGE_PREVIEW_SCALE = 1.25
MIN_FIGURE_WIDTH = 100
MIN_FIGURE_HEIGHT = 80
MIN_FIGURE_AREA = 18_000


def _normalize_whitespace(text: str) -> str:
    text = text.replace('\u00ad', '')
    text = re.sub(r'(\w)-\s+(\w)', r'\1\2', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _split_long_text(text: str, limit: int = 900) -> list[str]:
    normalized = _normalize_whitespace(text)
    if not normalized:
        return []
    if len(normalized) <= limit:
        return [normalized]

    parts: list[str] = []
    current = ''
    for chunk in re.split(r'(?<=[.!?;:])\s+', normalized):
        candidate = f'{current} {chunk}'.strip() if current else chunk
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            parts.append(current)
        current = chunk

    if current:
        parts.append(current)
    return parts or [normalized]


def _looks_like_page_number(text: str) -> bool:
    compact = re.sub(r'\s+', '', text)
    return bool(compact) and compact.isdigit() and len(compact) <= 4


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
                'text_notice': '当前尚未下载 PDF，请先下载论文后再进入正文阅读。',
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
            'reader_ready': bool(paragraphs),
            'paragraphs': paragraphs,
            'pages': pages,
            'figures': figures,
            'reader_notices': reader_notices,
            'text_notice': manifest.get(
                'text_notice',
                '当前为结构化正文阅读视图；英文原文始终保持 canonical。',
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
        figures_dir = cache_root / 'figures'
        pages_dir.mkdir(parents=True, exist_ok=True)
        figures_dir.mkdir(parents=True, exist_ok=True)

        reader_notices: list[str] = []
        with fitz.open(pdf_path) as doc:
            text_blocks_by_page = self._collect_text_blocks(doc)
            paragraphs, paragraph_meta, caption_blocks_by_page = self._build_paragraphs(doc, text_blocks_by_page)
            pages = self._build_page_previews(doc, pages_dir, reader_notices)
            figures = self._build_figures(doc, figures_dir, caption_blocks_by_page, paragraph_meta, reader_notices)

            if not paragraphs:
                paragraphs = self._build_fallback_paragraphs(doc)
                if paragraphs:
                    reader_notices.append('结构化正文重建不完整，已回退到较粗粒度的文本整理模式。')

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

    def _collect_text_blocks(self, doc: fitz.Document) -> dict[int, list[dict[str, Any]]]:
        blocks_by_page: dict[int, list[dict[str, Any]]] = {}
        repeated_edge_candidates: dict[str, int] = {}

        raw_pages: list[tuple[int, float, list[dict[str, Any]]]] = []
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            page_height = float(page.rect.height)
            page_width = float(page.rect.width)
            page_blocks: list[dict[str, Any]] = []
            for block_index, block in enumerate(page.get_text('blocks', sort=False)):
                x0, y0, x1, y1, text, *_rest = block
                block_type = int(block[6]) if len(block) > 6 else 0
                if block_type != 0:
                    continue
                normalized = _normalize_whitespace(text or '')
                if not normalized:
                    continue
                record = {
                    'block_id': f'{page_no}-{block_index}',
                    'page_no': page_no,
                    'bbox': [float(x0), float(y0), float(x1), float(y1)],
                    'text': normalized,
                    'page_width': page_width,
                    'page_height': page_height,
                }
                page_blocks.append(record)
                if len(normalized) <= 120 and (y0 <= page_height * 0.08 or y1 >= page_height * 0.92):
                    repeated_edge_candidates[normalized] = repeated_edge_candidates.get(normalized, 0) + 1
            raw_pages.append((page_no, page_width, page_blocks))

        repeated_edges = {text for text, count in repeated_edge_candidates.items() if count >= 2}

        for page_no, page_width, page_blocks in raw_pages:
            kept = [block for block in page_blocks if not self._should_drop_edge_block(block, repeated_edges)]
            blocks_by_page[page_no] = self._order_blocks(kept, page_width)
        return blocks_by_page

    def _should_drop_edge_block(self, block: dict[str, Any], repeated_edges: set[str]) -> bool:
        text = block['text']
        y0, y1 = block['bbox'][1], block['bbox'][3]
        page_height = block['page_height']
        near_edge = y0 <= page_height * 0.08 or y1 >= page_height * 0.92
        if not near_edge:
            return False
        if _looks_like_page_number(text):
            return True
        if text in repeated_edges:
            return True
        return False

    def _order_blocks(self, blocks: list[dict[str, Any]], page_width: float) -> list[dict[str, Any]]:
        if not blocks:
            return []

        full_width: list[dict[str, Any]] = []
        left_column: list[dict[str, Any]] = []
        right_column: list[dict[str, Any]] = []
        for block in blocks:
            x0, y0, x1, _y1 = block['bbox']
            width = x1 - x0
            center_x = (x0 + x1) / 2
            if width >= page_width * 0.72:
                full_width.append(block)
            elif center_x < page_width / 2:
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

    def _build_paragraphs(
        self,
        doc: fitz.Document,
        text_blocks_by_page: dict[int, list[dict[str, Any]]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[int, list[dict[str, Any]]]]:
        paragraphs: list[dict[str, Any]] = []
        paragraph_meta: list[dict[str, Any]] = []
        paragraph_id = 1

        caption_block_ids = self._detect_caption_block_ids(text_blocks_by_page)
        caption_blocks_by_page: dict[int, list[dict[str, Any]]] = {}
        for page_index, _page in enumerate(doc):
            page_no = page_index + 1
            for block in text_blocks_by_page.get(page_no, []):
                if block['block_id'] in caption_block_ids:
                    caption_blocks_by_page.setdefault(page_no, []).append(
                        {'block_id': block['block_id'], 'bbox': block['bbox'], 'text': block['text']}
                    )
                    continue
                chunks = _split_long_text(block['text'])
                if not chunks:
                    continue
                for chunk in chunks:
                    paragraphs.append(
                        {
                            'paragraph_id': paragraph_id,
                            'text': chunk,
                            'page_no': page_no,
                        }
                    )
                    paragraph_meta.append(
                        {
                            'paragraph_id': paragraph_id,
                            'page_no': page_no,
                            'bbox': block['bbox'],
                        }
                    )
                    paragraph_id += 1
        return paragraphs, paragraph_meta, caption_blocks_by_page

    def _detect_caption_block_ids(self, text_blocks_by_page: dict[int, list[dict[str, Any]]]) -> set[str]:
        result: set[str] = set()
        for blocks in text_blocks_by_page.values():
            for block in blocks:
                if CAPTION_PATTERN.match(block['text']):
                    result.add(block['block_id'])
        return result

    def _build_fallback_paragraphs(self, doc: fitz.Document) -> list[dict[str, Any]]:
        paragraphs: list[dict[str, Any]] = []
        paragraph_id = 1
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            current_lines: list[str] = []

            def flush() -> None:
                nonlocal current_lines, paragraph_id
                if not current_lines:
                    return
                merged = _normalize_whitespace(' '.join(current_lines))
                if merged:
                    paragraphs.append({'paragraph_id': paragraph_id, 'text': merged, 'page_no': page_no})
                    paragraph_id += 1
                current_lines = []

            for line in page.get_text('text').splitlines():
                stripped = line.strip()
                if not stripped:
                    flush()
                    continue
                current_lines.append(stripped)
                if len(' '.join(current_lines)) >= 700:
                    flush()
            flush()
        return paragraphs

    def _build_page_previews(self, doc: fitz.Document, pages_dir: Path, reader_notices: list[str]) -> list[dict[str, Any]]:
        pages: list[dict[str, Any]] = []
        for page_index, page in enumerate(doc):
            page_no = page_index + 1
            try:
                pix = page.get_pixmap(matrix=fitz.Matrix(PAGE_PREVIEW_SCALE, PAGE_PREVIEW_SCALE), alpha=False)
                file_name = f'pages/page_{page_no}.png'
                path = pages_dir / f'page_{page_no}.png'
                pix.save(path)
                pages.append(
                    {
                        'page_no': page_no,
                        'file_name': file_name,
                        'width': pix.width,
                        'height': pix.height,
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
                    page_no,
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
                (0 <= below_distance <= 160 and overlap_ratio >= 0.2)
                or (0 <= above_distance <= 80 and overlap_ratio >= 0.2)
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
        page_no: int,
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
        if not paragraphs:
            return 'PDF 已下载，但暂未整理出可稳定阅读的正文内容。你仍可继续使用摘要、心得和研究状态。'
        if pages and figures and not reader_notices:
            return '当前为结构化正文阅读视图，已补充页面预览与图片辅助；英文原文始终保持 canonical。'
        if pages or figures:
            return '正文已结构化整理；页面预览或图片提取可能部分降级，英文原文始终保持 canonical。'
        return '当前为整理后的正文文本视图，仍可能存在格式误差；英文原文始终保持 canonical。'


paper_reader_service = PaperReaderService()
