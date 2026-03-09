"use client";

import { useState } from 'react';

import Button from '@/components/common/Button';
import { ReproductionDetail } from '@/lib/types';

export default function ReproStepTracker({
  detail,
  onUpdateStep,
}: {
  detail: ReproductionDetail;
  onUpdateStep: (stepId: number, payload: { step_status?: string; progress_note?: string; blocker_reason?: string }) => Promise<void>;
}) {
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [status, setStatus] = useState('pending');
  const [note, setNote] = useState('');
  const [blocker, setBlocker] = useState('');

  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>复现步骤跟踪</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>步骤</th>
            <th style={{ textAlign: 'left' }}>命令</th>
            <th style={{ textAlign: 'left' }}>状态</th>
            <th style={{ textAlign: 'left' }}>阻塞</th>
            <th style={{ textAlign: 'left' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {detail.steps.map((step) => (
            <tr key={step.id}>
              <td>{step.step_no}</td>
              <td><code>{step.command}</code></td>
              <td>{step.step_status}</td>
              <td>{step.blocker_reason || '-'}</td>
              <td>
                <Button
                  className="secondary"
                  onClick={() => {
                    setEditingStepId(step.id);
                    setStatus(step.step_status);
                    setNote(step.progress_note || '');
                    setBlocker(step.blocker_reason || '');
                  }}
                >
                  更新
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingStepId ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <h4 style={{ margin: 0 }}>编辑步骤 #{editingStepId}</h4>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">pending</option>
            <option value="in_progress">in_progress</option>
            <option value="done">done</option>
            <option value="blocked">blocked</option>
            <option value="skipped">skipped</option>
          </select>
          <textarea className="textarea" placeholder="进展记录" value={note} onChange={(e) => setNote(e.target.value)} />
          <textarea className="textarea" placeholder="阻塞原因（如有）" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              onClick={async () => {
                await onUpdateStep(editingStepId, {
                  step_status: status,
                  progress_note: note,
                  blocker_reason: blocker,
                });
                setEditingStepId(null);
              }}
            >保存步骤</Button>
            <Button className="secondary" onClick={() => setEditingStepId(null)}>取消</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
