# Research Copilot 下一步执行清单

## 当前状态

- “三次做完剩余代办”的执行计划已经全部完成
- 当前 14 项核心收口任务已完成
- 主链路现状：
  - 论文工作区稳定
  - 复现工作区具备计划、步骤、日志、阻塞与心得回流
  - 周报具备严格按周上下文、历史快照与继续编辑分流
  - 心得页具备周节奏筛选与深链高亮
  - Memory 具备精确回跳与列表内可解释性

## 最近完成

### 第一批：论文工作区到复现工作区的闭环修顺

- [x] 修正 `Paper Workspace` 摘要语义
- [x] 从论文页进入 `/reproduction?paper_id=<id>`
- [x] 自动搜索 repo candidates
- [x] 自动续接最近一条 reproduction
- [x] 新增 `GET /reproduction`
- [x] `POST /repos/find` 幂等复用 repo 记录

### 第二批：复现工作区细化 + blocker/log 正式接入

- [x] 复现页顶部上下文状态区
- [x] Step Tracker 升级为步骤卡片
- [x] 正式接入步骤级 `reproduction_logs`
- [x] blocker 日志自动切到 `blocked`
- [x] `log_analyzer` 输出错误类型与下一步建议
- [x] 复现页 warning / empty / notice 收口

### 第三批：周报上下文修整 + 周报回跳闭环

- [x] 周报上下文严格按周过滤
- [x] 左侧面板完整展示五段内容
- [x] paper / reproduction 精确回跳
- [x] 历史草稿显示 snapshot
- [x] reproduction 剩余提示文案收口

### 第四批：Memory 精确回跳 + 页面状态统一 + Chinese-first 收敛

- [x] memory 精确回跳
- [x] `search` 支持 `paper_id + summary_id`
- [x] `reflections` 支持 `reflection_id`
- [x] 统一页面状态提示
- [x] memory / reflection / brainstorm 等页面继续 Chinese-first 收口

### 第五批：周报编辑收口 + 周节奏时间线 + Memory 可解释性补齐

- [x] 周报“继续最近草稿 / 新建一份草稿”分流
- [x] 新增最小 `ChoiceDialog`
- [x] 周报编辑器 dirty state + 恢复已保存版本
- [x] 历史草稿高亮、本周标记、更新时间展示
- [x] `GET /reflections` 支持 `is_report_worthy`
- [x] 心得页默认本周 + 周节奏 preset
- [x] 心得页顶部 summary 行
- [x] memory 返回 `retrieval_mode / match_reason / context_hint`
- [x] memory 列表展示可解释性说明
- [x] dashboard 中文化常见任务类型与状态

## 当前剩余事项

这部分不再属于本轮必须完成项，仅保留为后续可选工作：

- [ ] memory graph 真图谱化
- [ ] researcher profile 面板增强
- [ ] repo 独立工作面
- [ ] task 独立工作面
- [ ] 更大范围的状态管理 / 架构重整

## 验证记录

- [x] `pytest backend/app/tests -q`
- [x] `npm run build`

## 维护规则

后续如果继续开发，请保持：

1. 先明确批次范围，再动代码
2. 每批完成后同步更新本文件与 `docs/product-audit-outline.md`
3. 优先做闭环修顺，不随意扩展新工作面
4. 继续以单用户、本地优先、Chinese-first 为默认标准
