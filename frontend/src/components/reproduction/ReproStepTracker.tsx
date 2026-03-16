"use client";

import { useMemo, useState } from 'react';

import Button from '@/components/common/Button';
import { ReproductionDetail } from '@/lib/types';

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '待开始';
    case 'in_progress':
      return '进行中';
    case 'done':
      return '已完成';
    case 'blocked':
      return '已阻塞';
    case 'skipped':
      return '已跳过';
    default:
      return status;
  }
}

function riskLabel(riskLevel: string) {
  switch (riskLevel) {
    case 'low':
      return '低风险';
    case 'medium':
      return '中风险';
    case 'high':
      return '高风险';
    default:
      return riskLevel;
  }
}

function pillStyle(background: string, color = '#111827') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 999,
    background,
    color,
    fontSize: 12,
    fontWeight: 600,
  } as const;
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

export default function ReproStepTracker({
  detail,
  onUpdateStep,
  onCreateLog,
}: {
  detail: ReproductionDetail;
  onUpdateStep: (stepId: number, payload: { step_status?: string; progress_note?: string; blocker_reason?: string }) => Promise<void>;
  onCreateLog: (stepId: number, payload: { log_text: string; log_kind: 'note' | 'blocker' }) => Promise<void>;
}) {
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [loggingStepId, setLoggingStepId] = useState<number | null>(null);
  const [expandedLogStepId, setExpandedLogStepId] = useState<number | null>(null);
  const [status, setStatus] = useState('pending');
  const [note, setNote] = useState('');
  const [blocker, setBlocker] = useState('');
  const [logText, setLogText] = useState('');
  const [logKind, setLogKind] = useState<'note' | 'blocker'>('note');
  const [submittingLog, setSubmittingLog] = useState(false);
  const [savingStep, setSavingStep] = useState(false);

  const logsByStep = useMemo(() => {
    const map = new Map<number, ReproductionDetail['logs']>();
    for (const log of detail.logs) {
      if (!log.step_id) continue;
      const existing = map.get(log.step_id) ?? [];
      existing.push(log);
      map.set(log.step_id, existing);
    }
    return map;
  }, [detail.logs]);

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 className="title" style={{ fontSize: 16, marginBottom: 6 }}>复现步骤跟踪</h3>
        <p className="subtle" style={{ margin: 0 }}>
          每一步都展示执行目标、风险、完成判据与安全检查；若遇到问题，请在对应步骤下记录日志或阻塞信息。
        </p>
      </div>

      {detail.steps.map((step) => {
        const stepLogs = logsByStep.get(step.id) ?? [];
        const isEditing = editingStepId === step.id;
        const isLogging = loggingStepId === step.id;
        const isLogExpanded = expandedLogStepId === step.id;

        return (
          <section
            key={step.id}
            className="card"
            style={{
              display: 'grid',
              gap: 10,
              margin: 0,
              border: step.step_status === 'blocked' ? '1px solid #f59e0b' : '1px solid rgba(15, 23, 42, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>步骤 {step.step_no}</strong>
                  <span style={pillStyle('#e0f2fe', '#0c4a6e')}>{statusLabel(step.step_status)}</span>
                  <span style={pillStyle('#f3f4f6')}>{riskLabel(step.risk_level)}</span>
                  <span style={pillStyle(step.requires_manual_confirm ? '#fef3c7' : '#dcfce7', step.requires_manual_confirm ? '#92400e' : '#166534')}>
                    {step.requires_manual_confirm ? '需人工确认' : '可直接执行'}
                  </span>
                  <span style={pillStyle(step.safe ? '#dcfce7' : '#fee2e2', step.safe ? '#166534' : '#991b1b')}>
                    {step.safe ? '安全检查通过' : '安全检查未通过'}
                  </span>
                </div>
                <code style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{step.command}</code>
                <p className="subtle" style={{ margin: 0 }}>目的：{step.purpose || '待补充'}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <Button
                  className="secondary"
                  onClick={() => {
                    setEditingStepId(step.id);
                    setLoggingStepId(null);
                    setStatus(step.step_status);
                    setNote(step.progress_note || '');
                    setBlocker(step.blocker_reason || '');
                  }}
                >
                  更新步骤
                </Button>
                <Button
                  className="secondary"
                  onClick={() => {
                    setLoggingStepId(step.id);
                    setEditingStepId(null);
                    setExpandedLogStepId(step.id);
                    setLogKind(step.step_status === 'blocked' ? 'blocker' : 'note');
                    setLogText('');
                  }}
                >
                  记录日志
                </Button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <p style={{ margin: 0 }}>
                <strong>完成判据：</strong>{step.expected_output || '暂无明确 expected output。'}
              </p>
              {step.progress_note ? (
                <p style={{ margin: 0 }}>
                  <strong>最近进展：</strong>{step.progress_note}
                </p>
              ) : (
                <p className="subtle" style={{ margin: 0 }}>最近进展：尚未记录。</p>
              )}
              {step.blocker_reason ? (
                <p style={{ margin: 0, color: '#92400e' }}>
                  <strong>当前阻塞：</strong>{step.blocker_reason}
                </p>
              ) : null}
              {!step.safe ? (
                <p style={{ margin: 0, color: '#b91c1c' }}>
                  <strong>安全提示：</strong>{step.safety_reason || '该命令需要先人工确认再继续。'}
                </p>
              ) : null}
            </div>

            {isEditing ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>编辑当前步骤</h4>
                <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="pending">待开始</option>
                  <option value="in_progress">进行中</option>
                  <option value="done">已完成</option>
                  <option value="blocked">已阻塞</option>
                  <option value="skipped">skipped</option>
                </select>
                <textarea className="textarea" placeholder="进展记录" value={note} onChange={(event) => setNote(event.target.value)} />
                <textarea className="textarea" placeholder="阻塞原因（如有）" value={blocker} onChange={(event) => setBlocker(event.target.value)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    disabled={savingStep}
                    onClick={async () => {
                      setSavingStep(true);
                      try {
                        await onUpdateStep(step.id, {
                          step_status: status,
                          progress_note: note,
                          blocker_reason: blocker,
                        });
                        setEditingStepId(null);
                      } finally {
                        setSavingStep(false);
                      }
                    }}
                  >
                    {savingStep ? '保存中...' : '保存步骤'}
                  </Button>
                  <Button className="secondary" onClick={() => setEditingStepId(null)}>取消</Button>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>步骤日志</strong>
                <Button
                  className="secondary"
                  onClick={() => setExpandedLogStepId(isLogExpanded ? null : step.id)}
                >
                  {isLogExpanded ? '收起日志' : `查看日志（${stepLogs.length}）`}
                </Button>
              </div>

              {isLogExpanded ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {stepLogs.length > 0 ? (
                    stepLogs.map((log) => (
                      <div key={log.id} style={{ padding: 10, borderRadius: 8, background: '#f8fafc' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                          <span style={pillStyle(log.error_type === 'unknown' ? '#f3f4f6' : '#fee2e2', log.error_type === 'unknown' ? '#374151' : '#991b1b')}>
                            {log.error_type || 'unknown'}
                          </span>
                          <span className="subtle">{formatDateTime(log.created_at)}</span>
                        </div>
                        <p style={{ margin: '0 0 6px 0', whiteSpace: 'pre-wrap' }}>{log.log_text}</p>
                        <p className="subtle" style={{ margin: 0 }}>
                          建议下一步：{log.next_step_suggestion || '暂无自动建议。'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="subtle" style={{ margin: 0 }}>当前步骤还没有日志，建议在遇到失败或阻塞时及时记录。</p>
                  )}
                </div>
              ) : null}

              {isLogging ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h4 style={{ margin: 0 }}>记录当前步骤日志</h4>
                  <select
                    className="select"
                    value={logKind}
                    onChange={(event) => setLogKind(event.target.value as 'note' | 'blocker')}
                  >
                    <option value="note">普通日志</option>
                    <option value="blocker">阻塞日志</option>
                  </select>
                  <textarea
                    className="textarea"
                    placeholder={logKind === 'blocker' ? '请粘贴报错、阻塞描述或失败输出' : '请记录本步输出、实验现象或异常信息'}
                    value={logText}
                    onChange={(event) => setLogText(event.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      disabled={submittingLog || !logText.trim()}
                      onClick={async () => {
                        setSubmittingLog(true);
                        try {
                          await onCreateLog(step.id, {
                            log_text: logText.trim(),
                            log_kind: logKind,
                          });
                          setLoggingStepId(null);
                          setExpandedLogStepId(step.id);
                          setLogText('');
                          setLogKind('note');
                        } finally {
                          setSubmittingLog(false);
                        }
                      }}
                    >
                      {submittingLog ? '提交中...' : logKind === 'blocker' ? '保存阻塞日志' : '保存普通日志'}
                    </Button>
                    <Button className="secondary" onClick={() => setLoggingStepId(null)}>取消</Button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
