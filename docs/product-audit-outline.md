# Research Copilot 产品审计与迭代纲要

本文件用于沉淀当前仓库的产品判断、架构边界与阶段性完成情况。
定位前提保持不变：

- 本地优先
- 单用户
- 面向真实周节奏科研使用
- 不是通用聊天机器人

---

## 当前阶段判断

当前项目已经超过“纯原型”阶段，处于“可持续迭代的早期研究工作台”阶段。

已经比较明确的强项：

- `Paper Workspace` 已经成为论文中心工作面
- 论文搜索、下载、摘要、研究状态、reflection、memory 推送已经形成主链路
- reproduction 已具备后端对象模型、步骤跟踪、reflection 与执行安全边界

当前仍然需要持续盯住的风险：

- workflow 是否真的闭环，而不是“每个页面单独能用”
- 页面之间是否会丢失上下文
- 数据对象是否有“能存但不好回跳”的问题
- 前端交互是否继续滑向“工程演示型界面”

---

## 已完成批次记录

### 第一批：论文工作区到复现工作区的闭环修顺

完成日期：2026-03-15

本批已完成：

- 修正 `Paper Workspace` 的摘要语义
  - 摘要选择器现在同时控制“当前展示摘要”和“reflection 默认绑定摘要”
  - 默认选中第一条摘要
  - 选择“不绑定摘要”时不再回退到第一条摘要
  - 创建 paper reflection 时，paper-only 情况不会再发送 `summary_id`
- 在 `Paper Workspace` 增加“进入复现工作区”入口
  - 跳转到 `/reproduction?paper_id=<id>`
  - 不在论文页内联展开 reproduction UI
- 打通复现页的 query context
  - 支持 `paper_id`
  - 支持 `reproduction_id`
  - `reproduction_id` 优先级高于 `paper_id`
- 复现页支持自动拉起上游上下文
  - 带 `paper_id` 进入时自动查 paper
  - 自动搜索 repo 候选
  - 自动查询最近更新的 reproduction
  - 若存在最近记录则优先继续
  - 同时保留“新建新的复现记录”
- repo 搜索改为应用层幂等复用
  - 同一 `paper_id + repo_url` 重复搜索不再重复落库
  - 无 `paper_id` 时按 `repo_url` 复用
  - 复用已有 repo 时不重复创建 `RepoMemory`
- 新增 `GET /reproduction`
  - 支持按 `paper_id` / `repo_id` 查询
  - 支持 `limit`
  - 按 `updated_at DESC` 返回
- 补充后端测试与构建验证
  - reproduction 最近记录查询
  - repo 查重复用
  - paper-only reflection 回归
  - reproduction 基本流程回归

本批明确未做：

- 周报准确性修整
- memory graph/UI 扩展
- profile 面板扩展
- 更大范围的架构重写

---

## 产品审计主轴

后续仍按以下六个轴持续审视：

### 1. 论文工作流

目标链路：

- 搜索
- 下载
- 摘要
- reflection
- memory

重点关注：

- 摘要展示与摘要绑定是否一致
- 论文主工作台是否仍是信息最集中的入口
- paper-only 与 summary-bound 两种模式是否都清晰

### 2. 复现工作流

目标链路：

- 论文上下文进入
- repo candidates
- reproduction planning
- step tracking
- blocker handling
- reproduction reflection

重点关注：

- 能否低摩擦地继续最近一次 reproduction
- 能否在 repo 质量一般时仍然走通 paper-only 复现
- reproduction detail 是否逐步承载更完整的执行上下文

### 3. 周报工作流

目标链路：

- reflections / tasks / reproduction progress 聚合
- weekly draft 生成
- 编辑与定稿

重点关注：

- 时间范围是否准确
- 是否真正适合导师周报，而不是“看起来像周报”
- 周报条目能否精确回跳到 paper / reproduction

### 4. memory 工作流

目标链路：

- 存储
- 检索
- 链接
- 回跳原上下文

重点关注：

- memory 命中后是否能快速返回原对象
- summary / reflection / repro memory 是否语义足够明确
- archive / link 机制是否真正进入使用流

### 5. 架构边界

持续要求：

- routes 只处理 HTTP concerns
- services 承载业务逻辑
- db / schema / domain 分层不继续漂移
- `Paper Workspace` 保持 paper-centered canonical UI

### 6. 可靠性

持续要求：

- 核心 workflow 有回归测试
- 自动化验证覆盖高频路径
- 测试环境与真实研究数据库隔离

---

## 当前优先级判断

### Fix Soon

- 继续打磨 reproduction detail 面板，让步骤上下文更完整
- 补强最近 reproduction 的前端提示与回流细节
- 把本批完成项持续同步到产品文档与清单中

### Improve Next

- 周报上下文展示修整
- memory 命中后的精确回跳
- Chinese-first 文案统一

### Defer

- memory graph 真图谱化
- researcher profile 面板
- repo / task 独立重工作面
- 大规模架构整理

---

## 文档维护约定

以后每完成一批计划，都要同步更新：

- `docs/product-audit-outline.md`
- `docs/next-action-checklist.md`

更新要求：

- 写明本批完成内容
- 标注未做范围
- 调整下一批优先项
- 保持文档与仓库状态一致
