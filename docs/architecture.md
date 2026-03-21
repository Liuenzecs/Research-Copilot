# 架构说明

## 文档目的

这份文档描述当前 `Research Copilot` 主线的系统架构与实现边界。

当前口径以桌面版为准：

- 桌面壳：`Tauri v2`
- 前端：`Vite + React + React Router + TanStack Query`
- 后端：`FastAPI`
- 本地存储：`SQLite + local filesystem + Chroma`
- 当前主目标平台：`Windows`

本项目已经不再把 `Next.js Web` 运行时作为当前主线。

## 一句话概览

Research Copilot 是一个面向研究工作流的桌面工作台。它围绕“项目制研究”组织论文检索、阅读、证据提炼、心得、复现和周报，而不是把 AI 对话本身当作产品主入口。

## 架构总览

系统由四层组成：

1. 桌面宿主层
   - 由 `Tauri` 提供窗口、运行时命令、目录能力和 sidecar 生命周期管理。
2. 前端交互层
   - 由 `React SPA` 提供页面路由、工作台 UI、缓存和交互状态。
3. 后端服务层
   - 由 `FastAPI` 提供项目、论文、搜索、心得、复现、周报、设置等 HTTP API。
4. 本地数据层
   - 由 `SQLite + 文件系统 + Chroma` 提供结构化数据、PDF/派生资产和向量检索能力。

## 核心产品原则

- `项目优先`
  - 主入口是研究项目，不是全局聊天窗口，也不是传统“全局文献库优先”心智。
- `桌面优先`
  - 当前主线围绕本地桌面应用设计，不再以 Web 运行时为主要兼容目标。
- `本地优先`
  - 数据默认保存在本机，桌面安装版写入用户目录，开发态写入仓库内开发数据目录。
- `中文优先`
  - UI、导航、提示、操作语义优先使用中文。
- `canonical 内容尊重原文`
  - 论文标题、原文段落、来源元数据等内容保持原始语义，不强行中文化。

## 桌面运行架构

### 运行形态

桌面版采用 `Tauri + Python FastAPI sidecar` 架构：

- 前端渲染在 Tauri 窗口内
- 后端不是独立给用户手动运行的长期服务
- 应用启动时由 Tauri 自动拉起本地 FastAPI sidecar
- 应用退出时 sidecar 随桌面壳一起退出

### 启动链路

当前桌面启动流程如下：

1. Tauri 创建窗口
2. 解析桌面数据目录和日志目录
3. 选择一个可用的本地 `127.0.0.1` 端口
4. 以 sidecar 方式启动后端
5. 轮询 `/health` 等待后端就绪
6. 将运行时配置暴露给前端
7. 前端从启动页切换到业务页面

这样做的目的有两点：

- 避免首屏长时间黑屏等待
- 避免让用户手动开第二个终端窗口

### 运行时配置

桌面壳会向前端暴露这些关键运行时信息：

- `api_base`
- `app_data_dir`
- `logs_dir`
- `platform`
- `is_desktop`
- `backend_status`
- `backend_stage`
- `backend_error`
- `app_version`
- `build_timestamp`
- `git_commit`
- `build_mode`
- `executable_path`

这些信息用于：

- 启动页展示当前阶段与错误
- 设置页展示构建身份与路径
- 前端决定当前是否已可安全进入业务路由

## 前端架构

### 目录分层

前端当前按以下方式组织：

- `frontend/src/routes`
  - 页面级入口层
  - 每个主路径对应一个 route component
- `frontend/src/components`
  - 可复用组件与复杂业务组件
- `frontend/src/desktop`
  - 桌面启动壳、启动页、路由装配
- `frontend/src/lib`
  - API 客户端、运行时配置、Query、类型、常量、展示辅助逻辑
- `frontend/src-tauri`
  - Tauri Rust 宿主、能力声明、打包配置

### 页面组织

当前主路由语义保持稳定：

- `/projects`
- `/projects/:projectId`
- `/papers/:paperId`
- `/search`
- `/library`
- `/reflections`
- `/reproduction`
- `/memory`
- `/dashboard/weekly-report`
- `/settings`

### 状态管理

前端状态分为三类：

1. 服务器状态
   - 使用 `TanStack Query` 管理查询缓存、失效和刷新。
2. 桌面运行时状态
   - 使用运行时配置轮询机制管理后端是否就绪、路径信息和构建身份。
3. 本地展示状态
   - 用于控制当前标签、折叠展开、筛选面板等纯 UI 状态。

### 流式任务与长操作

一些较重的项目动作并不是同步一次返回，而是通过任务流推进，例如：

- AI 选文
- 批量补 PDF
- 元数据刷新
- 批量摘要/证据提取

这类流程通常具备：

- 后端任务记录
- NDJSON 或轮询式进度更新
- 前端状态中心或任务区展示当前阶段

## 后端架构

### 风格

后端采用 `FastAPI` 模块化单体架构：

- API 层负责 HTTP 契约与参数校验
- Service 层负责业务逻辑与工作流编排
- Model 层负责数据库记录、领域模型和返回 schema
- DB 层负责会话、初始化和 Alembic 迁移

### 目录职责

- `backend/app/api/routes`
  - 各业务域 HTTP 路由
- `backend/app/services`
  - 搜索、项目、论文、总结、心得、复现、翻译、周报等服务
- `backend/app/models/db`
  - SQLAlchemy 持久化记录
- `backend/app/models/schemas`
  - Pydantic 输入输出结构
- `backend/app/models/domain`
  - 领域语义对象
- `backend/app/db/migrations`
  - Alembic 迁移
- `backend/app/core`
  - 配置、日志、运行时设置等底层能力

### 主要 API 域

当前后端主要围绕这些域组织：

- `projects`
- `papers`
- `summaries`
- `reflections`
- `reproduction`
- `reports`
- `memory`
- `translation`
- `settings`
- `tasks`

## 核心业务对象

### 论文与研究状态

论文是系统中的基础对象，但不直接代表“研究上下文”。

与论文相关的关键对象包括：

- `papers`
  - 论文基础元数据
  - 来源标识
  - PDF/链接/引用计数等信息
- `paper_research_state`
  - 研究状态
  - 例如：
    - `reading_status`
    - `repro_interest`
    - `is_core_paper`
    - `read_at`
    - `last_opened_at`

当前时间语义做了明确拆分：

- `read_at`
  - 用户认定的“这篇论文算作哪天已读”
- `last_opened_at`
  - 系统层面的最近一次打开时间

### 项目

项目是当前产品的主上下文对象。

一个项目通常包含：

- 研究问题与目标
- 项目论文池
- 搜索运行历史
- 已保存搜索
- 候选筛选状态
- 证据卡
- 输出物
  - 对比表
  - 综述稿
- 项目活动事件

### 搜索相关对象

项目搜索当前不是“只打一遍就消失的临时搜索”，而是有持久化结构：

- `ResearchProjectSearchRun`
  - 每次搜索运行的历史快照
- `ResearchProjectSavedSearch`
  - 可重跑、可更新的保存搜索
- `ResearchProjectSavedSearchCandidate`
  - 某个保存搜索下的候选论文与 triage 状态

这让系统可以支持：

- 保存搜索
- 搜索历史
- 候选筛选
- AI 选文预览
- 重跑后保留已有筛选状态

### 证据与输出

项目写作相关对象分成两层：

1. 证据层
   - 从论文摘要、段落、阅读理解中提炼出的证据卡
2. 输出层
   - 面向整理和汇报的产物
   - 例如综述稿、对比表等

系统当前已经支持把证据与综述稿引用关系进行结构化记录，而不是只保留一段无法追溯来源的自由文本。

### 心得与复现

- `reflections`
  - 用于记录论文心得、批判阅读、导师汇报草稿等结构化思考结果
- `reproductions`
  - 用于管理复现计划、步骤状态、日志与阻塞信息

它们不是通用“便签”，而是研究流程中的一等对象。

### 周报与活动事件

周报依赖项目上下文和活动事件生成。

当前项目活动会记录诸如：

- 搜索
- 加入论文
- 候选状态变化
- 证据创建/编辑
- 综述稿写作引用
- 重复项合并
- 周报生成

这些事件既用于工作台时间线，也用于周报上下文聚合。

## 搜索架构

### 数据源

当前搜索主要复用这些来源：

- `arXiv`
- `OpenAlex`
- `Semantic Scholar`

### 策略

搜索逻辑目前以“高精度优先”为主：

1. 多源收集候选
2. 去重与元数据合并
3. 先拦离题结果
4. 再按复合相关性排序

重点原则是：

- 先挡掉明显离题内容
- 标题命中优先于摘要命中
- 规则解释要稳定返回
- 不在普通热路径里强依赖额外 AI rerank

### AI 选文

项目内的“AI 帮我挑论文”不是独立的第二套系统，而是建立在项目搜索能力之上：

- 将需求改写成多条子查询
- 收集更大候选池
- 去重、过滤、重排
- 生成 `ai_curated` 类型保存搜索
- 先给预览，再由用户确认批量加入项目

## 模型与外部服务架构

当前后端支持多种 LLM 提供方式：

- `openai`
- `deepseek`
- `openai_compatible`
- `fallback`

其中 `openai_compatible` 用于接入兼容 OpenAI 请求格式的第三方网关。

模型配置遵循两层来源：

1. 环境变量默认值
2. 桌面运行时 UI 可编辑覆盖

桌面 UI 的可编辑配置会持久化到当前桌面数据目录下的：

- `config/ui_settings.json`

## 数据与路径约定

### 开发态

仓库内开发态默认使用：

- 数据目录：`backend/data`
- 数据库：`backend/data/research_copilot.db`

### 安装后的桌面版

桌面安装版使用 Tauri 解析出的用户目录，不与仓库开发数据混用。

桌面版运行时至少会准备：

- 数据目录
- 日志目录
- 向量目录
- SQLite 数据库文件

## 审计与可追踪性

系统并不是“只保留最终结果”，而是尽量保留过程痕迹。

当前可追踪性主要来自两类机制：

1. `tasks` 与 `task_artifacts`
   - 记录较重工作流的输入、状态、输出和工件
2. `project_activity_events`
   - 记录项目层级的重要行为轨迹

这使得系统能够回答类似问题：

- 这次 AI 选文是怎么来的
- 某条综述稿引用对应哪张证据卡
- 这周项目发生了哪些关键变化

## 为什么采用这套架构

这套架构主要服务以下目标：

- 让桌面端具备可安装、可本地运行的完整体验
- 保留 Python 生态在搜索、文本处理、数据工作流上的优势
- 让前端保持响应速度和桌面感，而不是依赖一个 Web SSR 主线
- 把“研究流程对象”建模清楚，而不是只做一个通用聊天壳

## 当前边界

当前明确不做或不作为主线的内容包括：

- 不把 Web 版恢复为第一主线
- 不把全局聊天当作主要交互骨架
- 不把所有历史非项目数据自动迁成项目
- 不把普通搜索热路径改成高成本 AI 重排
- 不把阅读器、证据、写作全部重做成重型 block editor

## 与其他文档的关系

- `README.md`
  - 面向使用者和协作者的总入口说明
- `AGENTS.md`
  - 面向仓库协作与实现边界的约定
- `docs/api-spec.md`
  - 面向接口层的 API 说明
- `docs/database-schema.md`
  - 面向数据层的表结构说明

如果这份文档与代码行为不一致，应优先以代码、当前脚本和运行时实现为准，再回补文档。
