"use client";

import { useState } from 'react';

import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import CommandConfirmTable from '@/components/reproduction/CommandConfirmTable';
import ReproPlanPanel from '@/components/reproduction/ReproPlanPanel';
import { API_BASE } from '@/lib/constants';

export default function ReproductionPage() {
  const [paperId, setPaperId] = useState('');
  const [plan, setPlan] = useState('');
  const [steps, setSteps] = useState<Array<{ step_no: number; command: string; risk_level: string }>>([]);

  async function generatePlan() {
    if (!paperId.trim()) return;
    const response = await fetch(`${API_BASE}/reproduction/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_id: Number(paperId), repo_id: null }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setPlan(payload.plan_markdown || '');
    setSteps(payload.steps || []);
  }

  return (
    <>
      <Card>
        <h2 className="title">复现计划</h2>
        <p className="subtle">先生成计划，再手动确认命令。MVP 不自动执行未知命令。</p>
      </Card>
      <div className="card">
        <input
          className="input"
          placeholder="输入 paper_id"
          value={paperId}
          onChange={(e) => setPaperId(e.target.value)}
        />
        <div style={{ marginTop: 10 }}>
          <Button onClick={generatePlan}>生成复现计划</Button>
        </div>
      </div>
      <ReproPlanPanel plan={plan} />
      <CommandConfirmTable commands={steps} />
    </>
  );
}
