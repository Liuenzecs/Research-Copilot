# Research Copilot 产品审计与迭代纲要

本文件用于沉淀当前仓库的产品判断、架构边界与阶段性完成情况。  
产品定位保持不变：

- 本地优先
- 单用户
- 面向真实周节奏科研使用
- 不是通用聊天机器人

---

## 当前阶段判断

当前项目处于“可持续迭代的早期研究工作台”阶段，已经明显超过纯原型，但仍然在集中打磨高频主链路。

当前最稳定的主轴：

- `Paper Workspace` 已成为论文中心工作面
- paper → summary → reflection → memory 主链路已可用
- reproduction 已具备对象模型、步骤跟踪、安全边界与 reflection 接口

当前仍需持续盯住的风险：

- workflow 是否真的闭环，而不是“每个页面单独能用”
- 页面之间是否还会丢失上下文
- 数据对象是否能回跳到原上下文，而不只是“能存”
- 前端是否持续保持 Chinese-first，而不是暴露内部字段语义

---

## 已完成批次记录

### 第一批：论文工作区到复现工作区的闭环修顺

完成日期：2026-03-15

本批已完成：

- 修正 `Paper Workspace` 的摘要语义
- 默认展示当前选中摘要，而不是总是展示最新摘要
- 支持真实的“不绑定摘要”状态
- 创建 paper reflection 时，paper-only 情况不再发送 `summary_id`
- 从 `Paper Workspace` 跳转到 `/reproduction?paper_id=<id>`
- reproduction 页面支持 `paper_id / reproduction_id` 上下文
- 自动搜索 repo candidates
- 自动查找并优先续做最近一条 reproduction
- 新增 `GET /reproduction`
- `POST /repos/find` 改为应用层幂等复用

明确未做：

- 周报准确性修整
- memory graph / memory 管理 UI
- profile 面板

### 第二批：复现工作区细化 + blocker/log 正式接入

完成日期：2026-03-15

本批已完成：

- 补齐 reproduction 顶部上下文状态区
  - 明确区分“继续最近一次复现 / 查看指定复现 / 准备新建复现”
  - 展示当前论文上下文、复现状态、进度摘要、最后更新时间
  - 明确展示 repo 语义或 paper-only 语义
- 将 `ReproStepTracker` 从简表升级为步骤卡片视图
  - 展示 `purpose`
  - 展示 `risk_level`
  - 展示 `expected_output`
  - 展示 `requires_manual_confirm`
  - 展示 `safe / safety_reason`
  - 展示更完整的 `progress_note / blocker_reason`
- 正式接入步骤级 `reproduction_logs`
  - 新增步骤级日志写入接口
  - `GET /reproduction/{id}` 返回日志列表
  - 支持 `note / blocker` 两类日志
  - blocker 日志会自动把步骤标记为 `blocked`
- 扩展本地 `log_analyzer`
  - 输出 `error_type`
  - 输出 `next_step_suggestion`
  - 默认使用本地启发式，不引入新模型依赖
- 补齐复现页关键空态 / warning / notice 文案
- 增加后端回归测试并通过前端构建验证

明确未做：

- 自动执行命令并自动采集日志
- 文件型日志上传
- reproduction 级全局日志页
- 独立 blocker dashboard

---

## 当前产品主轴

### 1. 论文工作流

目标链路：

- 搜索
- 下载
- 摘要
- reflection
- memory

当前判断：

- 主链路已经清晰
- `Paper Workspace` 仍应保持为 canonical paper-centered UI
- 下一阶段不宜再把论文页做成“大而全”，而应继续保证向下游工作面顺滑跳转

### 2. 复现工作流

目标链路：

- 论文上下文进入
- repo candidates
- reproduction planning
- step tracking
- blocker/log handling
- reproduction reflection

当前判断：

- 从论文进入复现的上游入口已经打通
- 当前复现页已不再只是“生成计划页”，而更接近真实执行面
- 下一阶段重点应转向更细的执行信息与后续回流，而不是继续扩张新页面

### 3. 周报工作流

目标链路：

- reflections / tasks / reproduction progress 聚合
- weekly draft 生成
- 编辑与定稿

当前判断：

- 功能骨架已在，但产品可信度还不如 paper / reproduction 主链路
- 目前仍不应插队到最高优先级

### 4. Memory 工作流

目标链路：

- 存储
- 检索
- 链接
- 回跳原上下文

当前判断：

- 现有 memory 仍偏“存得进去”，不够“跳得回来”
- 现在可以继续 defer，不必抢在 reproduction 后面立即展开

---

## 当前优先级判断

### Fix Soon

- 继续打磨 reproduction 细节中的结果回流与后续操作提示
- 让周报上下文更真实反映最近 paper / reproduction 进展
- 继续保持每批完成后同步更新规划文档与清单

### Improve Next

- weekly report 上下文展示修整
- memory 命中后的精确回跳
- Chinese-first 文案统一
- 前端 API 调用风格继续收敛

### Defer

- memory graph 真图谱化
- researcher profile 面板
- repo / task 独立工作面
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
