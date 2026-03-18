# Research Copilot

Research Copilot is a local-first, single-user research workbench (not chatbot-style) for:
- paper search (arXiv + Semantic Scholar default)
- arXiv PDF download
- quick/deep summaries
- optional Chinese translation overlays
- brainstorm/proposal drafting
- repo finding (GitHub with optional token, rate-limit awareness)
- reproduction planning (plan-first, manual confirmation)
- long-term memory + semantic retrieval
- structured reflections / 研究心得 with timeline
- workflow/task audit history

## Stack
- Backend: FastAPI + SQLAlchemy + SQLite + Chroma
- Frontend: Next.js + TypeScript
- CLI: Typer

## Daily Start (Windows)

日常开发时，通常只需要开 2 个终端。

终端 1：启动后端
```powershell
.\scripts\run_backend.ps1
```

终端 2：启动前端
```powershell
.\scripts\run_frontend.ps1
```

说明：
- 这是平时最推荐的启动方式。
- `run_backend.ps1` 会自动做数据库初始化 / 迁移，再启动后端。
- `run_frontend.ps1` 会自动读取后端地址，再启动前端。
- 停止服务时，直接在对应终端按 `Ctrl + C`。

## What Is E2E

`E2E` 是 `End-to-End`，意思是“端到端测试”。

它不是你平时打开产品就必须跑的命令，而是开发时做“回归检查”用的。  
你可以把它理解成：让电脑自己打开浏览器，像真实用户一样走一遍关键流程，确认这些流程没有被新代码改坏。

例如它会帮你检查：
- 创建项目是否正常
- 搜索论文并加入项目是否正常
- 提取证据、生成对比表、起草综述是否正常
- 阅读器一键加入证据后，返回项目是否能看到
- 项目上下文下的心得 / 复现 / 记忆页面过滤是否正常

## When To Run E2E

你不需要每次启动前后端都跑 E2E。

一般只在这些时候跑：
- 改了比较大的功能以后
- 改了项目工作台、阅读器、搜索、导航、自动保存这些关键路径以后
- 准备提交一批改动前，想做一次完整检查
- 怀疑“以前好的流程，现在可能被改坏了”

如果你只是正常开发、改一点小文案、或者自己手动点点页面看效果，通常不用每次都跑。

## Run E2E

第一次在这台机器上跑 Playwright 时，先安装浏览器：
```powershell
cd frontend
npx playwright install chromium
```

之后需要做 E2E 回归时，再运行：
```powershell
cd frontend
npx playwright test
```

说明：
- 这套命令会自动拉起一套专门给测试用的临时前后端。
- 它不会替代你平时的 `.\scripts\run_backend.ps1` 和 `.\scripts\run_frontend.ps1`。
- 它比日常启动慢很多，所以不建议每次都跑。

## First-Time Setup (Windows)

第一次把项目拉下来时，先安装依赖。

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

### 4. First Run Check
```powershell
.\scripts\run_backend.ps1
.\scripts\run_frontend.ps1
```

## Common Command Summary

第一次安装依赖：
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

cd ..\frontend
npm install
```

日常启动：
```powershell
.\scripts\run_backend.ps1
.\scripts\run_frontend.ps1
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

后端测试：
```powershell
pytest backend/app/tests -q
```

第一次安装 Playwright 浏览器：
```powershell
cd frontend
npx playwright install chromium
```

运行 E2E 回归：
```powershell
cd frontend
npx playwright test
```

## Project Layout
Top-level structure follows the fixed baseline in the planning instructions.

## Runtime Data Root
Canonical runtime data root: `backend/data` (project root relative).

All generated/local runtime artifacts are stored under this root, including:
- SQLite DB: `backend/data/research_copilot.db`
- downloaded PDFs: `backend/data/papers/`
- vector store: `backend/data/vectors/`
- cache/log/memory runtime files

## Environment
Copy `.env.example` to `.env` at project root and set keys if needed.

## Repo Hygiene
- `.env` and runtime generated artifacts are ignored by default.
- Keep `.env.example` tracked as the safe template.
- Legacy runtime path `backend/backend/data` is ignored for cleanup compatibility.

## MVP Notes
- English paper content is canonical.
- Chinese translation is optional and non-destructive.
- Reflection lifecycle: `draft | finalized | archived`.
- Tasks are audit-oriented and archived via status updates (no hard delete API).
