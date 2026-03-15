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
- [x] 跳转约定为 `/reproduction?paper_id=<id>`
- [x] reproduction 页面支持读取 `paper_id`
- [x] reproduction 页面支持读取 `reproduction_id`
- [x] `reproduction_id` 优先于 `paper_id`
- [x] 带 `paper_id` 进入时自动搜索 repo candidates
- [x] 带 `paper_id` 进入时自动查最近一条 reproduction
- [x] 若有历史 reproduction，自动打开最近一条继续推进
- [x] 同时保留“新建新的复现记录”
- [x] 支持选择 repo 生成 reproduction plan
- [x] 支持不选 repo、直接按 paper-only 生成 plan
- [x] 新增 `GET /reproduction`
- [x] `POST /repos/find` 改为应用层幂等复用
- [x] 增加相关后端回归测试
- [x] 前端通过 `npm run build`

本批未做：

- [ ] 周报链路修整
- [ ] memory graph / memory 管理 UI
- [ ] profile 面板
- [ ] 大范围架构重写

---

## Fix Soon

这部分代表“高价值、低到中等成本、建议下一批直接做”。

- [ ] 完善 reproduction detail 顶部状态提示
- [ ] 在 reproduction step 面板展示 `purpose`
- [ ] 在 reproduction step 面板展示 `risk_level`
- [ ] 在 reproduction step 面板展示 `expected_output`
- [ ] 在 reproduction step 面板展示 `safe / safety_reason`
- [ ] 明确区分继续最近复现与新建复现的提示文案
- [ ] 复查复现页异常态、空态、加载态的中文文案一致性

---

## Improve Next

- [ ] 修正 weekly report 上下文展示
- [ ] 让 weekly report 更容易回跳到具体 paper / reproduction
- [ ] 改善 memory 检索结果的精确回跳
- [ ] 统一前端 Chinese-first 文案
- [ ] 收敛前端页面层直接处理 API 细节的写法

---

## Defer

- [ ] memory graph 真正图谱化
- [ ] researcher profile 面板
- [ ] repo 独立工作面
- [ ] task 独立工作面
- [ ] 更大范围的路由/服务层重构

---

## 维护规则

每次完成一批计划后：

1. 更新“最近完成”
2. 调整 `Fix Soon / Improve Next / Defer`
3. 删除已经过时的待办
4. 保持与实际代码状态一致
