export function assetUrl(path) {
  if (typeof path !== 'string' || path.length === 0) return path;
  if (/^https?:\/\//i.test(path)) return path;

  const base = import.meta.env.BASE_URL || '/';
  const cleaned = path.startsWith('/') ? path.slice(1) : path;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${cleaned}`;
}

