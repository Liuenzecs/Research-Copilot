export function cn(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
