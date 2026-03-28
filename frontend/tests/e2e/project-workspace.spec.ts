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

async function openSeededPaperReader(page: Page, title: string, options?: { stripResumeQuery?: boolean }) {
  await openSeededProject(page);
  const paperCard = page.locator(".project-paper-card", { hasText: title });
  await expect(paperCard).toBeVisible();
  const readerLink = paperCard.getByRole("link", { name: /打开高级阅读器|继续阅读|优先回看/ });
  if (options?.stripResumeQuery) {
    const href = await readerLink.getAttribute("href");
    if (!href) {
      throw new Error("expected seeded reader link href");
    }
    const nextUrl = new URL(href, page.url());
    nextUrl.searchParams.delete("paragraph_id");
    nextUrl.searchParams.delete("summary_id");
    const cleanPath = `${nextUrl.pathname}${nextUrl.search ? nextUrl.search : ""}`;
    await page.goto(cleanPath);
  } else {
    await readerLink.click();
  }
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
}

async function clearReaderLocalState(page: Page) {
  await page.goto("/projects");
  await page.evaluate(() => window.localStorage.clear());
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
  await expect(page.locator('[data-testid^="saved-search-card-"]')).toContainText(title);
}

async function checkFirstCandidate(page: Page) {
  const results = await firstSearchResults(page);
  await results.first().locator('input[type="checkbox"]').check();
  return results.first();
}

async function expectReaderShellFocused(page: Page) {
  await expect.poll(async () =>
    page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? ""),
  ).toBe("reader-shell");
}

async function readParagraphMeta(locator: Locator) {
  const pageNo = await locator.getAttribute("data-page-no");
  const paragraphId = await locator.getAttribute("data-paragraph-id");
  if (!pageNo || !paragraphId) {
    throw new Error("expected paragraph data attributes");
  }
  return {
    pageNo,
    paragraphId,
  };
}

async function expectFocusSummarySyncedToActiveParagraph(page: Page) {
  const activeParagraph = page.locator(".reader-text-block-active").first();
  await expect(activeParagraph).toBeVisible();
  const meta = await readParagraphMeta(activeParagraph);
  await expect(page.getByTestId("reader-page-jump")).toHaveValue(meta.pageNo);
  await expect(page.getByTestId("reader-focus-summary")).toContainText(`第 ${meta.pageNo} 页`);
  await expect(page.getByTestId("reader-focus-summary")).toContainText(`段落 #${meta.paragraphId}`);
  return meta;
}

test("supports saved search, triage persistence, ai reasons, and citation add", async ({ page }) => {
  const suffix = Date.now();
  await createProject(page, `E2E search workbench ${suffix}: Which literature agents deserve deeper review?`);

  await page.getByTestId("project-search-input").fill("long context evidence synthesis");
  await page.getByTestId("project-search-run").click();
  await firstSearchResults(page);

  await saveCurrentSearch(page, "核心检索");
  const firstResult = await checkFirstCandidate(page);
  await page.getByRole("button", { name: "标为待重点阅读" }).click();
  await expect(firstResult).toContainText("待重点阅读");

  await page.getByTestId("generate-ai-reason-button").click();
  await expect(page.getByText("默认先展示规则解释；需要时可按需生成 AI 推荐理由。")).toHaveCount(0);

  await page.getByTestId("load-citation-trail-button").click();
  const referenceColumn = page.locator(".project-citation-column").first();
  await expect(referenceColumn).toContainText("Reference Evidence Board Methods");
  await referenceColumn.locator('input[type="checkbox"]').first().check();
  await page.getByTestId("citation-batch-add-button").click();
  await expect(page.getByTestId("project-paper-pool")).toContainText("Reference Evidence Board Methods");

  await page.reload();
  const savedSearches = page.locator('[data-testid^="saved-search-open-"]');
  await savedSearches.first().click();
  const reloadedResults = await firstSearchResults(page);
  await expect(reloadedResults.first()).toContainText("待重点阅读");
  await expect(page.getByText("默认先展示规则解释；需要时可按需生成 AI 推荐理由。")).toHaveCount(0);
});

test("surfaces reader continuation cues inside the search workbench", async ({ page }) => {
  const suffix = Date.now();
  await createProject(page, `E2E search continuation ${suffix}: Which papers should I resume reading first?`);

  await page.getByTestId("project-search-input").fill("long context evidence synthesis");
  await page.getByTestId("project-search-run").click();

  const results = await firstSearchResults(page);
  const firstResult = results.first();
  const resultTestId = await firstResult.getAttribute("data-testid");
  const paperId = Number(resultTestId?.match(/search-result-(\d+)/)?.[1] ?? 0);
  expect(paperId).toBeGreaterThan(0);

  await page.getByTestId(`search-add-project-${paperId}`).click();
  await expect(firstResult).toContainText("已在项目中");
  await page.getByTestId(`search-view-detail-${paperId}`).click();

  await page.getByTestId("search-inspector-open-reader").click();
  await expect(page).toHaveURL(new RegExp(`/papers/${paperId}\\?project_id=\\d+`));

  await page.getByTestId("reader-mode-text").click();
  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  await firstParagraph.click();
  await page.getByTestId("reader-toggle-revisit").click();
  await page.getByTestId("reader-return-project").click();
  await page.waitForURL(/\/projects\/\d+$/);

  await page.getByTestId("project-search-input").fill("long context evidence synthesis");
  await page.getByTestId("project-search-run").click();
  await firstSearchResults(page);

  await expect(page.getByTestId(`search-reader-state-${paperId}`)).toContainText("待回看 1 段");
  await expect(page.getByTestId(`search-open-reader-${paperId}`)).toContainText("优先回看");

  await page.getByTestId(`search-view-detail-${paperId}`).click();
  await expect(page.getByTestId("search-inspector-reader-panel")).toContainText("待回看 1 段");
  await expect(page.getByTestId("search-inspector-open-reader")).toContainText("优先回看");
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

  const selectionToolbar = page.getByTestId("reader-selection-toolbar");
  await expect(selectionToolbar.getByRole("button", { name: "写批注" })).toBeVisible();
  await selectionToolbar.getByRole("button", { name: "写批注" }).click();

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

  async function expectStageScope(origin: string, range: string, detail: string) {
    await expect(page.getByTestId("project-stage-scope-origin-stat")).toContainText(origin);
    await expect(page.getByTestId("project-stage-scope-origin")).toContainText(origin);
    await expect(page.getByTestId("project-stage-scope-note")).toContainText(range);
    await expect(page.getByTestId("project-stage-scope-detail")).toContainText(detail);
  }

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

  const secondReaderTestId = await page.locator('[data-testid^="project-open-reader-"]').nth(1).getAttribute("data-testid");
  const secondPaperId = secondReaderTestId?.match(/project-open-reader-(\d+)/)?.[1];
  expect(secondPaperId).toBeTruthy();
  if (!secondPaperId) {
    throw new Error("expected second paper id in project workspace");
  }

  await expect(page.getByTestId(`project-reader-state-${paperId}`)).toContainText("阅读会话已保存");
  await expect(page.getByTestId(`project-reader-state-${paperId}`)).toContainText("优先回看");
  await expect(page.getByTestId(`project-reader-state-${paperId}`)).toContainText("待回看 1 段");
  await expect(page.getByTestId(`project-open-reader-${paperId}`)).toContainText("优先回看");
  await expect(page.getByTestId(`project-reader-state-${secondPaperId}`)).toContainText("先留在池里");
  await expect(page.getByTestId(`project-open-reader-${secondPaperId}`)).toContainText("打开高级阅读器");
  await expect(page.getByTestId("project-paper-section-revisit")).toContainText("优先回看");
  await expect(page.getByTestId("project-paper-section-revisit")).toContainText("待回看 1 段");
  await expect(page.getByTestId("project-paper-section-parked")).toContainText("先留在池里");
  await expect(page.getByTestId("project-paper-section-parked")).toContainText("打开高级阅读器");
  await expect(page.getByTestId("project-reading-order-hint")).toContainText("优先回看");
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("全部接续状态");
  await expect(page.getByTestId("project-reading-focus-revisit")).toContainText("只看优先回看 1");
  await expect(page.getByTestId("project-reading-focus-parked")).toContainText("只看先留在池里 1");
  await expect(page.getByTestId("project-paper-stage-reader-panel")).toContainText("阅读接续建议");
  await expect(page.getByTestId("project-stage-reader-summary")).toContainText("当前范围已保存会话 1 篇");
  await expectStageScope("默认范围", "全部论文 · 全部接续状态", "当前在默认论文池范围");
  await expect(page.getByTestId(`project-stage-reader-candidate-${paperId}`)).toContainText("优先回看");
  await expect(page.getByTestId(`project-stage-reader-link-${paperId}`)).toContainText("优先回看");
  await expect(page.getByTestId("project-reader-overview")).toContainText("已保存会话 1 篇");
  await expect(page.getByTestId("project-reader-overview")).toContainText("待回看 1 篇 / 1 段");
  await expect(page.getByTestId(`project-reader-candidate-${paperId}`)).toContainText("待回看 1 段");
  await expect(page.getByTestId(`project-reader-candidate-link-${paperId}`)).toContainText("优先回看");
  await expect(page.getByTestId("project-reader-overview-focus-revisit")).toContainText("回到论文池看优先回看 1");
  await expect(page.getByTestId("project-reader-overview-focus-parked")).toContainText("回到论文池看先留在池里 1");

  await page.getByTestId("project-reader-overview-focus-parked").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("全部论文");
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("只看先留在池里");
  await expect(page.getByTestId("project-paper-scope-banner")).toContainText("当前范围来自右侧阅读回流");
  await expect(page.getByTestId("project-paper-scope-origin")).toContainText("来自状态中心");
  await expect(page.getByTestId("project-paper-scope-origin")).toContainText("全部论文");
  await expectStageScope("来自状态中心", "全部论文 · 只看先留在池里", "当前范围来自右侧阅读回流");
  await expect(page.getByTestId("project-stage-scope-reset")).toContainText("回到默认范围");
  await expect(page.getByTestId("project-paper-section-parked")).toContainText("先留在池里");
  await expect(page.getByTestId("project-paper-section-revisit")).toHaveCount(0);
  await page.getByTestId("project-stage-scope-reset").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("全部接续状态");
  await expect(page.getByTestId("project-paper-scope-banner")).toHaveCount(0);
  await expectStageScope("默认范围", "全部论文 · 全部接续状态", "当前在默认论文池范围");

  await page.getByTestId("project-reader-overview-focus-revisit").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("只看优先回看");
  await expect(page.getByTestId("project-paper-scope-origin")).toContainText("来自状态中心");
  await expectStageScope("来自状态中心", "全部论文 · 只看优先回看", "当前范围来自右侧阅读回流");
  await expect(page.getByTestId("project-paper-section-revisit")).toContainText("优先回看");
  await expect(page.getByTestId("project-paper-section-parked")).toHaveCount(0);

  await page.getByTestId("project-reading-focus-revisit").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("只看优先回看");
  await expect(page.getByTestId("project-paper-scope-origin")).toContainText("来自阅读接续聚焦");
  await expectStageScope("来自阅读接续聚焦", "全部论文 · 只看优先回看", "当前范围来自阅读接续聚焦");
  await expect(page.getByTestId("project-paper-section-revisit")).toContainText("优先回看");
  await expect(page.getByTestId("project-paper-section-parked")).toHaveCount(0);
  await page.getByTestId("project-smart-view-pending_summary").click();
  await expect(page.getByTestId("project-paper-scope-origin")).toContainText("来自智能视图");
  await expectStageScope("来自智能视图", "待摘要 · 只看优先回看", "当前范围来自智能视图切换");
  await expect(page.getByTestId("project-stage-empty-scope-hint")).toContainText("当前组合范围暂时没有论文");
  await expect(page.getByTestId("project-stage-empty-scope-hint")).toContainText("回到全部论文");
  await expect(page.getByTestId("project-stage-scope-clear-smart-view")).toContainText("回到全部论文");
  await expect(page.getByTestId("project-stage-scope-clear-reader-focus")).toContainText("保留");
  await page.getByTestId("project-stage-scope-clear-smart-view").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("全部论文");
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("只看优先回看");
  await expect(page.getByTestId("project-paper-scope-origin")).toContainText("来自阅读接续聚焦");
  await expectStageScope("来自阅读接续聚焦", "全部论文 · 只看优先回看", "当前范围来自阅读接续聚焦");
  await expect(page.getByTestId("project-stage-empty-scope-hint")).toHaveCount(0);
  await page.getByTestId("project-stage-scope-clear-reader-focus").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("全部接续状态");
  await expect(page.getByTestId("project-paper-scope-banner")).toHaveCount(0);
  await expectStageScope("默认范围", "全部论文 · 全部接续状态", "当前在默认论文池范围");

  await page.getByTestId("project-reading-focus-parked").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("只看先留在池里");
  await expect(page.getByTestId("project-paper-section-parked")).toContainText("先留在池里");
  await expect(page.getByTestId("project-paper-section-revisit")).toHaveCount(0);

  await page.getByTestId("project-reading-focus-all").click();
  await expect(page.getByTestId("project-reading-focus-summary")).toContainText("全部接续状态");
  await expect(page.getByTestId("project-paper-section-revisit")).toContainText("优先回看");
  await expect(page.getByTestId("project-paper-section-parked")).toContainText("先留在池里");
  await expect(page.getByTestId("project-paper-scope-banner")).toHaveCount(0);
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

test("groups annotations into pending and resolved workbench sections", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  const note = `E2E annotation workbench ${Date.now()}`;
  await page.locator('[data-testid^="reader-paragraph-"]').first().click();
  await page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。").fill(note);
  await page.getByRole("button", { name: "保存当前段落批注" }).click();

  await expect(page.getByTestId("reader-annotation-workbench")).toBeVisible();
  await expect(page.getByTestId("reader-pending-annotations")).toContainText(note);

  await page.getByTestId("reader-add-project-evidence").click();

  await expect(page.getByTestId("reader-resolved-annotations")).toContainText(note);
});

test("shows which annotation brought the reader back into focus summary", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  const note = `E2E annotation return ${Date.now()}`;
  await page.locator('[data-testid^="reader-paragraph-"]').first().click();
  await page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。").fill(note);
  await page.getByRole("button", { name: "保存当前段落批注" }).click();

  const currentPageAnnotations = page.getByTestId("reader-current-page-annotations");
  await expect(currentPageAnnotations).toContainText(note);
  await currentPageAnnotations.getByRole("button").first().click();

  const annotationContext = page.getByTestId("reader-focus-annotation-context");
  await expect(annotationContext).toContainText("当前由批注带回");
  await expect(annotationContext).toContainText(/待处理批注|已沉淀批注/);
  await expect(annotationContext).toContainText(note);
  await expect(page.getByTestId("reader-focus-summary")).not.toContainText("当前段落批注");
});

test("shows inline annotation feedback inside annotated paragraphs", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  const note = `E2E inline note ${Date.now()}`;
  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  await firstParagraph.click();
  await page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。").fill(note);
  await page.getByRole("button", { name: "保存当前段落批注" }).click();

  await expect(firstParagraph).toHaveClass(/reader-text-block-annotated/);
  await expect(firstParagraph).toContainText(/批注 \d+ 条/);
  await expect(firstParagraph.locator('[data-testid^="reader-annotation-preview-"]')).toContainText(note);
});

test("keeps focus summary annotation context synced with the active paragraph", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  const note = `E2E focus note ${Date.now()}`;
  const paragraphs = page.locator('[data-testid^="reader-paragraph-"]');
  const firstParagraph = paragraphs.first();
  await firstParagraph.click();
  await page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。").fill(note);
  await page.getByRole("button", { name: "保存当前段落批注" }).click();

  await expect(page.getByTestId("reader-focus-annotation-context")).toContainText(note);

  await paragraphs.nth(1).click();
  await expect(page.getByTestId("reader-focus-summary")).toContainText("段落 #2");
  await expect(page.getByTestId("reader-focus-summary")).not.toContainText(note);
});

test("supports keyboard-first reader navigation and actions", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);

  await page.getByTestId("reader-shell").focus();
  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);
  await expect(page.getByTestId("reader-text-article")).toBeVisible();

  await page.keyboard.press("/");
  await expect(page.getByTestId("reader-locator-input")).toBeFocused();
  await expect(page.getByTestId("reader-shortcuts")).toContainText("保存批注");

  await page.locator('[data-testid^="reader-paragraph-"]').first().click();
  await expect(page.getByTestId("reader-focus-summary")).toContainText("段落 #1");

  await page.keyboard.press("j");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("段落 #2");

  await page.keyboard.press("k");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("段落 #1");

  const note = `E2E keyboard shortcut note ${Date.now()}`;
  await page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。").fill(note);
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("reader-current-page-annotations")).toContainText(note);

  await page.getByTestId("reader-focus-summary").click();
  await page.keyboard.press("b");
  await page.waitForURL(/\/projects\/\d+$/);
});

test("keeps locator jumps synced with page state and focus summary", async ({ page }) => {
  await clearReaderLocalState(page);
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents", { stripResumeQuery: true });

  await page.getByTestId("reader-shell").focus();
  await page.keyboard.press("/");
  await expect(page.getByTestId("reader-locator-input")).toBeFocused();
  await page.getByTestId("reader-locator-input").fill("Section 11");
  await page.getByRole("button", { name: "定位关键词" }).click();

  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);
  const meta = await expectFocusSummarySyncedToActiveParagraph(page);
  await expect(page.getByTestId(`reader-paragraph-${meta.paragraphId}`)).toContainText("Section 11");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("按关键词定位");

  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);
  await expect(page.getByTestId("reader-focus-summary")).toContainText(`当前阅读位置：第 ${meta.pageNo} 页`);
  await expect(page.getByTestId("reader-page-anchor-hint")).toContainText(`段落 #${meta.paragraphId}`);
});

test("cycles locator matches and keeps match status in sync", async ({ page }) => {
  await clearReaderLocalState(page);
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents", { stripResumeQuery: true });

  await page.getByTestId("reader-locator-input").fill("Section");
  await page.getByRole("button", { name: "定位关键词" }).click();

  await expect(page.getByTestId("reader-locator-match-status")).toContainText("命中 12 处");
  await expect(page.getByTestId("reader-locator-match-status")).toContainText("当前第 1 处");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("1/12 个搜索命中");
  await expect(page.getByTestId("reader-paragraph-6")).toContainText("Section 1");

  await page.getByTestId("reader-locator-next-match").click();
  await expectFocusSummarySyncedToActiveParagraph(page);
  await expect(page.getByTestId("reader-locator-match-status")).toContainText("当前第 2 处");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("2/12 个搜索命中");
  await expect(page.getByTestId("reader-page-jump")).toHaveValue("2");
  await expect(page.getByTestId("reader-paragraph-7")).toContainText("Section 2");

  await page.getByTestId("reader-locator-prev-match").click();
  await expect(page.getByTestId("reader-locator-match-status")).toContainText("当前第 1 处");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("1/12 个搜索命中");
  await expect(page.getByTestId("reader-page-jump")).toHaveValue("1");
  await expect(page.getByTestId("reader-paragraph-6")).toContainText("Section 1");
  await expect(page.getByText("当前仅展示前 8 个命中")).toBeVisible();
});

test("highlights locator keywords inside matched paragraphs", async ({ page }) => {
  await clearReaderLocalState(page);
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents", { stripResumeQuery: true });

  await page.getByTestId("reader-locator-input").fill("Section 11");
  await page.getByRole("button", { name: "定位关键词" }).click();

  const activeParagraph = page.locator(".reader-text-block-active").first();
  await expect(activeParagraph.locator(".reader-search-highlight")).toHaveText("Section 11");
  await expect(page.getByTestId("reader-focus-summary")).toContainText("搜索命中");
});

test("keeps quick navigation and figure anchors synced with focus summary", async ({ page }) => {
  await clearReaderLocalState(page);
  await openSeededPaperReader(page, "E2E Retrieval Study for Evidence Synthesis", { stripResumeQuery: true });

  const headingButton = page.locator('[data-testid^="reader-quick-nav-heading-"]').nth(1);
  await expect(headingButton).toBeVisible();
  const headingPageNo = await headingButton.getAttribute("data-target-page-no");
  const headingParagraphId = await headingButton.getAttribute("data-target-paragraph-id");
  if (!headingPageNo || !headingParagraphId) {
    throw new Error("expected heading navigation target attributes");
  }

  await headingButton.click();
  await expect(page.getByTestId("reader-page-jump")).toHaveValue(headingPageNo);
  await expect(page.getByTestId("reader-focus-summary")).toContainText(`第 ${headingPageNo} 页`);
  await expect(page.getByTestId("reader-focus-summary")).toContainText(`段落 #${headingParagraphId}`);
  await expect(page.getByTestId("reader-focus-summary")).toContainText("章节导航");

  await page.getByTestId("reader-figure-flow-anchor-1").click();
  await expectFocusSummarySyncedToActiveParagraph(page);
  await expect(page.getByTestId("reader-focus-summary")).toContainText("图像附近正文锚点");
});

test("supports a figure-first reading flow", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Retrieval Study for Evidence Synthesis");

  await expect(page.getByText("图表优先阅读")).toBeVisible();
  await expect(page.getByTestId("reader-figure-flow-list")).toBeVisible();
  await expect(page.getByText("全文图像 7 张")).toBeVisible();

  await page.getByTestId("reader-figure-flow-open-1").click();
  await expect(page.getByRole("heading", { name: "图像 · 第 2 页" })).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByTestId("reader-figure-flow-anchor-1").click();
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);
  await expect(page.getByTestId("reader-focus-summary")).toContainText("第 2 页");
});

test("keeps the multi-figure flow bounded for figure-heavy papers", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Retrieval Study for Evidence Synthesis");

  const figureFlowItems = page.getByTestId("reader-figure-flow-list").locator('[data-testid^="reader-figure-flow-item-"]');
  await expect(figureFlowItems).toHaveCount(6);
  await expect(page.getByTestId("reader-figure-flow-overflow")).toContainText("前 6 张");
  await expect(page.getByTestId("reader-figure-flow-overflow")).toContainText("剩余 1 张");
});

test("persists local reader layout preferences", async ({ page }) => {
  await openSeededProject(page);

  await page.locator('[data-testid^="project-open-reader-"]').first().click();
  await page.waitForURL(/\/papers\/\d+\?project_id=\d+/);
  await page.getByTestId("reader-mode-text").click();

  await page.getByTestId("reader-preference-width").selectOption("focused");
  await page.getByTestId("reader-preference-density").selectOption("compact");

  await expect(page.getByTestId("reader-text-article")).toHaveAttribute("data-reader-width", "focused");
  await expect(page.getByTestId("reader-text-article")).toHaveAttribute("data-reader-density", "compact");

  await page.reload();
  await page.getByTestId("reader-mode-text").click();

  await expect(page.getByTestId("reader-preference-width")).toHaveValue("focused");
  await expect(page.getByTestId("reader-preference-density")).toHaveValue("compact");
  await expect(page.getByTestId("reader-text-article")).toHaveAttribute("data-reader-width", "focused");
  await expect(page.getByTestId("reader-text-article")).toHaveAttribute("data-reader-density", "compact");
});

test("pauses reader shortcuts while dropdown controls hold focus", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents");

  const pageJump = page.getByTestId("reader-page-jump");
  await pageJump.focus();
  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);
  await expect(page.getByTestId("reader-mode-text")).toHaveClass(/secondary/);

  await page.getByTestId("reader-shell").focus();
  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  const widthSelect = page.getByTestId("reader-preference-width");
  await widthSelect.focus();
  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);
  await expect(page.getByTestId("reader-mode-page")).toHaveClass(/secondary/);

  await page.getByTestId("reader-shell").focus();
  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);
});

test("uses escape to leave reader inputs and resume shortcuts", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents");
  await page.getByTestId("reader-shell").focus();
  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  await page.keyboard.press("/");
  await expect(page.getByTestId("reader-locator-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectReaderShellFocused(page);

  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);

  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  const note = `E2E escape blur note ${Date.now()}`;
  await page.locator('[data-testid^="reader-paragraph-"]').first().click();
  const annotationField = page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。");
  await annotationField.fill(note);
  await expect(annotationField).toBeFocused();
  await page.keyboard.press("Escape");
  await expectReaderShellFocused(page);
  await expect(annotationField).toHaveValue(note);

  await page.getByTestId("reader-preference-width").focus();
  await page.keyboard.press("Escape");
  await expectReaderShellFocused(page);

  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);
});

test("keeps the page preview strip compact for long documents", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents");

  const pageJump = page.getByTestId("reader-page-jump");
  const pageOptions = pageJump.locator("option");
  await expect.poll(async () => pageOptions.count()).toBeGreaterThan(10);

  const totalPages = await pageOptions.count();
  const previewButtons = page.getByTestId("reader-page-preview-strip").locator('button[data-testid^="reader-page-preview-"]');
  const initialPreviewCount = await previewButtons.count();

  expect(initialPreviewCount).toBeLessThan(totalPages);
  await expect(page.getByTestId("reader-page-preview-windowed-hint")).toContainText(`${initialPreviewCount} / ${totalPages} 页`);

  const middlePage = String(Math.ceil(totalPages / 2));
  await pageJump.selectOption(middlePage);
  await expect(page.getByTestId(`reader-page-preview-${middlePage}`)).toBeVisible();
  await expect(page.getByTestId(`reader-page-preview-${middlePage}`)).toHaveClass(/active/);
});

test("supports desktop-style page navigation and zoom shortcuts", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents");

  const pageJump = page.getByTestId("reader-page-jump");
  const zoomSelect = page.getByTestId("reader-zoom-select");
  await expect.poll(async () => pageJump.locator("option").count()).toBeGreaterThan(10);
  const totalPages = await pageJump.locator("option").count();

  await page.getByTestId("reader-shell").focus();
  await expect(page.getByTestId("reader-shortcuts")).toContainText("桌面翻页");
  await expect(page.getByTestId("reader-shortcuts")).toContainText("页面缩放");

  await page.keyboard.press("PageDown");
  await expect(pageJump).toHaveValue("2");

  await page.keyboard.press("End");
  await expect(pageJump).toHaveValue(String(totalPages));

  await page.keyboard.press("Home");
  await expect(pageJump).toHaveValue("1");

  await expect(zoomSelect).toHaveValue("100");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", ctrlKey: true, bubbles: true }));
  });
  await expect(zoomSelect).toHaveValue("115");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", ctrlKey: true, bubbles: true }));
  });
  await expect(zoomSelect).toHaveValue("100");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", ctrlKey: true, bubbles: true }));
  });
  await expect(zoomSelect).toHaveValue("115");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", ctrlKey: true, bubbles: true }));
  });
  await expect(zoomSelect).toHaveValue("130");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", ctrlKey: true, bubbles: true }));
  });
  await expect(zoomSelect).toHaveValue("100");
});

test("keeps quote actions accessible after scrolling a text selection", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Long Context Benchmark for Literature Agents");
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

    const text = textNode.textContent.trim().slice(0, 36);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, text.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return text;
  });

  await expect(page.getByTestId("reader-selection-toolbar")).toBeVisible();
  await expect(page.getByTestId("reader-selection-context-text")).toContainText(selectedText);

  await page.mouse.wheel(0, 1200);
  await expect(page.getByTestId("reader-selection-context")).toBeVisible();
  await expect(page.getByTestId("reader-selection-context-text")).toContainText(selectedText);

  await page.getByTestId("reader-selection-context-annotate").click();
  await expect(page.getByPlaceholder("记录这一段对你的启发、疑问、复现提醒，或后续要查证的点。")).toBeFocused();
  await expect(page.getByTestId("reader-annotation-quote-text")).toContainText(selectedText);
});

test("supports escape-based overlay exits and quote cleanup", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Retrieval Study for Evidence Synthesis");
  await page.getByTestId("reader-mode-text").click();
  await expect(page.getByTestId("reader-text-article")).toBeVisible();

  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  const selectSnippet = async () =>
    firstParagraph.evaluate((element) => {
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

  const selectedText = await selectSnippet();
  await expect(page.getByTestId("reader-selection-context-text")).toContainText(selectedText);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reader-selection-context")).toHaveCount(0);
  await expect(page.getByTestId("reader-selection-toolbar")).toHaveCount(0);

  await selectSnippet();
  const selectionToolbar = page.getByTestId("reader-selection-toolbar");
  await selectionToolbar.getByRole("button", { name: "英译中" }).click();
  await expect(page.getByTestId("reader-translation-drawer")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reader-translation-drawer")).toHaveCount(0);

  await page.getByTestId("reader-figure-flow-open-1").click();
  await expect(page.getByTestId("reader-lightbox")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reader-lightbox")).toHaveCount(0);
});

test("restores reader keyboard flow after closing overlays", async ({ page }) => {
  await openSeededPaperReader(page, "E2E Retrieval Study for Evidence Synthesis");
  await page.getByTestId("reader-shell").focus();
  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  const firstParagraph = page.locator('[data-testid^="reader-paragraph-"]').first();
  const selectSnippet = async () =>
    firstParagraph.evaluate((element) => {
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

  await selectSnippet();
  await page.getByTestId("reader-selection-toolbar").getByRole("button", { name: "英译中" }).click();
  await expect(page.getByTestId("reader-translation-drawer")).toBeVisible();

  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reader-translation-drawer")).toHaveCount(0);
  await expectReaderShellFocused(page);

  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);

  await page.getByRole("button", { name: /本页图像/ }).click();
  await expect(page.getByTestId("reader-figure-panel")).toBeVisible();

  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-page")).not.toHaveClass(/secondary/);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reader-figure-panel")).toHaveCount(0);
  await expectReaderShellFocused(page);

  await page.keyboard.press("t");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  await page.getByTestId("reader-figure-flow-open-1").click();
  await expect(page.getByTestId("reader-lightbox")).toBeVisible();

  await page.keyboard.press("p");
  await expect(page.getByTestId("reader-mode-text")).not.toHaveClass(/secondary/);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reader-lightbox")).toHaveCount(0);
  await expectReaderShellFocused(page);

  await page.keyboard.press("w");
  await expect(page.getByTestId("reader-mode-workspace")).not.toHaveClass(/secondary/);
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
