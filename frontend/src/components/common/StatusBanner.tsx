type StatusVariant = 'error' | 'warning' | 'success' | 'info';

const STYLE_BY_VARIANT: Record<StatusVariant, { background: string; border: string; color: string }> = {
  error: { background: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
  warning: { background: '#fffbeb', border: '#fde68a', color: '#b45309' },
  success: { background: '#ecfdf5', border: '#a7f3d0', color: '#0f766e' },
  info: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
};

export default function StatusBanner({ variant, message }: { variant: StatusVariant; message: string }) {
  const style = STYLE_BY_VARIANT[variant];

  return (
    <div
      style={{
        background: style.background,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        color: style.color,
        padding: '10px 12px',
      }}
    >
      <p style={{ margin: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{message}</p>
    </div>
  );
}
