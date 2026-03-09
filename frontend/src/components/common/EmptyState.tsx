export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>{title}</h3>
      {hint ? <p className="subtle">{hint}</p> : null}
    </div>
  );
}
