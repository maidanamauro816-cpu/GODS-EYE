import { createServer } from 'vite';
import { localProviderPlugins } from '../server/providers/local.js';
import { standaloneVoiceTools } from '../server/standalone/voiceTools.js';

let serverPromise;

async function getMiddlewareServer() {
  if (!serverPromise) {
    const tools = standaloneVoiceTools();
    serverPromise = createServer({
      configFile: false,
      root: process.cwd(),
      appType: 'custom',
      plugins: localProviderPlugins({
        realtime: { tools },
        gemini: { tools },
      }),
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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const allowedHosts = [
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      'gods-eye-neon.vercel.app',
    ].filter(Boolean).map((value) => value.toLowerCase());
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (process.env.VERCEL === '1' && !allowedHosts.includes(host)) {
      res.statusCode = 403;
      res.end('Blocked request host');
      return;
    }

    if (process.env.VERCEL === '1') {
      req.headers = { ...req.headers };
      // Vercel terminates TLS before the function. Reflect the original scheme
      // for the upstream exact-Origin comparison and remove only platform
      // transport metadata; Origin/Host checks remain active in provider code.
      try { req.socket.encrypted = true; } catch { /* immutable runtime socket */ }
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
