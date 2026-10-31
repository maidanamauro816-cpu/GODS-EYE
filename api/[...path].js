import { createServer } from 'vite';
import path from 'node:path';

let serverPromise;

async function getMiddlewareServer() {
  if (!serverPromise) {
    const hosts = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, 'gods-eye-neon.vercel.app'].filter(Boolean);
    process.env.GEV_ALLOWED_HOSTS = [...new Set(hosts)].join(',');
    serverPromise = createServer({
      configFile: path.resolve(process.cwd(), 'server/standalone/vite.config.js'),
      appType: 'custom',
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      optimizeDeps: { noDiscovery: true, include: [] },
    }).catch((error) => {
      serverPromise = undefined;
      throw error;
    });
  }
  return serverPromise;
}

export const config = { maxDuration: 60, api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    // Vercel terminates TLS and supplies forwarding headers itself. The
    // upstream local-server gate rejects those headers by design, so remove
    // only the platform transport metadata after Vercel has routed the
    // request. Origin/Host checks remain active in the provider middleware.
    if (process.env.VERCEL === '1') {
      req.headers = { ...req.headers };
      try { req.socket.encrypted = true; } catch { /* runtime socket may be immutable */ }
      for (const name of [
        'forwarded', 'via', 'x-forwarded-for', 'x-forwarded-host',
        'x-forwarded-port', 'x-forwarded-proto', 'x-real-ip',
        'cf-connecting-ip', 'cf-ray',
      ]) delete req.headers[name];
    }

    const vite = await getMiddlewareServer();
    await new Promise((resolve, reject) => {
      vite.middlewares(req, res, (error) => {
        if (error) return reject(error);
        if (!res.writableEnded) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'provider_not_found' }));
        }
        resolve();
      });
    });
  } catch (error) {
    console.error('[Gods Eye API adapter]', error?.stack || error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'provider_unavailable' }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
