export const APP_BRAND = 'Research Copilot';

export function buildPageTitle(title?: string | null) {
  const normalized = (title || '').trim();
  return normalized ? `${normalized} | ${APP_BRAND}` : APP_BRAND;
}
