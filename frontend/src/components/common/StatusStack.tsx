import StatusBanner from '@/components/common/StatusBanner';

export type StatusItem = {
  variant: 'error' | 'warning' | 'success' | 'info';
  message: string;
};

export default function StatusStack({ items }: { items: StatusItem[] }) {
  const visibleItems = items.filter((item) => item.message.trim());

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {visibleItems.map((item, index) => (
        <StatusBanner key={`${item.variant}-${item.message}-${index}`} variant={item.variant} message={item.message} />
      ))}
    </div>
  );
}
