import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="card">
      <h2 className="title">Research Copilot</h2>
      <p className="subtle">进入专业研究工作台：</p>
      <Link className="button" href="/dashboard">打开仪表盘</Link>
    </div>
  );
}
