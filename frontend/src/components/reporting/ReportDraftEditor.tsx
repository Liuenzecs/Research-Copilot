"use client";

import { useEffect, useState } from 'react';

import Button from '@/components/common/Button';
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
  const [status, setStatus] = useState(draft?.status ?? 'draft');

  useEffect(() => {
    setTitle(draft?.title ?? '');
    setMarkdown(draft?.draft_markdown ?? '');
    setStatus(draft?.status ?? 'draft');
  }, [draft?.id, draft?.title, draft?.draft_markdown, draft?.status]);

  if (!draft) {
    return (
      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>周报草稿</h3>
        <p className="subtle">先生成草稿。</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <h3 className="title" style={{ fontSize: 16 }}>周报草稿编辑</h3>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className="select" value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'finalized' | 'archived')}>
        <option value="draft">draft</option>
        <option value="finalized">finalized</option>
        <option value="archived">archived</option>
      </select>
      <textarea className="textarea" style={{ minHeight: 280 }} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
      <div>
        <Button onClick={() => onSave({ title, draft_markdown: markdown, status })}>保存草稿</Button>
      </div>
    </div>
  );
}
