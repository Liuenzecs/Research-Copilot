import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, question: string) {
  await page.goto('/projects');
  await page.getByTestId('project-question-input').fill(question);
  await page.getByTestId('create-project-button').click();
  await page.waitForURL(/\/projects\/\d+$/);
}

async function addFixturePapersToProject(page: Page, query: string) {
  await page.getByTestId('project-search-input').fill(query);
  await page.getByTestId('project-search-run').click();

  const results = page.locator('[data-testid^="search-result-"]');
  await expect.poll(async () => results.count()).toBeGreaterThan(1);

  await results.nth(0).locator('input[type="checkbox"]').check();
  await results.nth(1).locator('input[type="checkbox"]').check();
  await page.getByTestId('project-search-batch-add').click();

  const paperPool = page.getByTestId('project-paper-pool');
  await expect(paperPool).toContainText('E2E Retrieval Study for Evidence Synthesis');
  await expect(paperPool).toContainText('E2E Long Context Benchmark for Literature Agents');
}

test('creates a project, runs actions, and persists autosaved outputs', async ({ page }) => {
  const suffix = Date.now();
  await createProject(page, `E2E live project ${suffix}: How should long context evidence agents compare?`);
  await addFixturePapersToProject(page, 'long context evidence synthesis');

  await page.getByTestId('project-action-extract').click();
  const progressPanel = page.getByTestId('task-progress-panel');
  await expect(progressPanel).toContainText('Ensuring summaries');
  await expect.poll(async () => page.locator('[data-testid^="evidence-card-"]').count()).toBeGreaterThan(0);

  await page.getByTestId('project-action-compare').click();
  await expect.poll(async () => page.locator('[data-testid="compare-table"] tbody tr').count()).toBeGreaterThan(0);

  await page.getByTestId('project-action-review').click();
  const reviewEditor = page.getByTestId('review-editor');
  await expect(reviewEditor).toBeVisible();
  await expect(reviewEditor).toHaveValue(/## Problem Framing/);

  const compareNote = 'E2E compare note: prioritize stronger ablation coverage.';
  const compareNoteCell = page.locator('[data-testid="compare-table"] tbody tr').first().locator('textarea').last();
  await compareNoteCell.fill(compareNote);
  await compareNoteCell.blur();
  await expect.poll(async () => page.getByTestId('compare-autosave-state').getAttribute('class')).toContain('state-saved');

  const reviewNote = 'E2E review note: keep the notebook output directly editable.';
  const existingReview = await reviewEditor.inputValue();
  await reviewEditor.fill(`${existingReview}\n\n${reviewNote}`);
  await reviewEditor.blur();
  await expect.poll(async () => page.getByTestId('review-autosave-state').getAttribute('class')).toContain('state-saved');

  await page.reload();
  await expect(page.locator('[data-testid="compare-table"] tbody tr').first().locator('textarea').last()).toHaveValue(compareNote);
  await expect(page.getByTestId('review-editor')).toHaveValue(new RegExp(reviewNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('adds evidence from the reader back into the current project', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: /E2E Context Project/i }).click();
  await page.waitForURL(/\/projects\/\d+$/);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);

  await page.getByTestId('reader-mode-text').click();
  await expect(page.getByTestId('reader-text-article')).toBeVisible();

  const paragraphs = page.locator('[data-testid^="reader-paragraph-"]');
  await expect.poll(async () => paragraphs.count()).toBeGreaterThan(0);
  await paragraphs.first().click();

  await page.getByTestId('reader-add-project-evidence').click();
  await page.getByTestId('reader-return-project').click();
  await page.waitForURL(/\/projects\/\d+$/);

  await expect.poll(async () => page.locator('[data-testid^="evidence-card-"]').count()).toBeGreaterThan(0);
});

test('keeps reflections, reproduction, and memory scoped to the project context', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: /E2E Context Project/i }).click();
  await page.waitForURL(/\/projects\/\d+$/);
  const projectUrl = page.url();

  await page.getByTestId('quick-link-reflections').click();
  await expect(page).toHaveURL(/\/reflections\?project_id=\d+/);
  await expect(page.getByText('Project reflection insight for E2E context')).toBeVisible();
  await expect(page.getByText('Hidden reflection outside project')).toHaveCount(0);

  await page.goto(projectUrl);
  await page.getByTestId('quick-link-reproduction').click();
  await expect(page).toHaveURL(/\/reproduction\?project_id=\d+/);
  await expect(page.getByText('E2E Retrieval Study for Evidence Synthesis')).toBeVisible();
  await expect(page.getByText('Hidden Control Paper for Unrelated Vision Tasks')).toHaveCount(0);

  await page.goto(projectUrl);
  await page.getByTestId('quick-link-memory').click();
  await expect(page).toHaveURL(/\/memory\?project_id=\d+/);
  await expect(page.getByText('Project memory anchor for E2E context')).toBeVisible();
  await expect(page.getByText('Hidden memory outside project')).toHaveCount(0);
});
