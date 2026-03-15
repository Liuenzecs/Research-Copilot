"use client";

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import StatusStack from '@/components/common/StatusStack';
import { formatDateTime, weekRangeLabel, weeklyReportStatusLabel } from '@/lib/presentation';
import { WeeklyReportDraft } from '@/lib/types';

export default function ReportDraftEditor({
  draft,
  onSave,
}: {
  draft: WeeklyReportDraft | null;
  onSave: (payload: { draft_markdown?: string; status?: string; title?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(draft?.title ?? '');
  const [markdown, setMarkdown] = useState(draft?.draft_markdown ?? '');
  const [status, setStatus] = useState<WeeklyReportDraft['status']>(draft?.status ?? 'draft');

  useEffect(() => {
    setTitle(draft?.title ?? '');
    setMarkdown(draft?.draft_markdown ?? '');
    setStatus(draft?.status ?? 'draft');
  }, [draft?.id, draft?.title, draft?.draft_markdown, draft?.status]);

  const isDirty = useMemo(() => {
    if (!draft) return false;
    return (
      title !== (draft.title ?? '')
      || markdown !== (draft.draft_markdown ?? '')
      || status !== (draft.status ?? 'draft')
    );
  }, [draft, markdown, status, title]);

  function resetToSaved() {
    if (!draft) return;
    setTitle(draft.title ?? '');
    setMarkdown(draft.draft_markdown ?? '');
    setStatus(draft.status ?? 'draft');
  }

  if (!draft) {
    return (
      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>
          周报草稿
        </h3>
        <p className="subtle">先加载上下文或生成本周草稿，再进入编辑。</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h3 className="title" style={{ fontSize: 16 }}>
          周报草稿编辑
        </h3>
        <p className="subtle" style={{ margin: 0 }}>
          {title || '未命名周报草稿'}
        </p>
      </div>

      <div className="grid-2">
        <div className="subtle">周范围：{weekRangeLabel(draft.week_start, draft.week_end)}</div>
        <div className="subtle">最后更新：{formatDateTime(draft.updated_at)}</div>
      </div>
      <div className="subtle">当前状态：{weeklyReportStatusLabel(status)}</div>

      <StatusStack
        items={isDirty
          ? [{ variant: 'warning' as const, message: '当前有未保存修改，建议保存后再切换或离开。' }]
          : [{ variant: 'info' as const, message: '当前内容与已保存版本一致。' }]}
      />

      <input
        className="input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="输入周报标题"
      />

      <select
        className="select"
        value={status}
        onChange={(event) => setStatus(event.target.value as WeeklyReportDraft['status'])}
      >
        <option value="draft">草稿</option>
        <option value="finalized">已定稿</option>
        <option value="archived">已归档</option>
      </select>

      <textarea
        className="textarea"
        style={{ minHeight: 320 }}
        value={markdown}
        onChange={(event) => setMarkdown(event.target.value)}
        placeholder="在这里整理本周周报内容"
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button className="secondary" disabled={!isDirty} onClick={resetToSaved}>
          恢复到已保存版本
        </Button>
        <Button onClick={() => onSave({ title, draft_markdown: markdown, status })}>保存草稿</Button>
      </div>
    </div>
  );
}
