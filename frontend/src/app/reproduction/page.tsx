"use client";

import { useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import ReproStepTracker from '@/components/reproduction/ReproStepTracker';
import { createReproductionReflection, getReproductionDetail, planReproduction, updateReproduction, updateReproductionStep } from '@/lib/api';
import { ReproductionDetail } from '@/lib/types';

export default function ReproductionPage() {
  const [paperId, setPaperId] = useState('');
  const [reproductionId, setReproductionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ReproductionDetail | null>(null);
  const [error, setError] = useState('');

  const [progressSummary, setProgressSummary] = useState('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const [todayWork, setTodayWork] = useState('');
  const [issue, setIssue] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [reportSummary, setReportSummary] = useState('');
  const [reportWorthy, setReportWorthy] = useState(false);

  async function loadDetail(id: number) {
    const data = await getReproductionDetail(id);
    setDetail(data);
    setProgressSummary(data.progress_summary || '');
    setProgressPercent(data.progress_percent ?? 0);
  }

  async function generatePlan() {
    if (!paperId.trim()) return;
    setError('');
    try {
      const result = await planReproduction(Number(paperId));
      setReproductionId(result.reproduction_id);
      await loadDetail(result.reproduction_id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card>
        <h2 className="title">复现计划</h2>
        <p className="subtle">流程：repo/计划 → 步骤跟踪 → 阻塞记录 → 复现心得。</p>
      </Card>

      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <input
          className="input"
          placeholder="输入 paper_id"
          value={paperId}
          onChange={(e) => setPaperId(e.target.value)}
        />
        <div>
          <Button onClick={generatePlan}>生成复现计划</Button>
        </div>
      </div>

      {detail ? (
        <>
          <Card>
            <h3 className="title" style={{ fontSize: 16 }}>复现概览 #{detail.reproduction_id}</h3>
            <p className="subtle">状态: {detail.status} · 进度: {detail.progress_percent ?? 0}%</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{detail.plan_markdown}</pre>
          </Card>

          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>更新整体进度</h4>
            <input className="input" value={progressSummary} onChange={(e) => setProgressSummary(e.target.value)} placeholder="progress_summary" />
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={progressPercent}
              onChange={(e) => setProgressPercent(Number(e.target.value))}
            />
            <Button
              className="secondary"
              onClick={async () => {
                if (!reproductionId) return;
                await updateReproduction(reproductionId, {
                  progress_summary: progressSummary,
                  progress_percent: progressPercent,
                });
                await loadDetail(reproductionId);
              }}
            >
              保存进度
            </Button>
          </div>

          <ReproStepTracker
            detail={detail}
            onUpdateStep={async (stepId, payload) => {
              if (!reproductionId) return;
              await updateReproductionStep(reproductionId, stepId, payload);
              await loadDetail(reproductionId);
            }}
          />

          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>复现心得快速记录</h4>
            <textarea className="textarea" placeholder="我今天做了什么" value={todayWork} onChange={(e) => setTodayWork(e.target.value)} />
            <textarea className="textarea" placeholder="遇到的问题" value={issue} onChange={(e) => setIssue(e.target.value)} />
            <textarea className="textarea" placeholder="下一步" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
            <input className="input" placeholder="一句话汇报摘要" value={reportSummary} onChange={(e) => setReportSummary(e.target.value)} />
            <label className="subtle"><input type="checkbox" checked={reportWorthy} onChange={(e) => setReportWorthy(e.target.checked)} /> 标记为可汇报</label>
            <Button
              onClick={async () => {
                if (!reproductionId) return;
                await createReproductionReflection(reproductionId, {
                  stage: 'progress',
                  lifecycle_status: 'draft',
                  is_report_worthy: reportWorthy,
                  report_summary: reportSummary,
                  content_structured_json: {
                    what_i_did_today: todayWork,
                    issues_encountered: issue,
                    next_step: nextStep,
                    one_sentence_report_summary: reportSummary,
                  },
                  content_markdown: [todayWork, issue, nextStep].filter(Boolean).join('\n\n'),
                });
                setTodayWork('');
                setIssue('');
                setNextStep('');
              }}
            >
              创建复现心得
            </Button>
          </div>
        </>
      ) : null}

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </>
  );
}
