# 项目状态

更新时间：2026-03-29

## 当前优先级

当前最高优先级仍然是“阅读体验”。

我们近期的判断保持不变：

- 优先减少阅读中断、上下文丢失、图文来回切换和证据提取摩擦。
- 在没有明显收益前，不优先扩展与阅读主链路无关的新交互面。
- 改动优先选择低风险、可回归、可在 Windows 桌面环境稳定复用的方案。

## 当前阶段

### 4D：周报工作区重构

阶段目标：

- 把当前“别扭且鸡肋”的周报页，重构成真正服务每周回顾和成稿收口的工作台，而不是继续保留左右失衡、信息价值偏弱的旧布局。
- 第一轮优先围绕“回顾本周发生了什么 -> 汇总关键材料 -> 编辑周报草稿”这条主链路收口，不在这一阶段把周报页继续扩成新的综合仪表盘。
- 改造要优先提升扫读性、结构感和可用性，避免周报工作区继续和阅读主链路割裂。

## 待确认方案

### 2026-03-29：导航、项目入口、下载与周报重构方案

这部分用于记录本轮阅读体验主线里的实施方向；其中 A、B、C、E、F 已落地，D 仍作为后续阶段排期依据。

#### A. 启动入口与“项目”导航改造（已实施）

拟定目标：

- 应用启动后，如果已有可进入的项目，默认直接进入“最近打开的项目工作台”，而不是先停在项目创建页。
- 顶部导航栏里的“项目”优先回到当前默认项目，而不是回到“创建新项目”的首页。
- “创建项目 / 管理项目列表”入口仍然保留，但降为项目工作台里的一个小按钮，避免打断主流程。

拟定方案：

- 新增“默认项目”语义，先按“最近打开项目”实现，而不是写死某个项目 ID。
- 应用启动时：
  - 若存在最近打开项目，则直接进入 `/projects/:projectId`
  - 若没有任何项目，才进入 `/projects`
- 顶部“项目”导航改为：
  - 有默认项目时，进入该项目工作台
  - 没有默认项目时，进入项目首页
- 在项目工作台右上角增加一个弱化的小按钮，如“项目列表”或“管理项目”，跳转到当前的项目首页。

建议补充：

- 在设置页增加一个开关：`启动时进入上次项目`，默认开启，后续保留关闭能力。

#### B. 项目工作台论文池分页

拟定目标：

- 项目工作台里的论文池不再一次性铺开 100 篇以上论文。
- 在不破坏当前阅读接续、智能视图、批量操作语义的前提下，把长列表变成可翻页的稳定结构。

拟定方案：

- 先为“项目论文池主列表”加分页，而不是先做虚拟滚动。
- 默认每页 20 篇，保留页码切换，并记住当前项目下的当前页。
- 分页必须与以下状态联动：
  - 当前智能视图
  - 阅读接续聚焦
  - 当前排序
  - 批量选中
- 切换筛选条件时，页码自动回到第一页，避免空页。

建议补充：

- 第一轮只分页论文池主列表，不强行同时改所有卡片区；如果你希望，我建议后续再统一把“候选卡片区”和“主列表区”的分页/折叠策略做一致。

#### C. 加入项目后默认后台下载 PDF（已实施）

拟定目标：

- 用户把论文加入项目后，系统默认开始后台下载 PDF，尽量减少“加入了但还不能读”的断裂。

拟定方案：

- “加入项目”动作完成后，自动把 PDF 下载任务放入后台队列。
- UI 明确显示下载状态：
  - 待下载
  - 下载中
  - 已下载
  - 下载失败，可重试
- 如果论文缺少稳定 PDF 来源：
  - 不阻塞加入项目
  - 但要明确提示“暂时无法自动下载 PDF”
- 阅读器入口在 PDF 未到位时，不再只报错，而是优先提示当前下载状态，并给出“稍后重试 / 手动重试下载”。

建议补充：

- 批量加入大量论文时，下载应限制并发数，避免一次性打满网络与磁盘。
- 设置页可以保留一个开关：`加入项目后自动下载 PDF`，默认开启。

#### D. 周报工作区重构

拟定判断：

- 你现在的感受是对的：当前周报页既占空间，又没有形成真正的“回顾 -> 提炼 -> 成稿”闭环，导致它看起来别扭且鸡肋。

拟定方向：

- 周报页允许大幅重构，不再保留“左侧长上下文、右侧空草稿”的现在式布局。
- 先把它改成更像“周回顾工作台”的 3 段式流程：
  - 第 1 段：选择周期 + 当前周期状态
  - 第 2 段：本周关键信息卡片
    - 新入库论文
    - 重点阅读进展
    - 已提取证据
    - 已记录心得
    - 待处理事项
  - 第 3 段：周报草稿编辑区
- 草稿区建议改为整行宽区域，而不是现在的右侧窄栏。

我的建议：

- 周报不要只服务“生成一篇文本”，更应该服务“帮助你回顾这一周到底做了什么”。
- 因此第一步不急着堆更多写作按钮，而是先把“本周发生了什么”做成可扫读、可核对的摘要。

#### E. 文库里的“我的文献”改为全部已下载 + 分页

拟定目标：

- “我的文献”默认展示所有已下载论文，而不是只展示局部结果。
- 长列表同样分页，保持可扫读。

拟定方案：

- “我的文献”默认筛选为“已下载”。
- 列表支持分页，默认每页 20 篇。
- 第一轮优先保留简单筛选：
  - 全部
  - 已下载
  - 下载失败 / 缺 PDF

建议补充：

- 文库分页和项目论文池分页最好复用同一套分页组件与交互口径，避免两个地方长得完全不同。

#### F. 论文标题中英双语显示（已实施）

拟定目标：

- 每篇论文入库时，保留原始英文标题，同时补一份中文标题，后续列表里优先显示中文，英文作为副标题保留。

拟定方案：

- 入库时新增标题翻译流程，生成 `title_zh`，保留原始 `title_en` / 原始标题字段。
- 列表显示建议为：
  - 主标题：中文标题
  - 副标题：英文原标题
- 如果翻译失败：
  - 不阻塞入库
  - 回退为仅显示原始标题
- 搜索与筛选应同时匹配中英文标题。

建议补充：

- 中文标题最好允许后续手动修正，因为学术标题自动翻译容易出现术语偏差。

#### 建议实施顺序

建议先按下面顺序做，能最快提升你每天实际使用时的顺手程度：

1. 启动入口与“项目”导航改造
2. 加入项目后默认后台下载 PDF
3. 项目工作台论文池分页
4. 文库“我的文献”分页与下载视图
5. 论文标题中英双语显示
6. 周报工作区重构

## 最近完成

### 4F：论文标题中英双语显示

阶段目标：

- 为已入库论文补上稳定的中文标题表达，同时保留原始英文标题，减少列表扫读时的语言切换成本。
- 双语标题先服务于文库、项目工作台、项目搜索工作台和阅读入口的可扫读性，不为了“翻译全覆盖”先把摘要或正文链路一起做大。
- 第一轮优先把存储口径、可见入口、失败兜底与已有翻译能力对齐，避免后面各个列表各自临时翻译。

已完成：

- 论文表新增 `title_zh` 正式字段，并补上 Alembic 迁移；`PaperOut`、文库索引项和相关前端类型同步带出 `title_zh`，让中文标题成为稳定可复用的数据，而不是局部 UI 派生值。
- 新增 `/papers/title-translations/backfill` 批量回填入口，按当前可见论文小批量补中文标题；优先复用已有翻译缓存，只有在拿到可用中文结果时才写入 `title_zh`，不会把“中文辅助占位文案”误写成论文标题。
- 文库、项目工作台、项目搜索工作台、论文工作区、论文阅读器以及基础论文卡片/详情页统一改成“中文主标题 + 英文副标题”显示；无中文标题时平滑回退到原英文标题。
- 文库本地筛选同时匹配中英文标题；项目工作台、项目搜索工作台、论文阅读页和论文工作区会在看到可见论文缺少中文标题时自动尝试后台回填，再静默刷新当前数据。
- 当后端后续拿到更稳定的英文原标题并更新 `title_en` 时，会同步清空旧的 `title_zh`，避免中文标题与最新英文元数据错位。
- 手动调用关键字段翻译时，如果翻译的是论文标题，也会同步回写 `title_zh`，避免翻译表和论文主记录长期分叉。

变更文件：

- `backend/app/models/db/paper_record.py`
- `backend/app/models/schemas/paper.py`
- `backend/app/api/routes/papers.py`
- `backend/app/api/routes/translation.py`
- `backend/app/services/translation/service.py`
- `backend/app/services/paper_search/service.py`
- `backend/app/services/project/service.py`
- `backend/app/services/library/indexing.py`
- `backend/app/db/migrations/versions/20260329_0005_paper_title_zh.py`
- `backend/app/tests/test_translation.py`
- `backend/app/tests/test_library.py`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/presentation.ts`
- `frontend/src/lib/apiPapers.ts`
- `frontend/src/routes/library/LibraryRoute.tsx`
- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/components/projects/ProjectSearchWorkbench.tsx`
- `frontend/src/components/projects/ProjectSearchWorkbenchLayout.tsx`
- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/components/papers/PaperWorkspace.tsx`
- `frontend/src/components/papers/PaperCard.tsx`
- `frontend/src/components/papers/PaperDetail.tsx`
- `frontend/src/styles/globals.css`

验证结果：

- `pytest backend/app/tests/test_translation.py backend/app/tests/test_library.py -q`：通过
- `pytest backend/app/tests/test_projects.py backend/app/tests/test_paper_reader.py -q`：通过
- `cd frontend && npm run build`：通过

下一阶段：

- 进入 `4D：周报工作区重构`

### 补充批次：项目搜索 AI 选文实时进度反馈

阶段目标：

- 让项目搜索工作台里的 AI 选文不再只是“已启动，请等待”的黑盒，而是把当前做到哪一步、还差多少、是否缺经典主干候选直接展示出来。
- 进度反馈优先服务于“等得明白、看得懂、知道要不要继续等”的阅读准备体验，不为了炫技另起一套新任务系统或新轮询协议。
- 第一轮先把后端任务流的阶段进度补齐，并在项目搜索工作台复用已有任务面板收口，不在这一批同时重做搜索布局。

已完成：

- 后端 AI 选文任务新增细粒度阶段进度，按“规划检索 -> 收集候选 -> 去重过滤 -> 重排入选 -> 构建预览 -> 保存预览”持续回流，并补充 `progress_current / progress_total / progress_percent / progress_unit / progress_meta`。
- 项目搜索工作台在启动 AI 选文后会实时订阅任务流，边跑边更新任务面板；不再只靠顶部短提示，而是能看到当前阶段、进度条、候选累计数、已完成检索式数量与缺失经典种子数量。
- AI 选文候选收集阶段改为先按 canonical key 去重、补召回经典主干论文，再继续过滤与重排，避免高相关但偏垂直的候选把经典主干挤掉后，前端还完全看不出任务正在做什么。
- 任务详情流和 SSE 流统一带出新增进度字段，项目搜索工作台与项目工作台可以复用同一套任务进度面板口径，不为 AI 选文单独做一套展示模型。
- 后端测试补上“流式进度事件 + 最终任务详情都带阶段进度”的断言，覆盖 `planning_queries / collecting_candidates / reranking_candidates / saving_preview` 等关键节点。

变更文件：

- `backend/app/api/routes/projects.py`
- `backend/app/models/schemas/project.py`
- `backend/app/services/paper_search/service.py`
- `backend/app/services/project/curation_service.py`
- `backend/app/services/project/service.py`
- `backend/app/tests/test_project_search.py`
- `backend/app/tests/test_projects.py`
- `frontend/src/components/projects/ProjectSearchWorkbench.tsx`
- `frontend/src/components/projects/ProjectSearchWorkbenchLayout.tsx`
- `frontend/src/lib/types.ts`
- `frontend/src/styles/globals.css`

验证结果：

- `pytest backend/app/tests/test_projects.py -q`：通过
- `pytest backend/app/tests/test_project_search.py -q`：通过
- `cd frontend && npm run build`：通过

下一阶段：

- 继续进入 `4F：论文标题中英双语显示`

### 4E：文库“我的文献”分页与已下载视图

阶段目标：

- 让“文库 -> 我的文献”默认直接显示所有已下载论文，不再让已下载内容与其他状态混在一起增加扫读成本。
- 文库列表沿用与项目论文池一致的分页口径，先用稳定的每页分页收口长列表，再决定是否需要更激进的虚拟列表。
- 第一轮优先统一“已下载视图 + 分页 + 总量反馈”，不在这一阶段同时引入新的复杂筛选面板或库内大改版。

已完成：

- 文库页把默认主视图从“我的文献 = is_my_library”收紧为“我的文献（已下载）”，打开文库时优先看到所有本地已下载论文。
- 文库列表新增本地分页，默认每页 20 篇，并在顶部和底部同时给出分页入口；翻页摘要会明确显示当前页码、区间与总量。
- 切换“我的文献（已下载）/ 全部论文”或变更搜索、阅读状态、复现兴趣筛选时，页码会自动回到第一页，避免过滤后停在空页。
- 新增文库 E2E 回归，通过拦截 `/library/list` 返回 27 篇伪造数据，验证“默认已下载、20/页、切到全部后回第一页”的链路。

变更文件：

- `frontend/src/routes/library/LibraryRoute.tsx`
- `frontend/tests/e2e/library.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/library.spec.ts`：通过

下一阶段：

- 进入 `4F：论文标题中英双语显示`

### 4C：项目工作台论文池分页

阶段目标：

- 项目工作台里的论文池不再一次性平铺 100 篇以上论文，先把主列表收口成稳定分页结构。
- 分页要和当前智能视图、阅读接续聚焦、排序语义与批量选中共存，不把既有阅读工作流打散。
- 第一轮优先做低风险分页，不先引入虚拟滚动或大规模列表重构。

已完成：

- 项目论文池新增本地分页，默认每页 20 篇；分页建立在当前“智能视图 + 阅读接续聚焦”组合范围之上，不改后端 workspace 接口。
- 分页后的列表继续保留原有阅读接续分组顺序：先“优先回看”，再“继续阅读”，最后“先留在池里”；只是把当前页内的论文重新按分组回收展示。
- 分页摘要明确显示当前页码、当前页范围与总论文数，顶部与列表底部都保留翻页入口，减少长列表读到底后还要回头翻页的来回。
- 切换智能视图或阅读接续聚焦时，分页会自动回到第一页，避免过滤后停在空页；批量勾选状态仍沿用原有逻辑，不因为分页而丢失当前选区。
- 新增前端 E2E 回归，通过拦截 workspace 响应把论文池扩成 25 篇，验证“20/页、翻页、切换范围回第一页”链路。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "paginates the project paper pool and resets to the first page when scope changes|surfaces reader session state back in the project workspace"`：通过

下一阶段：

- 进入 `4E：文库“我的文献”分页与已下载视图`

### 4B：加入项目后默认后台下载 PDF

阶段目标：

- 用户把论文加入项目后，系统默认开始后台下载 PDF，尽量减少“加入了但还不能读”的断裂。
- 在工作台加入入口和阅读器空态里明确表达当前 PDF 状态，减少用户反复点进阅读器才发现还不能读的试错。
- 第一轮优先复用现有 `fetch_pdfs` 任务链路，不新起一套下载系统。

已完成：

- 项目工作台里的批量加入改为复用 `batchAddProjectPapers`，加入成功后会自动触发既有 `fetch_pdfs` 项目动作，不再要求用户手动再点一次“补 PDF”。
- 项目搜索工作台里的“加入项目 / 批量加入项目”也会在加入成功后自动发起后台 PDF 下载，并在提示文案里直接说明“已开始后台下载 PDF”。
- `fetch_pdfs` 动作启动时会先把论文状态标记为 `queued`，任务真正执行时切到 `downloading`，下载完成后仍沿用既有 `downloaded / error / landing_page_only / missing` 收口。
- 阅读器响应新增 `pdf_status` 与 `pdf_status_message`，无 PDF 时不再只显示泛化空态，而会根据当前状态显示“已排队 / 下载中 / 下载失败 / 暂无可用 PDF”等更贴近现场的提示。
- 阅读器在 `queued` / `downloading` 状态下会自动轮询刷新，用户停在阅读页等待时不需要手动反复重开页面。

变更文件：

- `backend/app/models/schemas/paper.py`
- `backend/app/api/routes/papers.py`
- `backend/app/services/project/service.py`
- `backend/app/tests/test_paper_reader.py`
- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/components/projects/ProjectSearchWorkbench.tsx`
- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/lib/types.ts`

验证结果：

- `pytest backend/app/tests/test_paper_reader.py -q`：7 项通过
- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "surfaces reader continuation cues inside the search workbench"`：通过

下一阶段：

- 进入 `4C：项目工作台论文池分页`

### 4A：默认进入最近项目工作台并收口“项目”导航

阶段目标：

- 应用启动后，如果已有最近打开项目，默认直接进入该项目工作台，而不是先停在项目管理页。
- 顶部导航栏与品牌入口里的“项目”都优先回到最近打开项目，避免在主流程里被打断到“创建项目”页。
- 项目管理入口继续保留，但降为工作台里的弱化按钮，并在不改动既有路由语义的前提下完成收口。

已完成：

- 新增“最近打开项目”前端语义，`/projects` 现在会优先解析最近项目；若存在则直接跳转到 `/projects/:projectId`，否则仍展示项目首页。
- 顶部品牌入口、顶部“项目”导航和侧边栏“项目”入口统一改为优先进入最近项目工作台，减少打开应用后与跨模块返回时的来回跳转。
- 项目管理页改为显式入口 `/projects?view=manage`，项目工作台右上角新增弱化的“项目列表”按钮用于进入管理页。
- 新增 `usePreferredProject` 与对应路由包装，尽量复用现有项目列表查询和后端 `last_opened_at` 排序，不新增额外后端字段。
- 顺手把项目任务进度面板抽成独立组件，避免本轮导航收口继续把工作台主文件往更重的方向堆叠。
- 调整前端 E2E 端口到 `3101`，避开本机 `3001` 被其他本地服务占用时对 Playwright 就绪探测的干扰。

变更文件：

- `frontend/src/lib/routes.ts`
- `frontend/src/lib/usePreferredProject.ts`
- `frontend/src/routes/projects/ProjectsEntryRoute.tsx`
- `frontend/src/desktop/router.tsx`
- `frontend/src/components/layout/Topbar.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/components/projects/ProjectTaskProgressPanel.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`
- `frontend/playwright.config.ts`
- `scripts/run_frontend_e2e.ps1`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "opens the recent project by default and keeps project navigation inside the workspace"`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "surfaces reader continuation cues inside the search workbench"`：通过
- 补充说明：更宽的相关子集里，`supports saved search, triage persistence, ai reasons, and citation add` 仍有既存失败，表现为 AI 理由默认提示没有按旧断言消失；这与本批导航改造不直接相关，后续按阅读体验主线单独处理。

下一阶段：

- 进入 `4B：加入项目后默认后台下载 PDF`

### 3B：主舞台里的接续聚焦提示补足

阶段目标：

- 让主舞台里的范围说明继续补上当前接续聚焦的解释性提示，减少用户还要回论文池顶部看另一句说明文案。
- 继续减少主舞台与论文池顶部之间的信息断裂，让“看懂范围、顺序和聚焦含义”留在同一块区域。
- 继续复用现有前端提示文案，不引入新的后端同步字段或额外状态模型。

已完成：

- 主舞台范围说明新增接续聚焦提示，直接复用论文池顶部已有的聚焦解释文案，不再让用户为“这个聚焦到底筛掉了什么”再往上找说明。
- 聚焦提示会随当前接续状态同步变化，在默认范围、只看先留在池里和只看优先回看时都能给出对应解释。
- 端到端回归补上这些聚焦提示在不同范围下的断言，防止主舞台再次只显示结果和按钮，却少了聚焦语义解释。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `3C：主舞台里的范围说明密度收口`

### 3A：主舞台里的范围排序语义补足

阶段目标：

- 让主舞台里的范围摘要继续带上当前阅读排序语义，减少用户还要回论文池顶部确认“这一组是按什么顺序排的”。
- 继续减少主舞台与论文池顶部提示之间的信息断裂，让“看懂范围”和“看懂顺序”留在同一块区域。
- 继续复用现有前端排序提示，不引入新的后端同步字段或额外状态模型。

已完成：

- 主舞台范围说明新增当前排序提示，直接复用论文池顶部已有的排序语义，不再让用户为“这一组按什么排”再往上找说明。
- 排序提示会随当前接续聚焦同步变化，在默认范围、只看先留在池里和只看优先回看时都能给出对应解释。
- 端到端回归补上这些排序提示在不同范围下的断言，防止后续主舞台再次退回成只展示结果、不解释顺序。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过
  - 首次运行遇到本地 Playwright `webServer` 启动超时，重跑后通过，当前更像环境抖动而非功能回归

下一阶段：

- 进入 `3B：主舞台里的接续聚焦提示补足`

### 2Z：主舞台范围摘要里的总量补足

阶段目标：

- 让主舞台里的范围摘要继续补足“当前范围总共有多少篇、其中多少篇还没建立阅读会话”的直观信息。
- 继续减少“我只看到候选数量，但还要自己心算当前范围到底有多大”的扫读负担。
- 继续复用现有前端派生状态，不引入新的后端同步字段或额外状态模型。

已完成：

- 主舞台摘要条补上“当前范围总篇数 / 已保存会话 / 待安排 / 优先回看”四类总量，减少只看候选卡片数量时的心算负担。
- 同一条摘要会随着范围切换同步更新，在默认范围、状态中心回跳范围和 0 结果范围下都能直接看懂当前范围大小。
- 端到端回归补上这些总量在默认范围、仅看先留在池里和 0 结果组合下的断言，防止后续又退回成只显示局部候选数。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `3A：主舞台里的范围排序语义补足`

### 2Y：主舞台零结果范围的放宽提示

阶段目标：

- 当主舞台当前范围被叠加到 0 篇论文时，明确告诉用户这更像是“范围太窄”，而不是“阅读接续已经空了”。
- 继续减少“我看到的是空状态，但不确定该放宽智能视图还是接续聚焦”的犹豫感。
- 继续复用现有范围来源说明和就地操作按钮，不引入新的后端同步字段或额外状态模型。

已完成：

- 主舞台在当前组合范围缩到 0 篇时，会明确提示这是范围过窄，并直接说明可以通过上方的就地按钮放宽范围。
- 空范围提示会根据当前是智能视图过窄、还是“智能视图 + 接续聚焦”叠得过细，给出更贴近当前状态的放宽建议。
- 端到端回归补上“在智能视图 + 优先回看组合下缩到 0 篇时，主舞台出现放宽提示，并在放宽范围后及时消失”的断言。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2Z：主舞台范围摘要里的总量补足`

### 2X：主舞台里的范围来源操作就地收口

阶段目标：

- 让主舞台里的阅读建议不仅解释“当前范围从哪里来”，还可以直接在这里撤销或收起这层范围。
- 继续减少“已经看到来源说明，但还得回到论文池顶部去找操作按钮”的滚动与视线来回。
- 继续复用现有范围复位动作，不引入新的后端同步字段或额外状态模型。

已完成：

- 主舞台范围说明下方直接镜像论文池顶部的范围操作按钮，在当前区域就能清除接续聚焦、清除智能视图或回到默认范围。
- 这组按钮继续沿用现有范围来源语义和复位逻辑，不新增新的状态分支，确保主舞台和论文池顶部操作保持同一套规则。
- 端到端回归改成直接从主舞台按钮完成范围复位与逐层撤销，验证用户不回到论文池顶部也能完成同一条收口链路。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2Y：主舞台零结果范围的放宽提示`

### 2W：主舞台里的阅读范围来源同步

阶段目标：

- 让论文池主舞台里的阅读建议也带上当前范围来源，避免顶部提示和主舞台摘要仍然像两套上下文。
- 继续减少“我知道列表为什么是这样，但主舞台还是没跟上”的阅读断裂感。
- 继续复用当前范围来源状态、智能视图和阅读接续聚焦，不引入新的后端同步字段。

已完成：

- 主舞台“阅读接续建议”卡片新增范围来源提示，直接复用论文池当前的 `默认范围 / 来自状态中心 / 来自阅读接续聚焦 / 来自智能视图` 语义。
- 主舞台统计区新增“范围来源”迷你指标，让用户在扫读主舞台时就能先确认自己当前处在哪一层阅读范围。
- 主舞台卡片里的范围说明同步展示范围标签、当前组合范围和来源解释，避免顶部范围提示条与主舞台摘要继续各说各话。
- 端到端回归补上“状态中心回跳 / 阅读接续聚焦 / 智能视图切换 / 回到默认范围”四条链路下主舞台范围来源同步的断言，防止后续再次出现上下文错位。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2X：主舞台里的范围来源操作就地收口`

### 2V：论文池范围的分层撤销与局部复位

阶段目标：

- 当用户已经切到某个阅读范围后，允许他按层级撤销，而不是只能一口气回到默认范围。
- 减少“只是想退一步看看更多论文，却被整页重置回起点”的跳变感。
- 继续复用当前智能视图、阅读接续聚焦和来源提示，不引入新的后端状态模型。

已完成：

- 论文池范围提示条新增“按层级撤销”能力：既可以只清除阅读接续聚焦，也可以回到全部论文但保留当前接续聚焦，不再只能整页回到默认范围。
- 智能视图按钮新增稳定测试标识，便于验证“先叠加范围、再逐层撤销”的交互链路，防止后续调整把层级关系弄乱。
- 端到端回归补上“在非默认智能视图中保留优先回看聚焦，然后逐层清除智能视图和接续聚焦”的断言，保证撤销动作确实只退一层。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2W：主舞台里的阅读范围来源同步`

### 2U：论文池里的阅读接续来源提示与一键复位

阶段目标：

- 当用户从状态中心或后续其他入口切回论文池时，显式告诉用户“当前为什么会看到这组论文”，并给出一键回到默认范围的复位入口。
- 继续减少“刚刚从别处跳回来，但现在不确定自己处于哪个阅读范围”的迷失感。
- 继续复用当前前端本地阅读会话、智能视图和接续聚焦状态，不额外引入新的后端同步字段。

已完成：

- 论文池顶部新增范围来源提示条：当范围不是默认状态时，会明确告诉用户当前范围来自“智能视图 / 阅读接续聚焦 / 状态中心”中的哪一条链路。
- 来源提示会直接解释当前为什么会看到这组论文，并把当前范围浓缩成“智能视图 + 阅读接续聚焦”的可读表达，减少跳回论文池后的迷失感。
- 新增“一键回到默认范围”，可以直接恢复到“全部论文 + 全部接续状态”，让用户不必再手动逐个点回去。
- 端到端回归补上“从状态中心回跳后看到来源提示，并且可以一键复位回默认范围”的链路，防止来源提示退化成静态说明文案。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2V：论文池范围的分层撤销与局部复位`

### 2T：状态中心到论文池的阅读接续回跳

阶段目标：

- 让右侧“阅读回流”状态中心不只负责提醒，还能直接把论文池切到对应的阅读接续范围。
- 保持全局阅读回流、论文池当前范围和主舞台阅读建议之间的跳转语义一致，减少看见线索后还要手动再切一轮筛选的摩擦。
- 继续复用当前前端本地阅读会话与论文池接续聚焦，不额外引入新的后端状态同步模型。

已完成：

- 状态中心里的“阅读回流”卡片新增“回到论文池看优先回看 / 继续阅读 / 先留在池里”入口，不再只是告诉用户哪里有积压阅读线索。
- 这些入口会统一把论文池切回“全部论文”并聚焦到对应阅读接续范围，确保右侧全局摘要和主舞台列表说的是同一批论文。
- 端到端回归补上“从状态中心一键切回论文池后，范围会正确切到优先回看或先留在池里”的链路，防止阅读回流再次退化成纯静态提示。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2U：论文池里的阅读接续来源提示与一键复位`

### 2S：项目论文池里的阅读接续筛选与排序一致性

阶段目标：

- 让用户不仅能在论文池里看到“优先回看 / 继续阅读 / 先留在池里”的分层结果，还能进一步按这些阅读接续状态快速筛选与聚焦。
- 保持智能视图、论文池分组和阅读接续排序语义一致，减少切换视图后还要重新肉眼找目标论文的摩擦。
- 继续复用当前前端本地阅读会话与派生状态，不为这一轮引入新的后端排序字段或额外查询。

已完成：

- 项目论文池顶部新增“阅读接续聚焦”，可以在当前智能视图内一键切到“只看优先回看 / 只看继续阅读 / 只看先留在池里”，不用再在整列卡片里重新扫读。
- 当前阅读范围会显式展示排序语义：优先回看按待回看段落数与最近保存时间排序，继续阅读按最近阅读时间排序，先留在池里沿用项目原始排序。
- 项目主舞台和论文池列表现在统一使用“当前范围 = 智能视图 + 阅读接续聚焦”的语义，摘要、分组、批量选中和候选列表不再各说各话。
- 端到端回归新增“切换阅读接续聚焦后，论文池分组会随之收缩并可恢复到全部接续状态”的断言，防止后续改动把当前范围语义悄悄冲掉。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2T：状态中心到论文池的阅读接续回跳`

### 2R：项目论文池里的阅读接续分组

阶段目标：

- 让论文池列表本身按“优先回看 / 继续阅读 / 先留在池里”分层显示，而不是把所有论文平铺在一个列表里。
- 让主舞台给出的阅读接续判断，能在论文池列表里被立刻对应到具体论文，而不是用户还要自己二次扫读。
- 保持现有智能视图、批量操作和本地阅读会话方案稳定，不引入新的后端排序字段。

已完成：

- 项目论文池列表现在会直接分成“优先回看”“继续阅读”“先留在池里”三个阅读接续分组，先把真正需要马上回去看的论文顶出来。
- 分组内排序会优先复用现有本地阅读会话：待回看组按待回看段落数和最近保存时间排序，继续阅读组按最近阅读时间排序，先留在池里组保留原有项目排序。
- 新增端到端断言，覆盖“已有待回看论文进入优先回看分组、未建立会话论文留在先留在池里分组”的链路，保证论文池分组不会悄悄退化回平铺列表。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2S：项目论文池里的阅读接续筛选与排序一致性`

### 2Q：项目论文池里的阅读接续入口

阶段目标：

- 让用户在项目论文池主舞台里看到已经加入项目的论文时，也能直接判断“继续阅读 / 优先回看 / 先留在池里待处理”，而不是先跳去工作台概览或再次打开搜索台。
- 把论文池卡片、项目主舞台和本地阅读会话重新接上，减少“先找到论文池卡片、再回忆是否读过、再切回其他区域确认”的摩擦。
- 延续当前前端本地阅读会话方案，先做低风险的阅读接续可见性增强，不额外引入新的后端阅读同步模型。

已完成：

- 每张项目论文卡片现在都会直接展示“阅读接续”判断：如果有待回看段落，会明确标成“优先回看”；如果已有会话但没有待回看，会标成“继续阅读”；没有会话时则标成“先留在池里”。
- 项目论文卡片上的主按钮已改成跟随阅读状态动态切换，不再把“有待回看段落”的论文继续写成笼统的“继续阅读”。
- 论文池主舞台新增“阅读接续建议”卡片，只看当前智能视图就能快速看到有多少篇可继续阅读、多少篇应优先回看，以及当前最值得回去的候选论文。
- 顺手修复了这一轮里再次暴露出来的 `ProjectWorkspace` hooks 顺序问题，避免项目工作台在加载前后因为派生阅读分组引入 `Rendered more hooks than during the previous render`。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2R：项目论文池里的阅读接续分组`

### 2P：搜索工作台里的阅读接续入口

阶段目标：

- 让用户在项目搜索工作台里重新看到已读过或已经留过待回看标记的论文时，不需要先点进详情再判断“要不要继续读”。
- 把搜索候选、阅读会话和回看入口重新接上，减少“先搜到、再回忆、再重新定位”的链路断裂。
- 优先复用现有本地阅读会话与待回看状态，不为这一轮额外引入新的后端阅读同步模型。

已完成：

- 搜索结果卡片现在会直接显示本地阅读接续状态；如果论文已经有阅读会话，会展示上次停留页码、阅读模式、保存时间，以及是否存在待回看段落。
- 搜索结果行和右侧检查面板都新增了专门的“阅读接续”入口；当存在待回看段落时，入口会从“继续阅读”切换成“优先回看”，把动作语义前置到搜索阶段。
- 右侧检查面板把阅读入口从 AI 理由区独立出来，改成单独的阅读接续卡片，避免“要不要继续读”被埋在推荐理由和引文链下面。
- 顺手修复了 2P 回归里暴露出的两个真实问题：已保存搜索的测试标识前缀冲突，以及返回搜索台后缺失 `paperReaderPath` 导致的运行时报错。
- 新增并修稳端到端回归，覆盖“搜索台展示阅读接续线索”和“已有保存搜索链路不被新入口打断”的组合路径。

变更文件：

- `frontend/src/components/projects/ProjectSearchWorkbench.tsx`
- `frontend/src/components/projects/ProjectSearchWorkbenchLayout.tsx`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "supports saved search, triage persistence, ai reasons, and citation add|surfaces reader continuation cues inside the search workbench|persists revisit markers with the reader session|surfaces reader session state back in the project workspace"`：4 项通过

下一阶段：

- 进入 `2Q：项目论文池里的阅读接续入口`

### 2O：项目工作台里的阅读延续线索

阶段目标：

- 让用户从阅读器回到项目工作台后，能更快看到“刚刚读到哪、接下来该回哪篇论文”。
- 把阅读延续线索和项目任务进度分层呈现，避免工作台再次把阅读上下文冲淡。
- 优先利用现有本地阅读会话、批注和待回看状态，降低重新找回阅读入口的成本。

已完成：

- 在项目工作台的“阅读回流”卡片里新增“优先回看候选”，会从已有本地阅读会话中挑出待回看段落最多、且最近保存过的论文，优先给出回看入口。
- 每个候选会直接展示论文标题、待回看段落数、上次停留页码、阅读模式和段落锚点，减少回到工作台后还要重新判断“应该先回哪篇”的摩擦。
- 顺手修复了工作台里新增回看候选后引入的 hooks 顺序问题，避免项目页首次渲染时因 `Rendered more hooks than during the previous render` 直接报错。
- 新增端到端回归，覆盖“项目工作台会把待回看阅读会话作为优先回看候选显示出来”的链路。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：4 项通过

下一阶段：

- 进入 `2P：搜索工作台里的阅读接续入口`

### 2N：批注回跳与顶部摘要继续去重收口

阶段目标：

- 让从批注工作台、批注快捷入口回到正文后，顶部摘要更明确地说明“当前是被哪条批注带回来的”。
- 继续压低顶部摘要和正文段内批注摘录之间的信息重复，避免同一条内容在多个区域机械重复。
- 保持批注回跳、最近动作、段内摘录和顶部摘要之间的层次稳定，不把摘要区重新做成第二个批注工作台。

已完成：

- 为批注回跳补上来源型上下文：从批注工作台或最近批注快捷入口回到正文时，顶部摘要会直接显示“当前由批注带回”以及对应来源标签。
- 将回跳来源携带的批注内容直接带入顶部摘要，使“回来的就是哪条批注”变成显式反馈，而不再只是笼统的最近动作提示。
- 在存在明确批注回跳来源时，顶部摘要不再重复展示泛化的“当前段落批注”卡片，进一步压低和正文段内摘录之间的信息重复。
- 新增端到端回归，覆盖“从批注工作台回到正文后，顶部摘要显示回跳来源与对应批注内容”的链路。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "keeps the selected quote when continuing into annotation flow|groups annotations into pending and resolved workbench sections|shows which annotation brought the reader back into focus summary|shows inline annotation feedback inside annotated paragraphs|keeps focus summary annotation context synced with the active paragraph|supports keyboard-first reader navigation and actions|keeps locator jumps synced with page state and focus summary|cycles locator matches and keeps match status in sync|highlights locator keywords inside matched paragraphs|keeps quick navigation and figure anchors synced with focus summary|supports a figure-first reading flow|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports desktop-style page navigation and zoom shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays"`：16 项通过

下一阶段：

- 进入 `2O：项目工作台里的阅读延续线索`

### 2M：焦点摘要补充批注上下文

阶段目标：

- 把当前焦点段落的批注上下文带进顶部摘要区，减少键盘跳转后还要回正文重新找提示的摩擦。
- 让“当前正在看的这段已经记过什么”在焦点摘要里可一眼扫到，但不要把顶部摘要做成新的重型工作台。
- 保持顶部摘要、正文段内批注反馈和右侧批注工作台的职责边界清晰，不重复堆叠同一批信息。

已完成：

- 在顶部焦点摘要中新增“当前段落批注”上下文卡片，当前焦点段落已有批注时会直接展示最近一条摘录和批注条数。
- 焦点摘要内的批注上下文已和当前段落联动，切换到其他段落后会同步更新，不再停留在旧焦点的批注内容上。
- 顺手修复了图集 / 浮层刚打开时键盘拦截偶发读取旧状态的 race，避免长回归串跑时快捷键穿透到底层阅读器。
- 新增端到端回归，覆盖“焦点摘要跟随当前段落显示 / 清除批注上下文”的链路。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "keeps the selected quote when continuing into annotation flow|groups annotations into pending and resolved workbench sections|shows inline annotation feedback inside annotated paragraphs|keeps focus summary annotation context synced with the active paragraph|supports keyboard-first reader navigation and actions|keeps locator jumps synced with page state and focus summary|cycles locator matches and keeps match status in sync|highlights locator keywords inside matched paragraphs|keeps quick navigation and figure anchors synced with focus summary|supports a figure-first reading flow|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports desktop-style page navigation and zoom shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays"`：15 项通过

下一阶段：

- 进入 `2N：批注回跳与顶部摘要继续去重收口`

### 2L：批注段落可视化增强

阶段目标：

- 让已有批注在正文流里更容易被再次发现，不只依赖右侧批注工作台回跳。
- 把“这段已经记过什么”压缩成轻量、可扫读的页内反馈，降低回看成本。
- 保持批注提示与搜索命中、当前焦点之间的层次清晰，不互相遮盖主次。

已完成：

- 为已批注段落补上更明确的正文卡片视觉态，让批注不再只体现在通用状态徽标上。
- 将段落级批注状态从泛化的“已批注”升级为 `批注 N 条`，让用户快速判断这一段是否已经多次记录过内容。
- 在已批注段落内新增“最近批注”摘要卡片，把最近一条批注内容直接压缩进正文流，降低回看和复核成本。
- 新增端到端回归，覆盖“保存批注后，正文段落即时出现条数反馈和最近批注摘录”的链路。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "keeps the selected quote when continuing into annotation flow|groups annotations into pending and resolved workbench sections|shows inline annotation feedback inside annotated paragraphs|supports keyboard-first reader navigation and actions|keeps locator jumps synced with page state and focus summary|cycles locator matches and keeps match status in sync|highlights locator keywords inside matched paragraphs|keeps quick navigation and figure anchors synced with focus summary|supports a figure-first reading flow|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports desktop-style page navigation and zoom shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays"`：14 项通过

下一阶段：

- 进入 `2M：焦点摘要补充批注上下文`

### 2K：搜索命中高亮与段内可视反馈

阶段目标：

- 让关键词命中在正文里有更直接的段内高亮，不只停留在命中数和跳转按钮。
- 减少用户跳到命中段落后还要重新扫读整段找关键词的摩擦。
- 保持高亮、批注状态、当前焦点之间的层次清晰，不互相抢夺视觉主次。

已完成：

- 为正文、标题、图注和公式段落补上关键词高亮，让搜索命中不再只体现在“搜索命中”徽标上。
- 为命中高亮补充阅读器局部样式，并针对当前焦点段落做更清晰的层次强化，减少高亮和焦点态打架的感觉。
- 新增端到端回归，覆盖“定位后段落内确实出现关键词高亮”的视觉链路。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "supports keyboard-first reader navigation and actions|keeps locator jumps synced with page state and focus summary|cycles locator matches and keeps match status in sync|highlights locator keywords inside matched paragraphs|keeps quick navigation and figure anchors synced with focus summary|supports a figure-first reading flow|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports desktop-style page navigation and zoom shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays"`：11 项通过

下一阶段：

- 进入 `2L：批注段落可视化增强`

### 2J：搜索命中顺序跳转与结果反馈

阶段目标：

- 为长文档定位补上“上一处 / 下一处”命中顺序跳转，减少重复输入和来回回看导航卡的摩擦。
- 让定位栏直接反馈总命中数、当前位置和无命中状态，降低“到底跳到哪了”的不确定感。
- 确保顺序跳转继续和当前页、当前段落、焦点摘要保持稳定同步。

已完成：

- 为定位栏补上“上一处 / 下一处”按钮，以及 `Enter` / `Shift + Enter` 的顺序跳转语义，让长文档搜索不再只停在首个命中。
- 增加定位状态反馈，直接展示总命中数、当前位置和无命中状态，帮助用户判断自己正处在第几个结果上。
- 搜索命中列表改为展示总命中数，并在结果过多时给出“仅展示前 8 个，其余继续顺序跳转”的提示，避免长文档导航卡无限增长。
- 新增端到端回归，覆盖多命中关键词在长文档里的前进 / 后退循环，以及页码、焦点摘要和命中状态的同步。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "supports keyboard-first reader navigation and actions|keeps locator jumps synced with page state and focus summary|cycles locator matches and keeps match status in sync|keeps quick navigation and figure anchors synced with focus summary|supports a figure-first reading flow|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports desktop-style page navigation and zoom shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays"`：10 项通过

下一阶段：

- 进入 `2K：搜索命中高亮与段内可视反馈`

### 2I：长文档定位与焦点摘要一致性

阶段目标：

- 继续收口长文档阅读中的定位一致性问题。
- 重点观察通过定位输入、快速导航、图像锚点跳转后，当前页、当前段落和焦点摘要是否仍然稳定同步。
- 减少“已经跳到了，但页级状态和焦点提示还在旧位置”的迟滞感。

已完成：

- 修复了阅读器内部 `paragraph_id` URL 同步与“外部指定段落”初始深链之间的串扰，避免内部导航后 recent action 被旧的“指定段落”提示覆盖。
- 为正文段落统一补充 `data-page-no`、`data-paragraph-id` 和稳定的测试标识，便于持续校验页级状态、当前段落和焦点摘要是否一致。
- 定位输入、章节导航、图像锚点、图像扫描跳转、页码跳转等路径统一写入最近动作；在原版页面模式下新增“当前页锚点”提示，减少切模式后的上下文丢失。
- 新增 2 条端到端回归，覆盖“关键词定位后焦点摘要与页码同步”和“章节导航 / 图像锚点后焦点摘要不被旧深链文案反向覆盖”。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "supports keyboard-first reader navigation and actions|supports a figure-first reading flow|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays|supports desktop-style page navigation and zoom shortcuts|keeps locator jumps synced with page state and focus summary|keeps quick navigation and figure anchors synced with focus summary"`：9 项通过

下一阶段：

- 进入 `2J：搜索命中顺序跳转与结果反馈`

### 2H：输入控件的 `Esc` 退回语义

阶段目标：

- 让定位输入框、批注输入框和下拉控件在桌面阅读器里拥有更自然的 `Esc` 退出语义。
- 用户不需要额外点鼠标，也能从输入态回到阅读态继续使用快捷键。

已完成：

- 定位输入框获得焦点时，按 `Esc` 会退出输入态、清掉定位错误提示，并把键盘控制权交还给阅读壳层。
- 批注输入框获得焦点时，按 `Esc` 会退出输入态但保留已输入草稿，不破坏当前编辑内容。
- 页码跳转、阅读宽度、阅读密度、缩放等下拉控件获得焦点时，按 `Esc` 会退出控件并回到阅读壳层。
- 新增回归测试，覆盖“`Esc` 离开输入控件后，快捷键立即恢复”的链路。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "supports keyboard-first reader navigation and actions|pauses reader shortcuts while dropdown controls hold focus|uses escape to leave reader inputs and resume shortcuts|supports escape-based overlay exits and quote cleanup|restores reader keyboard flow after closing overlays|supports desktop-style page navigation and zoom shortcuts"`：6 项通过

下一阶段：

- 进入 `2I：长文档定位与焦点摘要一致性`

### 上一阶段：2G 浮层关闭后的键盘焦点回收

已完成：

- 翻译抽屉、图像预览、图集面板打开时会暂停背景阅读快捷键，避免浮层打开时底层页面误响应键盘操作。
- 浮层通过 `Esc`、关闭按钮或遮罩层关闭后，会主动把焦点交还给阅读壳层。
- “继续写批注”这类需要转交到输入框的路径，会显式把焦点交给批注输入区，而不是先回壳层再跳走。
- 新增回归测试，覆盖“浮层关闭后不用再点一次壳层，也能继续键盘操作”的链路。

### 更早阶段：2F 控件焦点与快捷键隔离

已完成：

- `select / option` 持有焦点时暂停全局阅读快捷键。
- 阅读壳层空白区域补了焦点回收逻辑。

## 已完成阶段总览

### 第一批：阅读连续性与主链路收口

- `1A` 阅读会话恢复与焦点反馈
- `1B` 结构化导航基础
- `1C` 模式切换与选区到批注的连续流
- `1D` 待回看与阅读进度表达
- `1E` 阅读状态回流到项目工作台
- `1F` 辅助文本排版与页内概览
- `1G` 批注工作台分组整理
- `1H` 键盘优先导航与快捷操作
- `1I` 图表优先阅读流
- `1J` 阅读宽度与密度偏好

### 第二批：稳定性与性能收口

- `2A` 长文档页面预览窗口化与图片加载策略收口
- `2B` Windows 风格翻页、缩放与 `Esc` 退回路径补齐
- `2C` 选区上下文稳定保留，滚动后仍可继续翻译/批注/提证据
- `2D` 翻译抽屉、图像预览、图集面板的 `Esc` 退出路径回归补齐
- `2E` 极端样本与回归扩展
- `2F` 控件焦点与快捷键隔离
- `2G` 浮层关闭后的键盘焦点回收
- `2H` 输入控件的 `Esc` 退回语义
- `2I` 长文档定位与焦点摘要一致性
- `2J` 搜索命中顺序跳转与结果反馈
- `2K` 搜索命中高亮与段内可视反馈
- `2L` 批注段落可视化增强
- `2M` 焦点摘要补充批注上下文
- `2N` 批注回跳与顶部摘要继续去重收口
- `2O` 项目工作台里的阅读延续线索
- `2P` 搜索工作台里的阅读接续入口
- `2Q` 项目论文池里的阅读接续入口
- `2R` 项目论文池里的阅读接续分组
- `2S` 项目论文池里的阅读接续筛选与排序一致性
- `2T` 状态中心到论文池的阅读接续回跳
- `2U` 论文池里的阅读接续来源提示与一键复位
- `2V` 论文池范围的分层撤销与局部复位
- `2W` 主舞台里的阅读范围来源同步
- `2X` 主舞台里的范围来源操作就地收口
- `2Y` 主舞台零结果范围的放宽提示
- `2Z` 主舞台范围摘要里的总量补足
- `3A` 主舞台里的范围排序语义补足
- `3B` 主舞台里的接续聚焦提示补足

## 后续待办

### P0：继续压低阅读摩擦

- [x] 完成 `2W`：让主舞台里的阅读建议同步显示当前范围来源，减少列表和摘要之间的上下文错位。
- [x] 完成 `2X`：把主舞台里的范围来源操作也就地收口，减少回到论文池顶部再找复位按钮的来回。
- [x] 完成 `2Y`：当主舞台当前范围缩到 0 篇时，明确提示这是范围过窄并引导用户直接放宽范围。
- [x] 完成 `2Z`：把主舞台范围摘要里的总量补足，减少只看候选数却不知道范围大小的心算成本。
- [x] 完成 `3A`：把主舞台里的范围排序语义也补齐，减少还要回论文池顶部确认排序规则的来回。
- [x] 完成 `3B`：把主舞台里的接续聚焦提示也补齐，减少还要回论文池顶部看另一句说明文案的来回。
- [ ] 做 `3C`：把主舞台里的范围说明继续收口成更紧凑的阅读块，避免信息补齐后显得过散。
- [ ] 继续观察 Windows 下文本选择、滚动、段落定位和键盘焦点之间是否还有残余冲突。
- [ ] 如果再发现高频“刚跳过去但焦点摘要没跟上”的路径，优先补回归再补交互收口。

### P1：面向长论文继续打磨

- [ ] 继续观察极长文档下正文模式、图表流和图集面板的首屏体感。
- [ ] 如果长论文仍有明显热区，再评估更细粒度的窗口策略或局部虚拟化。

### P2：文档与协作维护

- [ ] 每完成一批有意义的阅读器改动，就同步更新本文件。
- [ ] 如出现新的关键实现取舍，同时更新 `DECISIONS.md`。
- [ ] 保持“每个有意义批次都提交并推送”的协作节奏。
