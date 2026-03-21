# Research Copilot

Research Copilot 是一个面向论文检索、阅读、写作整理与代码复现的桌面研究工作台。

当前主线已经切到桌面版：

- 桌面壳：`Tauri v2`
- 前端：`Vite + React + React Router + TanStack Query`
- 后端：`FastAPI`
- 本地存储：`SQLite + local filesystem + Chroma`
- 当前主目标平台：`Windows`

它的定位不是通用聊天工具，而是一个项目制、本地优先、中文 UI 优先的研究辅助环境，适合需要系统性读论文、做笔记、写综述、跟踪复现进度的人。

## 这个项目是干什么的

Research Copilot 主要服务这类工作流：

- 围绕一个研究项目收集和筛选论文
- 在阅读器里阅读 PDF、做摘要、写心得
- 沿着项目上下文管理证据、对比表和综述稿
- 跟踪复现计划、仓库线索和执行进度
- 生成项目周报，减少整理汇报材料的重复劳动

产品当前坚持这些原则：

- `项目优先`，不是全局文献库优先
- `桌面优先`，不是 Web 主线优先
- `本地优先`，数据默认落本地
- `中文优先`，但品牌名 `Research Copilot` 保持英文
- 论文标题、原文、来源元数据等 canonical 内容保持原始语义

## 当前已覆盖的能力

- 项目工作台：论文池、搜索收集台、证据板、对比表、综述稿、引用管理
- 项目搜索：多源搜索、保存搜索、搜索历史、候选筛选、引文链、AI 选文
- 论文工作区：PDF 阅读、摘要、阅读状态、计入阅读日期、AI 心得草稿
- 复现工作流：代码仓库发现、复现计划、步骤推进、日志分析
- 周报：项目上下文周报草稿与历史草稿管理
- 设置页：可编辑模型配置、运行时信息、数据目录与日志目录展示

## 仓库结构

```text
backend/                 FastAPI 后端、服务层、数据库模型与 Alembic 迁移
cli/                     命令行工具
docs/                    架构、API、产品和验收文档
frontend/                Vite React 前端 + Tauri 桌面壳
scripts/                 仓库级开发脚本
README.md                项目说明
AGENTS.md                仓库协作与实现约定
```

前端重点目录：

- `frontend/src/routes`：页面入口层
- `frontend/src/components`：可复用组件与复杂业务组件
- `frontend/src/desktop`：桌面启动壳、路由装配、启动页
- `frontend/src/lib`：API、运行时配置、Query、常量和工具函数
- `frontend/src-tauri`：Tauri Rust 宿主与打包配置

## 开发环境要求

建议在 Windows 上开发桌面主线，并准备好：

- `Node.js 20+`
- `npm 10+`
- `Python 3.11+`
- `Rust stable`
- Tauri 在 Windows 上需要的系统依赖和构建工具

首次拉起项目前，通常需要：

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

cd frontend
npm install
```

## 日常怎么启动

桌面开发主线：

```powershell
cd frontend
npm run desktop:dev
```

这条命令会进入当前推荐的桌面开发方式：

- 启动 Vite 前端开发环境
- 启动 Tauri 桌面壳
- 由桌面壳自动拉起 FastAPI sidecar
- 首屏先显示启动页，再等待后端健康检查完成

如果你只想单独调试后端，仍然可以使用：

```powershell
.\scripts\run_backend.ps1
```

如果你习惯从仓库根目录启动桌面开发，也可以使用：

```powershell
.\scripts\run_frontend.ps1
```

## 如何构建桌面包

日常增量构建：

```powershell
cd frontend
npm run desktop:build
```

如果出现这些情况，改用 fresh build：

- 看起来像旧包
- 构建时间或行为和最新代码对不上
- MSI 被占用
- sidecar 看起来没有更新

```powershell
cd frontend
npm run desktop:build:fresh
```

如果只想重打 Python sidecar：

```powershell
cd frontend
npm run desktop:backend:bundle
```

常见桌面产物会出现在：

- `frontend/src-tauri/target/release/bundle/msi/`

## `target` 要不要删

一般不需要。

- `frontend/src-tauri/target` 是桌面构建缓存的主要位置
- 日常开发和构建优先使用 `desktop:dev` / `desktop:build`
- 只有怀疑缓存或旧包残留时，再使用 `desktop:build:fresh`

## 数据目录与运行时配置

开发态直接跑后端时，默认使用仓库内：

- 数据目录：`backend/data`
- 数据库：`backend/data/research_copilot.db`

安装后的桌面应用会使用用户目录下的独立数据目录，不会默认把数据写回仓库。

桌面运行时还会把可编辑配置保存到：

- `<desktop data dir>/config/ui_settings.json`

设置页里可以直接查看：

- 当前数据目录
- 当前数据库路径
- 当前日志目录
- 当前运行构建的版本、构建时间、Git commit、构建模式

## 模型与外部服务接入

当前主线支持这些模型提供方式：

- `OpenAI`
- `DeepSeek`
- `OpenAI-compatible` 网关
- `fallback` 本地兜底

其中 OpenAI-compatible 模式可以接入兼容 OpenAI 请求格式的服务，例如自定义网关或聚合服务。

设置方式有两种：

1. 启动后在应用 `设置` 页面里直接填写
2. 通过 `.env` 或运行时环境变量配置

示例环境变量见 [`.env.example`](./.env.example)。

## 常用命令

后端测试：

```powershell
pytest backend/app/tests -q
```

前端构建检查：

```powershell
cd frontend
npm run build
```

桌面 E2E：

```powershell
cd frontend
npx playwright test
```

首次运行 Playwright，如果本机没有安装浏览器：

```powershell
cd frontend
npx playwright install chromium
```

## 文档入口

更细的设计和实现文档在 `docs/`：

- `docs/architecture.md`
- `docs/api-spec.md`
- `docs/database-schema.md`
- `docs/acceptance-checklist.md`
- `docs/product-audit-outline.md`

## 当前主线口径

- 主入口：`项目`
- 二级导航：`文库 / 周报 / 设置`
- 其他深链工作面：`搜索 / 心得 / 复现 / 记忆 / 论文工作区`
- 当前以桌面版为唯一主线，不再把 Next.js Web 版作为本期兼容目标

## 提醒

- 本仓库里会保留一些规划文档和历史设计稿，但并不代表它们都和当前桌面主线完全同步。
- 如果你要判断“现在到底该怎么跑”，优先以本 README、`AGENTS.md`、`frontend/package.json` 和当前脚本为准。
