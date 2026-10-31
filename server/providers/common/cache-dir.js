import path from 'node:path';

/**
 * Persistent cache directory for a normal Node host, and the writable
 * per-instance scratch directory for Vercel serverless functions.
 * Vercel's deployed source tree is read-only; /tmp is writable but ephemeral.
 */
export function defaultCacheDir() {
  const configured = String(process.env.GEV_CACHE_DIR || '').trim();
  if (configured) return path.resolve(configured);
  if (process.env.VERCEL === '1') return '/tmp/gev-cache';
  return path.join(process.cwd(), '.gev-cache');
}
