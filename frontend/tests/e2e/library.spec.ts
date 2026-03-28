import { expect, test } from '@playwright/test';

function makeLibraryItem(index: number, downloaded: boolean) {
  return {
    id: index + 1,
    title_en: `Library Pagination Paper ${index + 1}`,
    authors: `Author ${index + 1}`,
    source: 'arXiv',
    year: 2024,
    pdf_local_path: downloaded ? `backend/data/papers/library-${index + 1}.pdf` : '',
    is_downloaded: downloaded,
    reading_status: downloaded ? 'reading' : 'unread',
    interest_level: 3,
    repro_interest: downloaded ? 'medium' : 'none',
    is_core_paper: index % 5 === 0,
    summary_count: downloaded ? 1 : 0,
    reflection_count: downloaded ? 1 : 0,
    reproduction_count: downloaded ? 1 : 0,
    memory_count: downloaded ? 1 : 0,
    in_memory: downloaded,
    read_at: downloaded ? '2026-03-29' : null,
    last_opened_at: downloaded ? '2026-03-29T10:00:00Z' : null,
    last_activity_at: '2026-03-29T10:00:00Z',
    last_activity_label: downloaded ? '下载 PDF' : '已加入文献库',
    is_my_library: downloaded,
  };
}

test('defaults my library to downloaded papers and paginates the list', async ({ page }) => {
  const items = Array.from({ length: 27 }, (_, index) => makeLibraryItem(index, index < 23));

  await page.route('**/library/list', async (route) => {
    await route.fulfill({
      json: {
        items,
        total: items.length,
      },
    });
  });

  await page.goto('/library');

  const libraryItems = page.locator('.library-item');
  await expect(page.getByTestId('library-view-downloaded')).toHaveClass(/active/);
  await expect(page.getByTestId('library-view-summary')).toContainText('当前共 23 篇，第 1 / 2 页');
  await expect(page.getByTestId('library-pagination-top-summary')).toContainText('当前第 1 / 2 页');
  await expect(libraryItems).toHaveCount(20);

  await page.getByTestId('library-pagination-top-next').click();
  await expect(page.getByTestId('library-view-summary')).toContainText('当前共 23 篇，第 2 / 2 页');
  await expect(page.getByTestId('library-pagination-top-summary')).toContainText('当前第 2 / 2 页');
  await expect(libraryItems).toHaveCount(3);

  await page.getByTestId('library-view-all').click();
  await expect(page.getByTestId('library-view-summary')).toContainText('当前共 27 篇，第 1 / 2 页');
  await expect(page.getByTestId('library-pagination-top-summary')).toContainText('当前第 1 / 2 页');
  await expect(libraryItems).toHaveCount(20);
});
