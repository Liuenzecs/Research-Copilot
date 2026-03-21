export type HelpSection = {
  title: string;
  description?: string;
  bullets: string[];
};

export const HELP_HEADER = {
  title: "Research Copilot 使用说明",
  subtitle: "当前主线已经切到桌面版。日常开发最推荐直接运行 `cd frontend && npm run desktop:dev`，应用会先显示启动页，再自动拉起前端和本地后端。",
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "你平时怎么启动",
    bullets: [
      "日常开发最常用命令：`cd frontend && npm run desktop:dev`。",
      "这条命令会自动启动 Vite、Tauri 桌面壳和 FastAPI sidecar，不需要你再手动分别开前后端。",
      "桌面版会先显示启动页，再在后台等待本地后端就绪；如果失败，也能直接看到错误和日志入口。",
      "如果你只是想直接使用应用，安装 Windows MSI 后双击打开即可。",
    ],
  },
  {
    title: "旧脚本怎么用",
    bullets: [
      "单独调后端接口时，仍然可以运行 `.\\scripts\\run_backend.ps1`。",
      "如果你继续运行 `.\\scripts\\run_frontend.ps1`，它现在本质上也会收口到桌面开发模式。",
      "桌面版数据写入用户目录，与仓库里的 `backend/data` 开发数据隔离。",
    ],
  },
  {
    title: "推荐主流程",
    bullets: [
      "先在“项目”里输入研究问题，创建项目工作台。",
      "在同一个工作台里搜索论文、收集候选、加入项目并整理证据板。",
      "继续生成对比表、起草综述稿；需要深读时再进入阅读器。",
      "做周报时进入“周报”，按项目上下文整理本周进展。",
    ],
  },
  {
    title: "旧页面角色",
    bullets: [
      "“搜索、心得、复现、记忆”仍然保留，但现在是二级深链入口，不再是主入口。",
      "从项目工作台跳到这些页面时，会尽量保留 `project_id`，方便你返回项目。",
      "阅读器仍然是深度工具，适合做原文核对、选段、翻译和证据回源。",
    ],
  },
  {
    title: "为什么旧数据可能看不到",
    bullets: [
      "桌面版本期不会导入仓库里的旧 `backend/data` 数据。",
      "项目首页只显示新的项目对象，不会自动把历史阅读、心得、复现、记忆迁成项目。",
      "如果你想确认当前桌面版到底在使用哪个数据库，请到“设置”里查看数据目录和数据库路径。",
    ],
  },
  {
    title: "什么时候跑回归测试",
    bullets: [
      "`E2E` 是端到端回归测试，不是你每次日常启动都要跑的命令。",
      "当你改了项目工作台、搜索、阅读器、自动保存、导航等关键链路时，再运行 `cd frontend && npx playwright test`。",
      "第一次运行 Playwright，如果本机还没装浏览器，先执行 `cd frontend && npx playwright install chromium`。",
      "Playwright E2E 和 pytest 都使用临时数据库，不会污染桌面版正式数据目录。",
    ],
  },
  {
    title: "桌面构建怎么选",
    bullets: [
      "日常打包：`cd frontend && npm run desktop:build`。",
      "异常兜底：`cd frontend && npm run desktop:build:fresh`。",
      "`frontend/src-tauri/target` 是桌面构建缓存的主要来源，平时不用手动删除。",
      "只有遇到 exe 看起来像旧包、构建时间不对、MSI 文件被占用、sidecar 行为异常时，才优先用 fresh build。",
    ],
  },
  {
    title: "其他常用命令",
    bullets: [
      "前端构建检查：`cd frontend && npm run build`。",
      "桌面清理：`cd frontend && npm run desktop:clean`。",
      "单独打包 Python sidecar：`cd frontend && npm run desktop:backend:bundle`。",
      "后端测试：`pytest backend/app/tests -q`。",
    ],
  },
];
