"use client";

export default function TranslationToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className="subtle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
      显示中文辅助翻译（英文原文保留）
    </label>
  );
}
