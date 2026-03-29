type BilingualPaperLike = {
  title_en?: string | null;
  title_zh?: string | null;
};

function normalizePaperTitle(value?: string | null) {
  return (value ?? '').trim();
}

export function paperPrimaryTitle(paper: BilingualPaperLike): string {
  const zh = normalizePaperTitle(paper.title_zh);
  if (zh && !zh.startsWith('【中文辅助结果】')) return zh;
  return normalizePaperTitle(paper.title_en) || '未命名论文';
}

export function paperSecondaryTitle(paper: BilingualPaperLike): string {
  const zh = normalizePaperTitle(paper.title_zh);
  const en = normalizePaperTitle(paper.title_en);
  if (!zh || zh.startsWith('【中文辅助结果】') || !en) return '';
  if (zh === en) return '';
  return en;
}

export function formatDateTime(value?: string | null, fallback = '未记录'): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

export function weekRangeLabel(weekStart?: string | null, weekEnd?: string | null): string {
  if (!weekStart && !weekEnd) return '未设置周期';
  return `${weekStart ?? '未设置'} ~ ${weekEnd ?? '未设置'}`;
}

export function weeklyReportStatusLabel(status?: string | null): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'finalized':
      return '已定稿';
    case 'archived':
      return '已归档';
    default:
      return status || '未设置';
  }
}

export function reflectionLifecycleLabel(status?: string | null): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'finalized':
      return '已定稿';
    case 'archived':
      return '已归档';
    default:
      return status || '未设置';
  }
}

export function reflectionTypeLabel(type?: string | null): string {
  switch (type) {
    case 'paper':
      return '论文心得';
    case 'reproduction':
      return '复现心得';
    default:
      return type || '未分类心得';
  }
}

export function reflectionStageLabel(stage?: string | null): string {
  switch (stage) {
    case 'initial':
      return '初始';
    case 'progress':
      return '进行中';
    case 'experiment':
      return '实验';
    case 'unread':
      return '未读';
    case 'skimmed':
      return '略读';
    case 'deep_read':
      return '精读';
    case 'archived':
      return '归档';
    default:
      return stage || '未设置';
  }
}

export function taskTypeLabel(taskType?: string | null): string {
  if (taskType === 'paper_reflection_ai_create') return 'AI 论文心得生成';
  if (taskType === 'project_curate_reading_list') return 'AI 选文预览';
  switch (taskType) {
    case 'paper_search':
      return '论文搜索';
    case 'paper_download':
      return '论文下载';
    case 'summary_quick':
      return '快速摘要';
    case 'summary_deep':
      return '深度摘要';
    case 'paper_research_state_update':
      return '论文研究状态更新';
    case 'paper_reflection_create':
      return '论文心得创建';
    case 'paper_memory_push':
      return '论文写入记忆';
    case 'reflection_create':
      return '心得创建';
    case 'weekly_report_generate':
      return '周报草稿生成';
    case 'repo_find':
      return '仓库检索';
    case 'reproduction_plan':
      return '复现计划生成';
    case 'reproduction_update':
      return '复现进展更新';
    case 'reproduction_step_update':
      return '复现步骤更新';
    case 'reproduction_log_create':
      return '复现日志记录';
    case 'reproduction_reflection_create':
      return '复现心得创建';
    case 'reproduction_execute':
      return '复现执行准备';
    case 'translation_key_fields':
      return '关键字段翻译';
    case 'translation_segment':
      return '分段翻译';
    case 'project_extract_evidence':
      return '项目证据提取';
    case 'project_generate_compare_table':
      return '项目对比表生成';
    case 'project_draft_literature_review':
      return '项目综述起草';
    case 'project_fetch_pdfs':
      return '项目补全 PDF';
    case 'project_refresh_metadata':
      return '项目刷新元数据';
    case 'project_ensure_summaries':
      return '项目补齐摘要';
    default:
      return taskType || '未命名任务';
  }
}

export function taskStatusLabel(status?: string | null): string {
  switch (status) {
    case 'created':
      return '已创建';
    case 'pending':
      return '待处理';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'completed_with_warnings':
      return '完成但有警告';
    case 'failed':
      return '失败';
    case 'blocked':
      return '阻塞';
    case 'warning':
      return '需注意';
    case 'cancelled':
      return '已取消';
    default:
      return status || '未设置';
  }
}

export function reproductionStatusLabel(status?: string | null): string {
  switch (status) {
    case 'planned':
      return '已规划';
    case 'in_progress':
      return '进行中';
    case 'blocked':
      return '阻塞';
    case 'done':
      return '已完成';
    case 'completed':
      return '已完成';
    case 'skipped':
      return '已跳过';
    default:
      return status || '未设置';
  }
}

export function summaryTypeLabel(summaryType?: string | null): string {
  switch (summaryType) {
    case 'quick':
      return '快速摘要';
    case 'deep':
      return '深度摘要';
    default:
      return summaryType || '未标注摘要';
  }
}

export function memoryTypeLabel(memoryType?: string | null): string {
  switch (memoryType) {
    case 'PaperMemory':
      return '论文记忆';
    case 'SummaryMemory':
      return '摘要记忆';
    case 'ReflectionMemory':
      return '心得记忆';
    case 'ReproMemory':
      return '复现记忆';
    case 'RepoMemory':
      return '代码仓记忆';
    case 'IdeaMemory':
      return '灵感记忆';
    default:
      return memoryType || '其他记忆';
  }
}

export function memoryLayerLabel(layer?: string | null): string {
  switch (layer) {
    case 'raw':
      return '原始层';
    case 'structured':
      return '结构层';
    case 'semantic':
      return '语义层';
    case 'profile':
      return '画像层';
    default:
      return layer || '未标注层级';
  }
}

export function memoryRetrievalModeLabel(mode?: string | null): string {
  switch (mode) {
    case 'semantic':
      return '语义召回';
    case 'fallback':
      return '回退展示';
    default:
      return mode || '未标注方式';
  }
}

export function memoryJumpButtonLabel(kind?: string | null): string {
  switch (kind) {
    case 'paper':
      return '打开论文工作区';
    case 'reproduction':
      return '打开复现工作区';
    case 'reflection':
      return '打开心得页面';
    case 'brainstorm':
      return '打开灵感页面';
    default:
      return '';
  }
}
