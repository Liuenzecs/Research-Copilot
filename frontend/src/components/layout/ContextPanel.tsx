"use client";

export default function ContextPanel() {
  return (
    <aside className="context-panel">
      <div className="card">
        <h3 className="title" style={{ fontSize: 16 }}>上下文面板</h3>
        <p className="subtle">展示当前页面相关状态、最近任务和快捷入口。</p>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="title" style={{ fontSize: 16 }}>翻译提示</h3>
        <p className="subtle">AI翻译，仅供辅助理解。英文原文始终保留。</p>
      </div>
    </aside>
  );
}
