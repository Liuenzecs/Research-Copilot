# 项目状态

更新时间：2026-03-27

## 当前优先级

当前最高优先级仍然是“阅读体验”。

我们近期的判断保持不变：

- 优先减少阅读中断、上下文丢失、图文来回切换和证据提取摩擦。
- 在没有明显收益前，不优先扩展与阅读主链路无关的新交互面。
- 改动优先选择低风险、可回归、可在 Windows 桌面环境稳定复用的方案。

## 当前阶段

### 2J：搜索命中顺序跳转与结果反馈

阶段目标：

- 为长文档定位补上“上一处 / 下一处”命中顺序跳转，减少重复输入和来回回看导航卡的摩擦。
- 让定位栏直接反馈总命中数、当前位置和无命中状态，降低“到底跳到哪了”的不确定感。
- 确保顺序跳转继续和当前页、当前段落、焦点摘要保持稳定同步。

## 最近完成

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

## 后续待办

### P0：继续压低阅读摩擦

- [ ] 做 `2J`：为搜索命中补上一处 / 下一处顺序跳转和当前位置反馈，降低长文档里反复输入同一关键词的摩擦。
- [ ] 继续观察 Windows 下文本选择、滚动、段落定位和键盘焦点之间是否还有残余冲突。
- [ ] 如果再发现高频“刚跳过去但焦点摘要没跟上”的路径，优先补回归再补交互收口。

### P1：面向长论文继续打磨

- [ ] 继续观察极长文档下正文模式、图表流和图集面板的首屏体感。
- [ ] 如果长论文仍有明显热区，再评估更细粒度的窗口策略或局部虚拟化。

### P2：文档与协作维护

- [ ] 每完成一批有意义的阅读器改动，就同步更新本文件。
- [ ] 如出现新的关键实现取舍，同时更新 `DECISIONS.md`。
- [ ] 保持“每个有意义批次都提交并推送”的协作节奏。
