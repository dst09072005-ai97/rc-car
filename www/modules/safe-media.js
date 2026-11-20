export const YT_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function sanitizeSafeMediaUrl(value) {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  try {
    if (url.startsWith('/api/')) {
      const parsed = new URL(url, 'https://local.invalid');
      return parsed.origin === 'https://local.invalid' && parsed.pathname.startsWith('/api/') ? url : '';
    }
    if (/^https?:\/\//i.test(url)) return new URL(url).href;
  } catch {}
  return '';
}
