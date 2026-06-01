export function assetUrl(path) {
  if (typeof path !== 'string' || path.length === 0) return path;
  if (/^https?:\/\//i.test(path)) return path;

  const base = import.meta.env.BASE_URL || '/';
  const cleaned = path.startsWith('/') ? path.slice(1) : path;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${cleaned}`;
}

/** 版本号拼到 URL，避免更新后浏览器/PWA 仍用旧音频缓存 */
export function versionedAssetUrl(path, buildId = null) {
  const resolved = assetUrl(path);
  if (!resolved || /^https?:\/\//i.test(resolved)) return resolved;
  const version = buildId
    || (typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev');
  const joiner = resolved.includes('?') ? '&' : '?';
  return `${resolved}${joiner}v=${encodeURIComponent(version)}`;
}

