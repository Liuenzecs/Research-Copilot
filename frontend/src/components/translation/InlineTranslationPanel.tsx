export default function InlineTranslationPanel({
  english,
  chinese,
}: {
  english: string;
  chinese?: string;
}) {
  return (
    <div className="card">
      <h3 className="title" style={{ fontSize: 15 }}>原文 / 中文辅助</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{english}</p>
      {chinese ? (
        <>
          <hr style={{ borderColor: '#e5e7eb' }} />
          <p style={{ whiteSpace: 'pre-wrap' }}>{chinese}</p>
          <p className="subtle">AI翻译，仅供辅助理解</p>
        </>
      ) : null}
    </div>
  );
}
