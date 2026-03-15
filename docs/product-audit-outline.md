# Research Copilot 产品审计与迭代纲要

本文档用于记录当前仓库的产品定位、阶段判断、已完成批次与暂缓事项。

## 产品定位

- 本地优先
- 单用户研究工作台
- 面向真实周节奏科研使用
- 核心不是“通用聊天”，而是“论文—复现—心得—周报—记忆”的连续工作流

## 当前阶段判断

当前项目已经进入“可日常使用的单人研究工作台”阶段：

- 独立论文阅读页已成为新的论文主入口，`Paper Workspace` 作为其中的业务工作面继续复用
- `paper -> summary -> reflection -> memory` 主链路可用
- `paper -> repo candidates -> reproduction` 已经闭环
- `reproduction` 已具备计划、步骤、日志、阻塞与心得回流
- `weekly report` 已具备严格按周上下文、历史快照与精确回跳
- `memory` 已具备精确回跳与列表内解释

当前不再优先扩展大功能面，而是继续保持：

- 工作流闭环清晰
- Chinese-first 体验一致
- 页面状态提示自然
- 回跳链路稳定

## 已完成批次

### 第一批：论文工作区到复现工作区的闭环修顺

完成日期：2026-03-15

已完成：

- 修正 `Paper Workspace` 的摘要语义
- 支持真正的“当前查看摘要 / 不绑定摘要”
- 从论文工作区进入 `/reproduction?paper_id=<id>`
- 复现页自动搜索 repo candidates
- 自动续接该论文最近一条 reproduction
- 新增 `GET /reproduction`
- `POST /repos/find` 改为应用层复用，避免重复 repo 记录

### 第二批：复现工作区细化 + blocker/log 正式接入

完成日期：2026-03-15

已完成：

- 复现页顶部上下文状态区补齐
- `ReproStepTracker` 升级为步骤卡片视图
- 正式接入步骤级 `reproduction_logs`
- 支持 `note / blocker` 两类日志
- blocker 日志自动将步骤切到 `blocked`
- 本地 `log_analyzer` 输出 `error_type / next_step_suggestion`
- 复现页 warning / empty / notice 文案收口

### 第三批：周报上下文修整 + 周报回跳闭环

完成日期：2026-03-15

已完成：

- `weekly report context` 改为严格按周过滤
- 周报左侧面板补齐五段内容
- paper / reproduction 条目支持精确回跳
- 历史草稿打开时使用 `source_snapshot_json`
- 周报 markdown 与左侧上下文对齐
- reproduction 页面剩余提示与 reflection 回流文案收口

### 第四批：Memory 精确回跳 + 页面状态统一 + Chinese-first 收敛

完成日期：2026-03-15

已完成：

- `memory/query` 返回 `jump_target`
- memory 结果支持精确回跳到 `paper / reproduction / reflection / brainstorm`
- `SearchPage` 支持 `paper_id + summary_id`
- `ReflectionsPage` 支持 `reflection_id`
- 新增统一状态组件 `StatusBanner / StatusStack`
- 多个主页面统一 notice / warning / error 呈现
- memory 页面与部分表单继续收口为 Chinese-first
- 页面零散 `fetch` 收回到 `frontend/src/lib/api.ts`

### 第五批：周报编辑收口 + 周节奏时间线 + Memory 可解释性补齐

完成日期：2026-03-15

已完成：

- 周报页支持“当前周已有草稿”时的分流选择
  - 继续最近草稿
  - 新建一份草稿
  - 取消
- 新增最小 `ChoiceDialog` 组件
- `ReportDraftEditor` 支持：
  - 中文状态显示
  - 草稿元信息展示
  - dirty state 检测
  - “恢复到已保存版本”
- 历史草稿列表支持：
  - 当前草稿高亮
  - 本周草稿标记
  - 周范围 / 更新时间展示
- `GET /reflections` 新增 `is_report_worthy` 筛选
- `reflections` 页面改为周节奏优先：
  - 默认本周
  - 今天 / 昨天 / 本周 / 上周 / 最近30天 / 全部
  - 心得类型 / 生命周期 / 仅可汇报筛选
  - 顶部 summary 行
- `memory` 列表新增：
  - `retrieval_mode`
  - `match_reason`
  - `context_hint`
- `memory` 列表改为“类型 + 层级 + 摘要 + 解释 + 回跳”
- `dashboard` 不再直接暴露 raw `task_type / status`
- 新增共享 presentation helper，统一中文标签与时间展示

### 第六次稳定性修补：首屏 API 不可达兜底

完成日期：2026-03-16

已完成：

- `dashboard` 首屏加载失败时改为页面内错误提示，不再抛出未捕获运行时异常
- `library` 首屏加载失败时改为页面内错误提示
- `weekly-report` 历史草稿首屏加载失败时改为页面内错误提示
- `frontend/src/lib/api.ts` 将原始 `Failed to fetch` 收口为更明确的中文网络错误说明

### 第七次界面收口：独立论文阅读页 + 顶栏导航化 + 选词翻译

完成日期：2026-03-16

已完成：

- 左侧边栏与右侧上下文面板移除，主导航统一迁到顶部 `Topbar`
- 顶栏新增“功能说明”抽屉，使用用户向说明内容介绍主工作流
- `/search` 改为纯论文搜索页，不再内嵌右半屏 `Paper Workspace`
- 新增 `/papers/[paperId]` 独立论文阅读页，作为新的论文主入口
- 保留旧深链兼容：访问 `/search?paper_id=...&summary_id=...` 会自动跳到新阅读页
- 阅读页默认展示本地 PDF 解析正文，支持更舒适的全宽阅读排版
- 解析正文支持选词翻译，优先走 LibreTranslate 兼容公共接口，失败时回退到本地辅助结果
- `PaperWorkspace` 改为可嵌入的独立业务面，在阅读页中作为次级工作区复用
- 文献库入口与结果卡片改为指向独立阅读页，并修正文案与操作区布局
- 设置页补充公共翻译接口的只读配置状态展示

## 当前结论

本轮“三次做完剩余代办”的主目标已全部完成。

当前仓库更适合继续做：

- 小范围稳定性修补
- 真实使用后的交互微调
- 少量对象解释性增强
- 阅读页细节与阅读体验继续打磨

不建议现在立即进入：

- memory graph 真图谱化
- profile 面板扩展
- 新增独立工作面
- 大范围架构重写

## 暂缓项

以下内容继续列为 `Defer`：

- memory graph 真图谱化
- researcher profile 面板
- repo 独立工作面
- task 独立工作面
- 更大范围的 hooks / store / 路由重构

## 维护规则

每次完成一批计划后：

1. 更新“已完成批次”
2. 删去已完成的待办
3. 仅保留真实仍未完成的 defer 项
4. 保持文档与仓库代码状态一致
