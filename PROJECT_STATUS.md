# 项目状态

更新时间：2026-03-27

## 当前主线

Research Copilot 当前主线已经明确为桌面优先的研究工作台，围绕“项目制研究”组织以下流程：

- 建立研究项目
- 搜索与收集论文
- 进入阅读器深读论文
- 提炼证据、生成对比表和综述草稿
- 进入心得、复现、记忆、周报等后续工作流

当前产品不是以聊天为主入口，也不是以 Web 兼容层为主线。

## 已经落地的能力

- 主入口已经切到 `/projects`，项目工作台是当前主流程。
- 阅读器已经具备项目上下文回跳能力，可从论文页返回项目工作台。
- 阅读器已经有原版页面、辅助文本、论文工作区三种视图。
- 阅读器已经支持页预览、段落定位、图像查看、段落批注、选区翻译、加入项目证据。
- 搜索、心得、复现、记忆等页面已经逐步接入项目上下文。
- 桌面启动链路、自动保存、基础测试与文档口径已经过一轮收口。

## 当前重点

当前最需要投入的一条线不是继续堆新模块，而是提升“阅读体验”。

原因：

- 阅读器已经承载了阅读、翻译、批注、证据提取、项目回流等关键动作。
- 如果阅读链路不顺，后面的证据、心得、复现、周报都会受到影响。
- 目前从代码结构看，能力已经不少，但用户体感仍可能是“能做很多事，却读得不够顺”。

## 阅读体验问题整理

以下是本轮整理出的重点问题，其中一部分是用户直接反馈，一部分是基于当前实现结构总结出的高优先观察点：

### P0：阅读流畅度

- 进入阅读器后，用户需要在“原版页面 / 辅助文本 / 论文工作区”之间频繁切换，阅读主焦点容易丢失。
- 当前段落、批注、翻译结果、证据提取之间的关联感还不够强，读到哪里、刚刚做了什么、下一步该做什么不够一目了然。
- 阅读中断后的恢复体验还不够明确，需要更强的“继续上次阅读”能力。

### P0：可见性与反馈

- 需要更强的段落高亮、命中态、已批注态、已提取证据态反馈。
- 需要让“当前页”“当前段落”“当前项目上下文”持续可见，减少迷失感。
- 选择文本后的翻译、批注、加入证据，应该让结果回显更直接，而不是只停留在一次操作成功提示。

### P1：导航效率

- 长论文需要更快的结构化导航，例如按章节、图表、公式、批注、命中搜索结果跳转。
- 需要更顺的页内跳转与页间切换，降低来回翻找成本。
- 项目工作台、文库、阅读器之间虽然已经打通，但“从哪里来、读完去哪里”还可以继续压缩路径。

### P1：可读性

- 需要继续优化阅读排版，包括正文宽度、行高、留白、视觉层级、重点信息密度。
- 原版页面、辅助文本、批注区之间的主次关系需要更稳定，避免界面元素争抢注意力。
- 图像、标题、正文、公式、caption 的阅读节奏还可以更清晰。

### P2：稳定性与性能

- 长文档、大 PDF、多图论文的切页、缩略图、段落定位需要继续观察性能。
- Windows 桌面环境下的文本选择、滚动、缩放、键盘导航体验值得专项优化。

## 后续待办

### 第一批：优先做

- [x] 增加阅读会话恢复：记住上次阅读的论文、页码、段落、视图模式。
- [x] 强化当前段落的视觉锚点，并同步显示“已批注 / 已加入证据 / 命中搜索”等状态。
- [x] 优化阅读器顶层信息条，让项目上下文、当前页、当前段落状态更稳定可见。
- [x] 收敛选区翻译、批注、加入证据的交互链路，减少重复操作和视线跳转。
- [x] 明确阅读完成度表达，例如最近打开、阅读进度、待回看段落、未处理批注。

### 第二批：紧接着做

- [x] 增加结构化导航面板：章节、图表、批注、搜索命中快速跳转。
- [x] 优化辅助文本阅读排版，提升长段落可读性。
- [x] 增加更清晰的阅读模式切换逻辑，降低 page/text/workspace 三种模式之间的切换成本。
- [x] 让项目工作台中的论文池与阅读器之间共享更明确的阅读状态。
- [x] 补一轮围绕阅读器主路径的 E2E 与回归测试。

### 第三批：可选增强

- [x] 增加键盘优先操作，例如页切换、段落跳转、批注保存、回到项目。
- [x] 增加阅读器侧的批注汇总与待处理视图。
- [x] 增加图表优先阅读流，适合先扫图、后精读正文的论文阅读习惯。
- [ ] 评估是否需要提供轻量化阅读主题配置，例如字体大小、密度、宽度偏好。

## 建议的实施顺序

1. 先做“阅读会话恢复 + 当前焦点强化 + 操作反馈回显”。
2. 再做“结构化导航 + 排版优化 + 模式切换收敛”。
3. 最后补“键盘效率、主题偏好、批注汇总”等增强项。

## 维护规则

- 每完成一批有意义的产品或工程改动，就更新一次本文件。
- 新增待办时，优先按 P0 / P1 / P2 归类，而不是简单堆列表。
- 如果产品主线发生变化，需要同步更新 `README.md`、`AGENTS.md` 和本文件。

## 阶段推进记录

### 2026-03-27 · 阶段 1A：阅读会话恢复与焦点反馈

阶段目标：

- 让阅读器能恢复上次阅读位置，而不是每次都从头找回上下文。
- 让“当前正在读哪里、刚刚做了什么”在界面上更稳定可见。

已完成：

- 阅读器现在会按论文粒度记住上次的页码、段落、视图模式和缩放比例。
- 重新打开同一篇论文后，会自动恢复到上次阅读位置，并在界面中显示恢复提示。
- 阅读器新增焦点摘要区，持续显示当前阅读位置、最近一次阅读动作和焦点状态。
- 辅助文本段落新增状态徽标，能更直观看到当前焦点、搜索命中、已批注、刚翻译、已加入证据等状态。
- 翻译、保存批注、加入项目证据后，会同步更新段落反馈与焦点提示，不再只依赖一次性成功消息。
- 增加了一条 E2E 回归测试，覆盖“刷新后恢复阅读会话”。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/lib/paperReaderSession.ts`
- `frontend/src/styles/globals.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload"`：通过
- 首次 Playwright 运行因为本地前后端拉起耗时较长而触发工具超时，延长等待窗口后验证通过

下一阶段：

- 阶段 1B：结构化导航与阅读模式收敛
- 优先做章节 / 图表 / 批注 / 搜索命中的快速跳转
- 继续优化 page / text / workspace 三种阅读模式之间的主次关系
- 补更多围绕阅读器主链路的回归测试

### 2026-03-27 · 阶段 1B：结构化导航基础

阶段目标：

- 让用户在长论文里能更快跳章节、找图像、回批注、回搜索命中。
- 先用轻量化导航结构降低查找成本，不急着引入更重的阅读器侧栏体系。

已完成：

- 阅读器新增结构化导航卡，提供章节导航、图像跳转、批注回跳、搜索命中快速跳转。
- 章节导航基于已解析的 heading 段落。
- 图像跳转基于已提取图像，点击后会切到对应页并打开图像面板。
- 批注回跳会展示最近更新的批注，便于在阅读与记录之间来回切换。
- 搜索命中区会把当前关键词的命中结果整理成可快速跳转的列表。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/globals.css`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload"`：通过

下一阶段：

- 阶段 1C：阅读模式收敛与交互链路压缩
- 继续降低 page / text / workspace 三种模式之间的切换成本
- 优化翻译、批注、加入证据这三条操作链的主次关系与连续性
- 继续补阅读器主链路的回归测试

### 2026-03-27 · 阶段 1C：阅读模式收敛与交互链路压缩

阶段目标：

- 把选区翻译、写批注、加入证据这几条高频动作串成连续流程。
- 减少 page / text / workspace 三种模式切换时的犹豫成本。

已完成：

- 阅读器现在会保留当前选区引用，用户可以从选区直接切入批注流，而不必重新选一次文本。
- 选区浮动工具条改成一组连续动作：英译中、写批注、加入证据板。
- 翻译完成后会保留引用原文，方便继续写批注或加入项目证据板。
- 批注面板新增引用原文区的快捷动作，可继续翻译、加入证据板或清空引用。
- 顶部新增模式引导区，明确三种阅读模式各自适合的任务，并提供直接跳转按钮。
- 为了避免把阅读器增强样式混入其他全局样式修改，本轮新增了独立的阅读器增强样式文件。
- 新增一条 E2E 回归测试，覆盖“保留选区后继续进入批注流”。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/main.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`
- `AGENTS.md`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "keeps the selected quote when continuing into annotation flow|restores the last reader session after reload"`：通过

下一阶段：

- 阶段 1D：阅读完成度与状态回流
- 明确最近阅读、待回看段落、未处理批注、阅读进度等状态表达
- 继续把阅读器状态同步回项目工作台与论文池
- 扩展阅读器主链路的回归测试覆盖面

### 2026-03-27 · 阶段 1D：阅读完成度与状态回流

阶段目标：

- 把“读到哪了、哪些段落还要回看、最近什么时候打开过”这些状态显性化。
- 先用低风险的本地会话方案把阅读状态表达做起来，再评估是否需要后端同步。

已完成：

- 阅读器焦点摘要区现在会显示阅读进度百分比、待回看段落数、累计批注数和最近打开时间。
- 新增“待回看”段落标记能力，可对当前段落标记或取消标记。
- 待回看段落会进入结构化导航卡，便于后续快速回跳。
- 待回看状态已并入本地阅读会话，刷新或重新进入论文后仍会保留。
- 新增一条 E2E 回归测试，覆盖“待回看标记会随阅读会话保留”。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/lib/paperReaderSession.ts`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|keeps the selected quote when continuing into annotation flow|persists revisit markers with the reader session"`：通过

下一阶段：

- 阶段 1E：阅读状态回流到项目工作台
- 让论文池里能更明确看到最近阅读、待回看、批注密度等状态
- 继续扩展阅读器与项目工作台之间的状态联动
- 逐步补齐阅读器主链路回归测试

### 2026-03-27 · 阶段 1E：阅读状态回流到项目工作台

阶段目标：

- 让项目工作台里的论文卡片不再只显示“静态收集状态”，而是能直接看见最近阅读和待回看线索。
- 先复用前端本地阅读会话，把“继续阅读”入口和阅读概览做出来，再决定是否需要后端同步。

已完成：

- 项目工作台现在会按论文读取本地阅读会话，并把阅读状态回流到论文池卡片。
- 论文卡片新增“阅读会话已保存”“待回看 X 段”“停在第 X 页”等线索，帮助快速恢复上下文。
- 如果某篇论文已有本地阅读会话，论文池里的主入口会从“打开高级阅读器”切换为“继续阅读”，并优先回到记住的段落。
- 右侧状态中心新增“阅读回流”概览，可直接看到已保存会话数、待回看分布和最近阅读入口。
- 新增一条 E2E 回归测试，覆盖“从阅读器返回项目工作台后，阅读状态会回流到论文卡片与概览”。

变更文件：

- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|keeps the selected quote when continuing into annotation flow|persists revisit markers with the reader session|surfaces reader session state back in the project workspace"`：通过

下一阶段：

- 阶段 1F：辅助文本排版与阅读密度优化
- 收窄长段落阅读宽度，提升正文、标题、图注、公式之间的视觉节奏
- 在辅助文本模式里补更清晰的页内阅读提示，减少“翻到这一页后先看哪里”的犹豫
- 继续补一轮和阅读主链路强相关的验证

### 2026-03-27 · 阶段 1F：辅助文本排版与阅读密度优化

阶段目标：

- 让辅助文本模式不只是“可操作”，还要更适合连续精读长段正文。
- 通过收窄正文阅读列、强化页内概览和阅读提示，降低用户翻到新一页后的重新定向成本。

已完成：

- 辅助文本模式新增“本页阅读概览”，会直接显示正文段落数、章节锚点、图示 / 公式数量和待回看段落数。
- 阅读概览会根据当前页状态给出更具体的阅读提示，例如当前焦点预览、已有批注提示或“这一页建议对照原版页面”的提醒。
- 辅助文本正文区现在会把实际阅读列收窄到更适合长段落连续阅读的宽度，并重新整理段落间距、卡片边界和标题节奏。
- 标题、图注、公式和正文块的视觉层级进一步拉开，减少所有段落“长得都一样”带来的阅读疲劳。
- 新增一条 E2E 回归测试，覆盖“辅助文本模式会显示页内概览，且待回看数量会跟着交互更新”。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|keeps the selected quote when continuing into annotation flow|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode"`：通过

下一阶段：

- 阶段 1G：阅读器侧批注汇总与待处理视图
- 继续把“当前页批注”提升为更清晰的待处理工作面，而不只是列表展示
- 让用户更快分辨哪些批注已消化、哪些还需要回写到证据或心得
- 在不打断阅读主链路的前提下，继续压缩记录整理成本

### 2026-03-27 · 阶段 1G：阅读器侧批注汇总与待处理视图

阶段目标：

- 把阅读器里的“当前页批注”升级成更明确的批注工作台，而不只是静态列表。
- 让用户能快速判断哪些批注还需要处理，哪些已经沉淀进当前项目证据或阅读结论。

已完成：

- 阅读器新增“批注工作台”，按“待处理批注 / 当前页批注 / 最近已沉淀”三个区块组织全文批注。
- 批注工作台会把当前项目下尚未进入证据板的批注识别为待处理项，并保留“待回看”作为优先处理信号。
- 工作台顶部新增摘要卡，集中显示待处理数量、当前页数量、已进证据数量与当前焦点关联情况。
- 点击任意批注卡片后，会自动回到对应段落，恢复引用原文，并提示下一步可继续补证据或复核沉淀结果。
- 保存批注后会立刻把新批注回填到当前阅读器状态与 Query 缓存里，避免刚保存就看不到记录的割裂感。
- 新增一条 E2E 回归测试，覆盖“批注会进入待处理区，并在加入项目证据后转入已沉淀区”。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/lib/apiPapers.ts`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode|groups annotations into pending and resolved workbench sections"`：通过

下一阶段：

- 阶段 1H：键盘优先导航与阅读快捷操作
- 先补页切换、模式切换、回到项目、聚焦搜索等高频快捷操作，减少鼠标来回移动
- 让阅读器在 Windows 桌面环境里更接近“可连续操作”的研究工具，而不是只能点按的页面
- 继续围绕阅读主链路补回归测试，避免快捷键引入焦点或输入冲突

### 2026-03-27 · 阶段 1H：键盘优先导航与阅读快捷操作

阶段目标：

- 让阅读器在 Windows 桌面环境里具备一条更顺手的键盘优先操作链，而不必频繁来回点按钮。
- 把快捷操作做成“可发现”的能力，避免功能存在但只有作者自己知道。

已完成：

- 阅读器新增一组可发现的快捷键提示条，直接展示 `/` 聚焦定位、`j / k` 跳段、`← / →` 翻页、`p / t / w` 切模式、`Ctrl + Enter` 保存批注、`b` 返回项目。
- 新增键盘快捷操作支持：聚焦定位输入框、在当前页内前后跳段、切换三种阅读模式、从阅读器快速返回项目工作台。
- 批注输入框支持 `Ctrl + Enter` 快速保存，减少从键盘回到鼠标再点保存的中断。
- 阅读器壳层补充可聚焦状态，进入阅读后更容易承接后续键盘操作。
- 新增一条 E2E 回归测试，覆盖“通过键盘切模式、聚焦定位、跳段、快捷保存批注并返回项目”的主路径。

变更文件：

- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode|groups annotations into pending and resolved workbench sections|supports keyboard-first reader navigation and actions"`：通过

下一阶段：

- 阶段 1I：图表优先阅读流
- 优先把“先扫图、再回正文”的阅读习惯显性化，让图示密集论文更容易快速建立全局判断
- 尽量复用当前阅读器已有的图像提取、页面预览和结构化导航能力，避免为 1I 引入重型新布局
- 继续补围绕图像跳转与阅读回流的验证

### 2026-03-27 · 阶段 1I：图表优先阅读流

阶段目标：

- 让“先扫图、再回正文”的阅读习惯在阅读器里变成一条显性的轻量流程，而不是只能靠用户自己来回切页。
- 优先复用已有的图像提取、页面预览和正文锚点能力，不为这一阶段引入重型新布局。

已完成：

- 为 E2E 种子论文补充了真实可提取的图示页，确保图表优先流有稳定的验证样本。
- 阅读器新增“图表优先阅读”卡片，集中展示全文图像数量、覆盖页面和建议先看的图像页。
- 每条图示现在都支持“先看图”和“回到正文锚点”两步操作，能先打开图像预览，再回到锚点段落核对论证。
- 辅助文本模式的页内提示会在当前页存在图像时，明确提示先扫图再回正文，减少图示密集页的犹豫。
- 新增一条 E2E 回归测试，覆盖“从图表优先流打开图像预览，再回到正文锚点”的主路径。

变更文件：

- `backend/app/tests/e2e_seed.py`
- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode|groups annotations into pending and resolved workbench sections|supports keyboard-first reader navigation and actions|supports a figure-first reading flow"`：通过

下一阶段：

- 阶段 1J：轻量阅读主题与密度偏好
- 先评估并补最小可用的字体大小、阅读宽度或密度偏好，而不是一次做完整主题系统
- 让个性化配置保持在阅读器局部，不扩散到全局界面基线
- 继续补验证，避免偏好设置和阅读会话、模式切换互相打架
