export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-badge">当前为空</div>
      <h3 className="title" style={{ fontSize: 16 }}>{title}</h3>
      {hint ? <p className="subtle">{hint}</p> : null}
    </div>
  );
}
