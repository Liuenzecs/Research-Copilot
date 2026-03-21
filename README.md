# Research Copilot

Research Copilot 当前主线已经切到桌面版：

- 前端：`Tauri v2 + Vite + React Router`
- 后端：`FastAPI + SQLite + Chroma`
- 运行形态：桌面应用自动拉起本地 FastAPI sidecar
- 当前目标平台：`Windows`

本期不再把 Next.js Web 版作为主运行时，也不导入仓库里的旧 `backend/data`。桌面版会把数据写到用户目录，和仓库开发数据隔离。

## 你平时怎么启动

如果你是日常开发，最常用的就是这一条：

```powershell
cd frontend
npm run desktop:dev
```

这条命令会同时完成三件事：

- 启动 Vite 前端开发服务器
- 拉起 Tauri 桌面壳
- 由桌面壳自动启动 FastAPI sidecar

桌面版现在会先显示启动页，再在后台等待本地后端就绪。即使后端启动失败，你也能直接看到当前阶段、错误提示、日志目录和重试按钮，不会再长时间黑屏等待。

也就是说，当前桌面主线下，你平时最推荐的启动方式就是 `npm run desktop:dev`，不需要再手动分别开前后端。

## 旧脚本现在怎么用

如果你只是想单独调后端接口，仍然可以继续使用：

```powershell
.\scripts\run_backend.ps1
```

如果你习惯继续用旧的前端脚本：

```powershell
.\scripts\run_frontend.ps1
```

它现在实际也会收口到桌面开发模式，本质上还是帮你跑 `cd frontend && npm run desktop:dev`。

## 普通使用者怎么打开

如果你不是在开发，而是想直接用应用，推荐安装 MSI 安装包。

- 安装后直接打开应用即可
- 不需要先手动启动后端
- 不需要再手动启动前端

## 怎么打包桌面安装包

构建 Windows MSI：

```powershell
cd frontend
npm run desktop:build
```

如果你怀疑当前产物像旧包，例如 exe / msi 时间不对、启动行为和最新代码不一致、MSI 打包遇到文件锁，或 sidecar 看起来像旧版本，请改用全量 fresh build：

```powershell
cd frontend
npm run desktop:build:fresh
```

单独打包 Python sidecar：

```powershell
cd frontend
npm run desktop:backend:bundle
```

## 什么时候才需要跑 E2E

`E2E` 是 `End-to-End`，也就是“端到端回归测试”。

它会像真实用户一样，完整走一遍主流程，确认最近的改动没有把关键链路弄坏。这个命令不是你每次日常启动都必须跑的。

通常在这些时候再跑：

- 你改了项目工作台、搜索、阅读器、自动保存、导航这类关键路径
- 你准备合并或发布一批较大的改动
- 你怀疑“以前好的流程”被新改动弄坏了

运行 E2E：

```powershell
cd frontend
npx playwright test
```

第一次运行 Playwright，如果本机还没装浏览器：

```powershell
cd frontend
npx playwright install chromium
```

## 其他常用命令

前端构建检查：

```powershell
cd frontend
npm run build
```

桌面缓存清理：

```powershell
cd frontend
npm run desktop:clean
```

后端测试：

```powershell
pytest backend/app/tests -q
```

## 数据位置

桌面版运行时：

- 数据目录：用户 AppData 目录下的 Research Copilot 应用目录
- 数据库：该目录下的 `research_copilot.db`
- 日志目录：桌面应用日志目录

开发态与测试态：

- `pytest` 默认使用临时数据库
- `Playwright` E2E 也使用临时数据库
- 测试不会污染你当前开发中的桌面数据

## 为什么旧项目可能看不到

- 桌面版本期不会导入仓库里的旧 `backend/data`
- 项目首页只显示新的项目对象
- 历史阅读、心得、复现、记忆不会自动迁成项目

如果你想确认当前桌面版到底用了哪个数据目录和数据库路径，直接到应用里的“设置”页面查看。
设置页现在也会显示当前运行构建的版本、构建时间、Git commit、构建模式和可执行文件路径，方便确认“这是不是最新打包出来的桌面版”。

## 当前产品口径

- 主入口：`项目`
- 二级导航：`文库 / 周报 / 设置`
- 二级深链：`搜索 / 心得 / 复现 / 记忆`
- 英文论文原文与英文标题继续作为 canonical 内容
- 中文 UI 负责组织、理解、筛选和汇报
