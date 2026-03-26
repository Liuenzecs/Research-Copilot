import { expect, test, type Locator, type Page } from "@playwright/test";

async function createProject(page: Page, question: string) {
  await page.goto("/projects");
  await page.getByTestId("project-question-input").fill(question);
  await page.getByTestId("create-project-button").click();
  await page.waitForURL(/\/projects\/\d+$/);
}

async function openSeededProject(page: Page) {
  await page.goto("/projects");
  const seededProjectCard = page.locator(".project-list-card", { hasText: "E2E Context Project" });
  await seededProjectCard.getByRole("button", { name: /进入工作台/ }).click();
  await page.waitForURL(/\/projects\/\d+$/);
}

async function firstSearchResults(page: Page) {
  const results = page.locator('[data-testid^="search-result-"]');
  await expect.poll(async () => results.count()).toBeGreaterThan(1);
  return results;
}

async function addFixturePapersToProject(page: Page, query: string) {
  await page.getByTestId("project-search-input").fill(query);
  await page.getByTestId("project-search-run").click();

  const results = await firstSearchResults(page);
  await results.nth(0).locator('input[type="checkbox"]').check();
  await results.nth(1).locator('input[type="checkbox"]').check();
  await page.getByTestId("project-search-batch-add").click();

  const paperPool = page.getByTestId("project-paper-pool");
  await expect(paperPool).toContainText("E2E Retrieval Study for Evidence Synthesis");
  await expect(paperPool).toContainText("E2E Long Context Benchmark for Literature Agents");
}

async function saveCurrentSearch(page: Page, title: string) {
  await page.getByPlaceholder("保存搜索名称").fill(title);
  await page.getByTestId("save-search-button").click();
  await expect(page.locator('[data-testid^="saved-search-"]')).toContainText(title);
}

async function checkFirstCandidate(page: Page) {
  const results = await firstSearchResults(page);
  await results.first().locator('input[type="checkbox"]').check();
  return results.first();
}

test("supports saved search, triage persistence, ai reasons, and citation add", async ({ page }) => {
  const suffix = Date.now();
  await createProject(page, `E2E search workbench ${suffix}: Which literature agents deserve deeper review?`);

  await page.getByTestId("project-search-input").fill("long context evidence synthesis");
  await page.getByTestId("project-search-run").click();
  await firstSearchResults(page);

  await saveCurrentSearch(page, "核心检索");
  await checkFirstCandidate(page);
  await page.getByRole("button", { name: "标为待重点阅读" }).click();
  await expect(page.locator(".project-candidate-card").first()).toContainText("待重点阅读");

  await page.getByTestId("generate-ai-reason-button").click();
  await expect(page.getByText("默认先展示规则解释；需要时可按需生成 AI 推荐理由。")).toHaveCount(0);

  await page.getByTestId("load-citation-trail-button").click();
  const referenceColumn = page.locator(".project-citation-column").first();
  await expect(referenceColumn).toContainText("Reference Evidence Board Methods");
  await referenceColumn.locator('input[type="checkbox"]').first().check();
  await page.getByTestId("citation-batch-add-button").click();
  await expect(page.getByTestId("project-paper-pool")).toContainText("Reference Evidence Board Methods");

  await page.reload();
  const savedSearches = page.locator('[data-testid^="saved-search-"]');
  await savedSearches.first().click();
  await expect(page.locator(".project-candidate-card").first()).toContainText("待重点阅读");
  await expect(page.getByText("默认先展示规则解释；需要时可按需生成 AI 推荐理由。")).toHaveCount(0);
});

test("creates a project, runs actions, and persists autosaved outputs", async ({ page }) => {
  const suffix = Date.now();
  await createProject(page, `E2E live project ${suffix}: How should long context evidence agents compare?`);
  await addFixturePapersToProject(page, "long context evidence synthesis");

  await page.getByTestId("project-action-extract").click();
  await expect(page.getByTestId("task-progress-panel")).toContainText(/摘要|证据/);
  await expect.poll(async () => page.locator('[data-testid^="evidence-card-"]').count()).toBeGreaterThan(0);

  await page.getByTestId("project-action-compare").click();
  await expect.poll(async () => page.locator('[data-testid="compare-table"] tbody tr').count()).toBeGreaterThan(0);

  await page.getByTestId("project-action-review").click();
  const reviewEditor = page.getByTestId("review-editor");
  await expect(reviewEditor).toBeVisible();
  await expect(reviewEditor).toHaveValue(/## Problem Framing/);

  const compareNote = "E2E compare note: prioritize stronger ablation coverage.";
  const compareNoteCell = page.locator('[data-testid="compare-table"] tbody tr').first().locator("textarea").last();
  await compareNoteCell.fill(compareNote);
  await compareNoteCell.blur();
  await expect.poll(async () => page.getByTestId("compare-autosave-state").getAttribute("class")).toContain("state-saved");

  const reviewNote = "E2E review note: keep the notebook output directly editable.";
  const existingReview = await reviewEditor.inputValue();
  await reviewEditor.fill(`${existingReview}\n\n${reviewNote}`);
  await reviewEditor.blur();
  await expect.poll(async () => page.getByTestId("review-autosave-state").getAttribute("class")).toContain("state-saved");

  await page.reload();
  await expect(page.locator('[data-testid="compare-table"] tbody tr').first().locator("textarea").last()).toHaveValue(compareNote);
  await expect(page.getByTestId("review-editor")).toHaveValue(new RegExp(reviewNote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("adds evidence from the reader back into the current project", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);

  await page.getByTestId("reader-mode-text").click();
  await expect(page.getByTestId("reader-text-article")).toBeVisible();
  const paragraphs = page.locator('[data-testid^="reader-paragraph-"]');
  await expect.poll(async () => paragraphs.count()).toBeGreaterThan(0);
  await paragraphs.first().click();

  await page.getByTestId("reader-add-project-evidence").click();
  await page.getByTestId("reader-return-project").click();
  await page.waitForURL(/\/projects\/\d+$/);
  await expect.poll(async () => page.locator('[data-testid^="evidence-card-"]').count()).toBeGreaterThan(0);
});

test("restores the last reader session after reload", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);

  await page.getByTestId("reader-mode-workspace").click();
  await page.reload();

  await expect(page.getByTestId("reader-session-badge")).toContainText("已恢复上次阅读");
  await expect(page.getByTestId("reader-mode-workspace")).not.toHaveClass(/secondary/);
});

test("keeps the selected quote when continuing into annotation flow", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();
  await expect(page.getByTestId("reader-text-article")).toBeVisible();

  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  await expect(firstParagraph).toBeVisible();

  const selectedText = await firstParagraph.evaluate((element) => {
    const target = element.querySelector("p, h3, pre") ?? element;
    const textNode = target.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.textContent) {
      return "";
    }

    const text = textNode.textContent.trim().slice(0, 24);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, text.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return text;
  });

  await expect(page.getByRole("button", { name: "写批注" })).toBeVisible();
  await page.getByRole("button", { name: "写批注" }).click();

  await expect(page.getByText("将随批注保存的引用原文")).toBeVisible();
  await expect(page.getByTestId("reader-annotation-quote-text")).toContainText(selectedText);
  await expect(page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。")).toBeFocused();
});

test("persists revisit markers with the reader session", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  await firstParagraph.click();
  await page.getByTestId("reader-toggle-revisit").click();
  await expect(page.getByTestId("reader-focus-summary")).toContainText("待回看 1 段");

  await page.reload();
  await expect(page.getByTestId("reader-focus-summary")).toContainText("待回看 1 段");
  await expect(page.getByTestId("reader-toggle-revisit")).toContainText("取消待回看");
});

test("surfaces reader session state back in the project workspace", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);

  const paperId = page.url().match(/\/papers\/(\d+)/)?.[1];
  expect(paperId).toBeTruthy();
  if (!paperId) {
    throw new Error("expected paper id in reader url");
  }

  await page.getByTestId("reader-mode-text").click();
  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  await firstParagraph.click();
  await page.getByTestId("reader-toggle-revisit").click();
  await page.getByTestId("reader-return-project").click();
  await page.waitForURL(/\/projects\/\d+$/);

  await expect(page.getByTestId(`project-reader-state-${paperId}`)).toContainText("阅读会话已保存");
  await expect(page.getByTestId(`project-reader-state-${paperId}`)).toContainText("待回看 1 段");
  await expect(page.getByTestId(`project-open-reader-${paperId}`)).toContainText("继续阅读");
  await expect(page.getByTestId("project-reader-overview")).toContainText("已保存会话 1 篇");
  await expect(page.getByTestId("project-reader-overview")).toContainText("待回看 1 篇 / 1 段");
});

test("shows a page-level reading overview in text mode", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  const textOverview = page.getByTestId("reader-text-overview");
  await expect(textOverview).toBeVisible();
  await expect(textOverview).toContainText("正文段落");
  await expect(textOverview).toContainText("待回看");

  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  await firstParagraph.click();
  await page.getByTestId("reader-toggle-revisit").click();

  await expect(textOverview).toContainText("待回看");
  await expect(textOverview).toContainText("1 段");
});

test("keeps search, reflections, reproduction, and memory scoped to the project context", async ({ page }) => {
  await openSeededProject(page);
  const projectUrl = page.url();

  await page.getByTestId("quick-link-search").click();
  await expect(page).toHaveURL(/\/search\?project_id=\d+/);
  await expect(page.getByTestId("project-context-banner")).toContainText("当前");
  await page.getByRole("button", { name: /返回项目工作台/ }).click();
  await expect(page).toHaveURL(/\/projects\/\d+$/);

  await page.goto(projectUrl);
  await page.getByTestId("quick-link-reflections").click();
  await expect(page).toHaveURL(/\/reflections\?project_id=\d+/);
  await expect(page.getByText("Project reflection insight for E2E context")).toBeVisible();
  await expect(page.getByText("Hidden reflection outside project")).toHaveCount(0);

  await page.goto(projectUrl);
  await page.getByTestId("quick-link-reproduction").click();
  await expect(page).toHaveURL(/\/reproduction\?project_id=\d+/);
  await expect(page.getByTestId("recent-reproductions").getByText("E2E Retrieval Study for Evidence Synthesis")).toBeVisible();
  await expect(page.getByText("Hidden Control Paper for Unrelated Vision Tasks")).toHaveCount(0);

  await page.goto(projectUrl);
  await page.getByTestId("quick-link-memory").click();
  await expect(page).toHaveURL(/\/memory\?project_id=\d+/);
  await expect(page.getByText("Project memory anchor for E2E context")).toBeVisible();
  await expect(page.getByText("Hidden memory outside project")).toHaveCount(0);
});
