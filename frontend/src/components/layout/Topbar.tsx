"use client";

export default function Topbar() {
  const now = new Date().toLocaleString('zh-CN');
  return (
    <header className="topbar">
      <div>
        <strong>专业研究工作流</strong>
        <div className="subtle">搜索、总结、复现、长期记忆、研究心得</div>
      </div>
      <div className="subtle">{now}</div>
    </header>
  );
}
