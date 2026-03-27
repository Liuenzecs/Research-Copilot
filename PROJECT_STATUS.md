# 项目状态

更新时间：2026-03-27

## 当前优先级

当前最高优先级仍然是“阅读体验”。

我们近期的判断保持不变：

- 优先减少阅读中断、上下文丢失、图文来回切换和证据提取摩擦。
- 在没有明显收益前，不优先扩展与阅读主链路无关的新交互面。
- 改动优先选择低风险、可回归、可在 Windows 桌面环境稳定复用的方案。

## 当前阶段

### 2F：控件焦点与快捷键隔离

阶段目标：

- 继续收口 Windows 下的阅读器焦点稳定性问题。
- 优先处理页码跳转、缩放、阅读偏好等下拉控件获得焦点后，不应误触全局阅读快捷键的问题。
- 保持“控件操作时由控件接管键盘，回到阅读壳层后快捷键恢复”的一致心智。

## 本轮已完成

### 2E：极端样本与回归扩展

阶段目标：

- 把长文档、多图论文这类边界样本补齐，避免阅读器只在普通样本上表现稳定。
- 控制图表优先阅读流的默认体积，避免多图论文把首页卡片拉得过长。
- 扩大回归覆盖，确保新增边界样本不会打散已有阅读主路径。

已完成：

- E2E 种子里的 `E2E Retrieval Study for Evidence Synthesis` 扩展为 7 张图像的多图论文样本。
- 多图样本改用固定色板生成图像页，避免 RGB 颜色溢出导致的 PDF 生成不稳定。
- 阅读器中的“图表优先阅读”卡片现在会按页码和图像编号稳定排序。
- 图表流继续保持有上限的轻量卡片展示，只默认显示前 6 张图像。
- 当论文图像总数超过默认展示上限时，会显示明确的溢出提示，提醒用户继续通过图像跳转、页面图集或原版页面查看剩余图像。
- 回归测试补充了“多图论文下图表流仍保持有界”的断言。

变更文件：

- `backend/app/tests/e2e_seed.py`
- `frontend/src/components/papers/PaperReaderScreen.tsx`
- `frontend/src/styles/paper-reader-enhancements.css`
- `frontend/tests/e2e/project-workspace.spec.ts`

验证结果：

- `python -m py_compile backend/app/tests/e2e_seed.py`：通过
- `cd frontend && npm run build`：通过
- `cd frontend && npx playwright test tests/e2e/project-workspace.spec.ts --grep "restores the last reader session after reload|keeps the selected quote when continuing into annotation flow|persists revisit markers with the reader session|surfaces reader session state back in the project workspace|shows a page-level reading overview in text mode|groups annotations into pending and resolved workbench sections|supports keyboard-first reader navigation and actions|supports a figure-first reading flow|keeps the multi-figure flow bounded for figure-heavy papers|persists local reader layout preferences|keeps the page preview strip compact for long documents|supports desktop-style page navigation and zoom shortcuts|keeps quote actions accessible after scrolling a text selection|supports escape-based overlay exits and quote cleanup"`：14 项通过

下一阶段：

- 进入 `2F：控件焦点与快捷键隔离`

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

## 后续待办

### P0：继续压低阅读摩擦

- [ ] 补 `2F`：让页码跳转、缩放、阅读偏好等下拉控件获得焦点后，不再误触全局快捷键。
- [ ] 继续观察 Windows 下文本选择、滚动、段落定位和键盘焦点之间是否还有残余冲突。
- [ ] 如果再发现高频“刚操作控件就误切模式/翻页”的路径，优先补回归再补交互收口。

### P1：面向长论文继续打磨

- [ ] 继续观察极长文档下正文模式、图表流和图集面板的首屏体感。
- [ ] 如果长论文仍有明显热区，再评估更细粒度的窗口策略或局部虚拟化。

### P2：文档与协作维护

- [ ] 每完成一批有意义的阅读器改动，就同步更新本文件。
- [ ] 如出现新的关键实现取舍，同时更新 `DECISIONS.md`。
- [ ] 保持“每个有意义批次都提交并推送”的协作节奏。
