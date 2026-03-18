# Research Copilot

Research Copilot 是一个本地优先、单人使用、项目制的科研工作台。主入口不是聊天窗口，而是围绕研究问题推进的 `项目工作台`。

核心主流程：
- 输入研究问题
- 创建项目
- 搜索并收集论文
- 提取证据
- 生成对比表
- 起草综述稿

## 技术栈
- 后端：FastAPI + SQLAlchemy + SQLite + Chroma
- 前端：Next.js + TypeScript
- CLI：Typer

## 日常启动（Windows）

日常开发时，继续使用这两个脚本：

终端 1：启动后端
```powershell
.\scripts\run_backend.ps1
```

终端 2：启动前端
```powershell
.\scripts\run_frontend.ps1
```

说明：
- `run_backend.ps1` 会先确保数据库存在并迁移到最新版本，再启动后端。
- `run_frontend.ps1` 会读取后端地址并启动 Next.js 开发服务。
- 停止服务时，直接在对应终端按 `Ctrl + C`。

## E2E 是什么

`E2E` 是 `End-to-End`，也就是“端到端回归测试”。

它的作用是让浏览器像真实用户一样走一遍关键流程，确认最近的改动没有把主链路弄坏。  
这不是你每次日常启动前后端都必须执行的命令。

当前 E2E 主要覆盖：
- 创建项目
- 在项目里搜索并加入论文
- 提取证据、生成对比表、起草综述
- 阅读器把段落加入项目证据板
- 项目上下文下的心得 / 复现 / 记忆过滤
- 自动保存后的刷新保留

## 什么时候需要跑 E2E

通常只在这些时候跑：
- 改了项目工作台、阅读器、搜索、导航、自动保存这些关键路径之后
- 准备提交一批较大的改动之前
- 怀疑“以前好的流程现在被改坏了”

如果你只是改一小段文案、做很局部的样式调整，或者已经手动点过相关页面，通常不需要每次都跑。

## 如何运行 E2E

第一次在本机运行 Playwright 时，先安装浏览器：

```powershell
cd frontend
npx playwright install chromium
```

之后需要做 E2E 回归时再执行：

```powershell
cd frontend
npx playwright test
```

说明：
- 这套命令会自动拉起一套专门给测试使用的临时前后端。
- 它不会替代日常开发用的 `.\scripts\run_backend.ps1` 和 `.\scripts\run_frontend.ps1`。
- 它会比日常启动慢很多，所以不建议每次都跑。

## 首次安装

### 1. Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Frontend
```powershell
cd frontend
npm install
```

### 3. CLI
```powershell
cd cli
python -m pip install -e .
research-cli --help
```

## 常用命令速查

日常启动：
```powershell
.\scripts\run_backend.ps1
.\scripts\run_frontend.ps1
```

后端测试：
```powershell
pytest backend/app/tests -q
```

前端类型检查：
```powershell
cd frontend
npx tsc --noEmit
```

前端生产构建检查：
```powershell
cd frontend
npx next build
```

首次安装 Playwright 浏览器：
```powershell
cd frontend
npx playwright install chromium
```

运行 E2E 回归：
```powershell
cd frontend
npx playwright test
```

## 数据与项目说明

- 当前默认主数据库路径是 `backend/data/research_copilot.db`
- 历史 runtime 路径 `backend/backend/data` 已收口到 `backend/data`
- 项目首页只显示新的 `research_projects` 项目对象
- 旧的阅读 / 心得 / 复现 / 记忆记录不会自动迁成项目
- 想确认当前到底在用哪个数据库，请直接看应用内“设置”页显示的数据库路径

## 测试隔离

- `pytest` 默认使用临时数据库和临时 runtime 目录
- Playwright E2E 也使用独立的临时数据库
- 测试不会污染你日常开发正在使用的数据库

## 当前产品口径

- 主入口：`项目`
- 二级主导航：`文库 / 周报 / 设置`
- 旧页面 `搜索 / 心得 / 复现 / 记忆` 继续保留，但作为二级深链入口
- 英文论文内容始终是 canonical
- 中文 UI 和中文辅助内容用于理解、整理与汇报
