export default function ReproPlanPanel({ plan }: { plan: string }) {
  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>复现计划</h3>
      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{plan || '暂无计划，先生成。'}</pre>
    </div>
  );
}
