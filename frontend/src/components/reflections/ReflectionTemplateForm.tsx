"use client";

import { FormEvent, useMemo, useState } from 'react';

import Button from '@/components/common/Button';

export type ReflectionFormPayload = {
  reflection_type: 'paper' | 'reproduction';
  template_type: 'paper' | 'reproduction';
  stage: string;
  lifecycle_status: 'draft' | 'finalized' | 'archived';
  event_date: string;
  is_report_worthy: boolean;
  report_summary: string;
  content_structured_json: Record<string, string>;
  content_markdown: string;
};

const PAPER_FIELDS = [
  'paper_in_my_words',
  'most_important_contribution',
  'what_i_learned',
  'what_i_do_not_understand',
  'worth_reproducing',
  'worth_reporting_to_professor',
  'one_sentence_report_summary',
  'free_notes',
];

const REPRO_FIELDS = [
  'what_i_did_today',
  'current_result',
  'issues_encountered',
  'suspected_causes',
  'next_step',
  'worth_reporting_to_professor',
  'one_sentence_report_summary',
  'free_notes',
];

export default function ReflectionTemplateForm({ onSubmit }: { onSubmit: (payload: ReflectionFormPayload) => Promise<void> }) {
  const [templateType, setTemplateType] = useState<'paper' | 'reproduction'>('paper');
  const [stage, setStage] = useState('initial');
  const [lifecycleStatus, setLifecycleStatus] = useState<'draft' | 'finalized' | 'archived'>('draft');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportWorthy, setReportWorthy] = useState(false);
  const [reportSummary, setReportSummary] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const fieldList = useMemo(() => (templateType === 'paper' ? PAPER_FIELDS : REPRO_FIELDS), [templateType]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      reflection_type: templateType,
      template_type: templateType,
      stage,
      lifecycle_status: lifecycleStatus,
      event_date: eventDate,
      is_report_worthy: reportWorthy,
      report_summary: reportSummary,
      content_structured_json: fields,
      content_markdown: markdown,
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 className="title" style={{ fontSize: 16 }}>结构化研究心得模板</h3>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <select className="select" value={templateType} onChange={(e) => setTemplateType(e.target.value as 'paper' | 'reproduction')}>
          <option value="paper">论文心得</option>
          <option value="reproduction">复现心得</option>
        </select>
        <input className="input" value={stage} onChange={(e) => setStage(e.target.value)} placeholder="阶段，如 skimmed / experiment" />
      </div>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <select className="select" value={lifecycleStatus} onChange={(e) => setLifecycleStatus(e.target.value as 'draft' | 'finalized' | 'archived')}>
          <option value="draft">draft</option>
          <option value="finalized">finalized</option>
          <option value="archived">archived</option>
        </select>
        <input className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        {fieldList.map((field) => (
          <textarea
            key={field}
            className="textarea"
            placeholder={field}
            value={fields[field] ?? ''}
            onChange={(e) => setFields((prev) => ({ ...prev, [field]: e.target.value }))}
          />
        ))}
      </div>
      <textarea
        className="textarea"
        style={{ marginTop: 10 }}
        placeholder="可选自由 Markdown 补充"
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <label className="subtle">
          <input type="checkbox" checked={reportWorthy} onChange={(e) => setReportWorthy(e.target.checked)} /> 是否值得向导师汇报
        </label>
        <input
          className="input"
          placeholder="一句话汇报摘要"
          value={reportSummary}
          onChange={(e) => setReportSummary(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <Button type="submit">保存研究心得</Button>
      </div>
    </form>
  );
}
