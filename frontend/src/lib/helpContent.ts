export type HelpSection = {
  title: string;
  description?: string;
  bullets: string[];
};

export const HELP_HEADER = {
  title: 'Research Copilot 使用说明',
  subtitle: '当前主线已经切到桌面版：桌面应用会自动拉起本地后端，不再要求你先手动开两个终端。',
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: '桌面版入口',
    bullets: [
      '普通使用者推荐直接安装 Windows MSI 安装包，打开应用即可使用。',
      '开发态推荐运行 `cd frontend && npm run desktop:dev`，Tauri 会自动启动前端和 FastAPI sidecar。',
      '桌面版数据写入用户目录，与仓库里的 `backend/data` 开发数据隔离。',
    ],
  },
  {
    title: '推荐主流程',
    bullets: [
      '先在“项目”里输入研究问题，创建项目工作台。',
      '在同一个工作台里搜索论文、收集候选、加入项目并整理证据板。',
      '继续生成对比表、起草综述稿，需要深读时再进入阅读器。',
      '做周报时进入“周报”，按项目上下文整理本周进展。',
    ],
  },
  {
    title: '旧页面角色',
    bullets: [
      '“搜索、心得、复现、记忆”仍然保留，但现在是二级深链入口，不再是主入口。',
      '从项目工作台跳到这些页面时，会尽量保留 `project_id`，方便你返回项目。',
      '阅读器仍是深度工具，适合做原文核对、选段、翻译和证据回源。',
    ],
  },
  {
    title: '为什么旧数据可能看不到',
    bullets: [
      '桌面版本期不会导入仓库里的旧 `backend/data` 数据。',
      '项目首页只显示新的项目对象，不会自动把历史阅读、心得、复现、记忆迁成项目。',
      '如果你想确认当前桌面版到底在使用哪个数据库，请到“设置”里查看数据目录和数据库路径。',
    ],
  },
  {
    title: '开发与测试',
    bullets: [
      '前端构建：`cd frontend && npm run build`。',
      '桌面开发：`cd frontend && npm run desktop:dev`。',
      '桌面打包：`cd frontend && npm run desktop:build`。',
      'Playwright E2E 仍然使用浏览器方式回归主流程，不会污染桌面版的正式数据目录。',
    ],
  },
];
