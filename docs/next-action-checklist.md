# Next Action Checklist

本文件用于记录“已完成什么、下一批做什么、暂缓什么”。  
要求：每完成一批计划后，必须同步更新本文件。

---

## 最近完成

### 第一批：论文工作区到复现工作区的闭环修顺

完成日期：2026-03-15

已完成：

- [x] 修正 `Paper Workspace` 摘要选择器语义
- [x] 默认展示当前选中摘要，而不是总是最新摘要
- [x] 支持真实的“不绑定摘要”状态
- [x] paper-only reflection 创建时不发送 `summary_id`
- [x] 在 `Paper Workspace` 增加“进入复现工作区”按钮
- [x] reproduction 页面支持 `paper_id / reproduction_id`
- [x] 自动搜索 repo candidates
- [x] 自动打开最近一条 reproduction
- [x] 新增 `GET /reproduction`
- [x] `POST /repos/find` 改为应用层幂等复用

### 第二批：复现工作区细化 + blocker/log 正式接入

完成日期：2026-03-15

已完成：

- [x] 补齐 reproduction 顶部上下文状态区
- [x] 明确区分“继续最近一次复现 / 查看指定复现 / 准备新建复现”
- [x] 展示当前论文上下文、复现状态、进度摘要与最后更新时间
- [x] 明确展示 repo 语义与 paper-only 语义
- [x] 将 `ReproStepTracker` 升级为步骤卡片视图
- [x] 展示 `purpose`
- [x] 展示 `risk_level`
- [x] 展示 `expected_output`
- [x] 展示 `requires_manual_confirm`
- [x] 展示 `safe / safety_reason`
- [x] 正式接入步骤级 `reproduction_logs`
- [x] 新增步骤日志写入接口
- [x] `GET /reproduction/{id}` 返回日志列表
- [x] 支持 `note / blocker` 两类日志
- [x] blocker 日志自动将步骤标记为 `blocked`
- [x] 扩展本地日志分析，生成 `error_type / next_step_suggestion`
- [x] 增加后端回归测试
- [x] 前端通过 `npm run build`

本批明确未做：

- [ ] 自动执行命令并自动采集日志
- [ ] 文件型日志上传
- [ ] reproduction 级全局日志页
- [ ] 独立 blocker dashboard
- [ ] 周报链路修整
- [ ] memory graph / memory 管理 UI
- [ ] profile 面板

### 第三批：周报上下文修整 + 周报回跳闭环 + 复现页剩余提示收口

完成日期：2026-03-15

已完成：

- [x] `weekly report` 上下文改为严格按周过滤
- [x] 周报上下文改为强类型对象返回
- [x] “最近论文”改为“本周有研究动作的论文”
- [x] 周报左侧面板补齐五段内容
- [x] 论文条目支持回跳到 `/search?paper_id=...`
- [x] 复现进展与 blocker 条目支持回跳到 `/reproduction?reproduction_id=...`
- [x] 打开历史草稿时显示该 draft 的历史快照
- [x] 点击“加载上下文”后可切回 live context
- [x] 周报 markdown 与严格周过滤上下文对齐
- [x] 复现页剩余 warning / empty / loading / notice 文案继续收口
- [x] report-worthy reproduction reflection 创建后提示其可进入周报上下文
- [x] 新增周报后端集成测试
- [x] 后端回归测试全部通过
- [x] 前端通过 `npm run build`

本批明确未做：

- [ ] reflection 精确回跳
- [ ] memory / profile 扩展
- [ ] 新工作面扩展
- [ ] 数据库迁移扩展

### 第四批：第二次收口批 —— Memory 精确回跳 + 页面状态统一 + Chinese-first 收敛

完成日期：2026-03-15

已完成：

- [x] `memory/query` 返回 `jump_target`
- [x] memory 结果支持精确回跳到 paper / reproduction / reflection / brainstorm
- [x] `SearchPage` 支持 `paper_id + summary_id`
- [x] `Paper Workspace` 支持自动选中指定 summary
- [x] `Reflections` 页面支持 `reflection_id`
- [x] 指定 reflection 可插入时间线并高亮
- [x] 新增统一页面状态组件 `StatusBanner / StatusStack`
- [x] `search / paper workspace / reproduction / weekly-report / memory / reflection editor / brainstorm` 接入统一状态提示
- [x] memory 页面进一步改为 Chinese-first
- [x] 心得模板不再直接暴露内部字段名占位文案
- [x] 前端零散直接 `fetch` 收回到 `lib/api.ts`
- [x] 新增 memory jump target 后端测试
- [x] 后端回归测试全部通过
- [x] 前端通过 `npm run build`

本批明确未做：

- [ ] memory graph 真图谱化
- [ ] profile 面板扩展
- [ ] reflection 独立详情页
- [ ] summary 独立详情页
- [ ] 大范围 hooks / store 重构

---

## Fix Soon

这部分代表“高价值、低到中等成本、建议下一批直接做”。

- [x] 当前这组 `Fix Soon` 已完成
- [x] 下一批直接转入 `Improve Next`

---

## Improve Next

- [ ] 周报编辑器与历史草稿管理的小范围交互打磨
- [ ] timeline / filters 更贴近单人周节奏研究使用
- [ ] memory 面板的可解释性与上下文提示增强
- [ ] 继续减少页面层对内部字段名的直接暴露

---

## Defer

- [ ] memory graph 真正图谱化
- [ ] researcher profile 面板
- [ ] repo 独立工作面
- [ ] task 独立工作面
- [ ] 更大范围的路由 / 服务层重构

---

## 维护规则

每次完成一批计划后：

1. 更新“最近完成”
2. 调整 `Fix Soon / Improve Next / Defer`
3. 删除已经过时的待办
4. 保持与实际代码状态一致
