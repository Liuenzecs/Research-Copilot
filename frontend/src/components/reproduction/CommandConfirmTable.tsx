export default function CommandConfirmTable({
  commands,
}: {
  commands: Array<{ step_no: number; command: string; risk_level: string }>;
}) {
  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 16 }}>命令确认表（MVP默认不自动执行）</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>步骤</th>
            <th style={{ textAlign: 'left' }}>命令</th>
            <th style={{ textAlign: 'left' }}>风险</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((c) => (
            <tr key={`${c.step_no}-${c.command}`}>
              <td>{c.step_no}</td>
              <td><code>{c.command}</code></td>
              <td>{c.risk_level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
