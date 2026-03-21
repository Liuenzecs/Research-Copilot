export type HelpSection = {
  title: string;
  description?: string;
  bullets: string[];
};

export type HelpQuickAction = {
  title: string;
  detail: string;
};

export const HELP_HEADER = {
  title: "Research Copilot 桌面帮助",
  subtitle: "重点先掌握三件事：怎么启动、主流程从哪里开始、什么时候该用增量构建还是 fresh build。",
};

export const HELP_QUICK_ACTIONS: HelpQuickAction[] = [
  {
    title: "日常启动",
    detail: "开发时优先运行 `cd frontend && npm run desktop:dev`，应用会先出启动页，再自动拉起桌面壳和本地后端。",
  },
  {
    title: "正式使用",
    detail: "普通使用直接打开桌面安装包，不需要手动开终端或分别启动前后端。",
  },
  {
    title: "主工作流",
    detail: "先建项目，再在同一工作台里完成搜集、阅读、证据整理、对比表和综述稿推进。",
  },
];

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "启动与开发",
    bullets: [
      "日常开发：`cd frontend && npm run desktop:dev`。",
      "这条命令会自动启动 Vite、Tauri 桌面壳和 FastAPI sidecar。",
      "如果启动失败，先看启动页里的错误摘要、日志目录和重试入口。",
    ],
  },
  {
    title: "旧脚本与数据口径",
    bullets: [
      "单独调后端接口时，仍可运行 `.\\scripts\\run_backend.ps1`。",
      "桌面版数据写入用户目录，与仓库内开发数据隔离。",
      "设置页里可以直接看到当前数据目录、数据库路径和日志目录。",
    ],
  },
  {
    title: "推荐主流程",
    bullets: [
      "先在“项目”里输入研究问题，创建项目工作台。",
      "在工作台里完成论文搜索、筛选、加入项目和阅读推进。",
      "证据板、对比表、综述稿和周报都尽量围绕同一个项目推进。",
    ],
  },
  {
    title: "旧页面角色",
    bullets: [
      "“搜索、心得、复现、记忆”仍然保留，但现在是项目化二级入口。",
      "从项目工作台跳到这些页面时，会尽量保留 `project_id` 方便回跳。",
      "阅读器仍是深度工具，适合做原文核对、选段、翻译和证据回源。",
    ],
  },
  {
    title: "为什么旧数据可能看不到",
    bullets: [
      "桌面版本期不会导入仓库里的旧 `backend/data` 数据。",
      "项目首页只显示新的项目对象，不会自动把历史记录迁成项目。",
      "如果你怀疑数据源不对，先去“设置”查看当前数据库路径。",
    ],
  },
  {
    title: "回归测试",
    bullets: [
      "`cd frontend && npx playwright test` 主要用于改了关键链路后的回归检查。",
      "第一次运行 Playwright，如果缺浏览器，先执行 `cd frontend && npx playwright install chromium`。",
      "Playwright E2E 和 pytest 都使用临时数据库，不会污染正式数据。",
    ],
  },
  {
    title: "桌面构建怎么选",
    bullets: [
      "日常打包：`cd frontend && npm run desktop:build`。",
      "异常兜底：`cd frontend && npm run desktop:build:fresh`。",
      "`frontend/src-tauri/target` 是桌面构建缓存主目录，平时不用手动删除。",
      "只有遇到旧包残留、时间不对、MSI 被占用或 sidecar 异常时，再优先用 fresh build。",
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
