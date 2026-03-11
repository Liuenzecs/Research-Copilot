export type ReadingStatus = 'unread' | 'skimmed' | 'deep_read' | 'archived';
export type ReproInterest = 'none' | 'low' | 'medium' | 'high';

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: '未读',
  skimmed: '略读',
  deep_read: '精读',
  archived: '归档',
};

export const REPRO_INTEREST_LABELS: Record<ReproInterest, string> = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
};

export const READING_STATUS_OPTIONS: Array<{ value: ReadingStatus; label: string }> = [
  { value: 'unread', label: READING_STATUS_LABELS.unread },
  { value: 'skimmed', label: READING_STATUS_LABELS.skimmed },
  { value: 'deep_read', label: READING_STATUS_LABELS.deep_read },
  { value: 'archived', label: READING_STATUS_LABELS.archived },
];

export const REPRO_INTEREST_OPTIONS: Array<{ value: ReproInterest; label: string }> = [
  { value: 'none', label: REPRO_INTEREST_LABELS.none },
  { value: 'low', label: REPRO_INTEREST_LABELS.low },
  { value: 'medium', label: REPRO_INTEREST_LABELS.medium },
  { value: 'high', label: REPRO_INTEREST_LABELS.high },
];

export function readingStatusLabel(value?: string | null): string {
  if (!value) return '-';
  return READING_STATUS_LABELS[value as ReadingStatus] ?? value;
}

export function reproInterestLabel(value?: string | null): string {
  if (!value) return '-';
  return REPRO_INTEREST_LABELS[value as ReproInterest] ?? value;
}

