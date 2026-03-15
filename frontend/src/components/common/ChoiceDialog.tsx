"use client";

import Button from '@/components/common/Button';

type ChoiceDialogOption = {
  label: string;
  description?: string;
  variant?: 'primary' | 'secondary';
  onSelect: () => void | Promise<void>;
};

export default function ChoiceDialog({
  open,
  title,
  description,
  options,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  options: ChoiceDialogOption[];
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(560px, 100%)', display: 'grid', gap: 12 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <h3 className="title" style={{ fontSize: 18 }}>
            {title}
          </h3>
          {description ? <p className="subtle" style={{ margin: 0 }}>{description}</p> : null}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              className={`button ${option.variant === 'secondary' ? 'secondary' : ''}`.trim()}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                display: 'grid',
                gap: 4,
              }}
              onClick={() => {
                void option.onSelect();
              }}
            >
              <span>{option.label}</span>
              {option.description ? <span style={{ fontSize: 12, opacity: 0.9 }}>{option.description}</span> : null}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button className="secondary" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
