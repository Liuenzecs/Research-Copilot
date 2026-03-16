# Research Copilot 下一步执行清单

## 当前状态

- “三次做完剩余代办”的执行计划已经全部完成
- 当前 14 项核心收口任务已完成
- 主链路现状：
  - 独立论文阅读页 + 论文工作区主链路稳定
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

### 第六次稳定性修补：首屏 API 不可达兜底

- [x] `dashboard` 首屏接口失败时改为页面内错误提示
- [x] `library` 首屏接口失败时改为页面内错误提示
- [x] `weekly-report` 历史草稿加载失败时改为页面内错误提示
- [x] `Failed to fetch` 改为更明确的中文后端连接错误说明

### 第七次界面收口：独立论文阅读页 + 顶栏导航化 + 选词翻译

- [x] 左侧边栏与右侧上下文面板移除
- [x] 顶栏承载主导航并新增“功能说明”抽屉
- [x] `/search` 改为纯论文搜索页
- [x] 新增 `/papers/[paperId]` 独立论文阅读页
- [x] 兼容旧 `/search?paper_id=...&summary_id=...` 深链自动跳转
- [x] 阅读页默认展示本地 PDF 解析正文
- [x] 阅读页支持选中文本后触发翻译
- [x] 选词翻译优先走 LibreTranslate 兼容公共接口
- [x] 公共接口不可用时回退到本地辅助翻译
- [x] `PaperWorkspace` 作为阅读页中的次级业务面复用
- [x] 文献库入口改为指向独立阅读页并修正操作区布局
- [x] 设置页补充翻译接口配置状态展示

### 第八次稳定性修补：长期记忆持久化路径锁定 + 最近记忆可见性

- [x] 运行时数据路径对历史 `backend/backend/data` 漂移路径自动收口
- [x] 新增 `GET /memory` 最近记忆列表接口
- [x] `memory` 页面默认展示最近写入的长期记忆
- [x] 空查询时自动回到最近记忆视图
- [x] 补充路径规范化与最近记忆列表测试

### 第九次交互收口：设置页运行路径可见化 + 去 ID 化入口

- [x] 设置页显示实际数据库路径、数据目录与向量目录
- [x] 设置页提示历史 runtime 目录已自动收口
- [x] 复现页移除手工输入 `paper_id / reproduction_id` 的主要入口
- [x] 复现页改为按论文标题搜索进入
- [x] 复现页补充最近复现记录列表
- [x] 反思卡片减少 raw ID 主文案外露

## 当前剩余事项

这部分不再属于本轮必须完成项，仅保留为后续可选工作：

- [ ] 阅读页段落定位 / 批注高亮
- [ ] 选词翻译历史与复用
- [ ] 顶栏帮助抽屉支持版本更新记录
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

### 第十次收口：去 ID 暴露与中文文案补齐

- [x] `dashboard` 中的反思与任务列表不再显示 `#id`
- [x] `reproduction` 页上下文说明不再向用户暴露 `paper_id / reproduction_id`
- [x] `PaperWorkspace` 的摘要上下文与论文心得标题不再显示 raw ID
- [x] `WeeklyReportPanel` 的论文入口统一跳到 `/papers/[paperId]`
- [x] `ReproStepTracker` 的步骤编辑/日志入口标题改为自然中文
- [x] 高频页面中的 `paper-only` 文案统一收口为“仅论文上下文”
- [x] 复现步骤状态选择器改为中文标签

### 当前剩余可选优化

- [x] 阅读页支持按关键词定位正文段落
- [x] 阅读页支持点击段落高亮并保留当前位置
- [x] 阅读页支持上一段 / 下一段快速切换
- [x] 阅读页支持 `paragraph_id` 深链
- [x] 阅读页支持段落批注与批注回看
- [x] 阅读页支持结构化正文重建
- [x] 阅读页支持页面预览缩略图条
- [x] 阅读页支持近正文图片插入与补充图片区
- [x] 阅读页支持图片放大预览
- [x] 阅读页切换为按页阅读模式
- [x] 阅读页正文改为连续排版，不再逐段卡片化
- [x] 选词翻译增加缓存复用
- [x] 选词翻译拦截英译英结果并固定回中文辅助输出
- [x] 选词翻译切换为 DeepSeek 优先链路
- [x] 新增流式选词翻译接口与阅读页流式展示
- [x] 快速总结支持流式输出并在结束后落库
- [x] 深度总结支持流式输出并在结束后落库
- [ ] 选词翻译增加历史复用与最近记录
- [ ] Memory 结果补更多对象标题与来源解释
- [ ] 周报历史列表增加轻量筛选
- [ ] 顶栏帮助抽屉增加版本更新记录

补充说明：

- 本批已完成 `pytest backend/app/tests -q`
- 本批已完成 `npm run build`
- 当前更值得继续优化的是阅读页微交互，而不是再扩新工作面

---

## 已完成：阅读主链路重做

- [x] 搜索链路固定为 arXiv only
- [x] 顶栏新增 `阅读` 主入口，并将搜索改为放大镜图标
- [x] `/library` 收口成“阅读入口 / 我的文献库”
- [x] 文献库补齐已下载、已入记忆、摘要、心得、复现等状态标签
- [x] 文献库支持按标题 / 作者 / 来源 / 年份筛选
- [x] 阅读页新增“阅读视图 / 论文工作区”切换
- [x] 选词翻译改为底部抽屉
- [x] 图片改为“本页图集”面板 + 更大的放大预览
- [x] 帮助抽屉和设置页文案同步收口
- [x] 本批已通过 `pytest backend/app/tests -q`
- [x] 本批已通过 `npm run build`
