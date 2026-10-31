import { createServer } from 'vite';
import { localProviderPlugins } from '../server/providers/local.js';
import { standaloneVoiceTools } from '../server/standalone/voiceTools.js';

let serverPromise;

async function getMiddlewareServer() {
  if (!serverPromise) {
    const tools = standaloneVoiceTools();
    // A serverless invocation can serve bounded HTTP requests, but it
    // cannot own local SDR hardware, persist a process-wide AIS WebSocket, or
    // safely write credentials to an ephemeral filesystem. Those three
    // machine-local providers stay enabled in the full standalone Node build.
    const serverlessPlugins = localProviderPlugins({
      realtime: { tools },
      gemini: { tools },
    }).filter((plugin) => ![
      'local-receivers-proxy',
      'ais-live-proxy',
      'gev-key-setup',
    ].includes(plugin.name));
    serverPromise = createServer({
      configFile: false,
      root: process.cwd(),
      appType: 'custom',
      plugins: serverlessPlugins,
      server: { middlewareMode: true, hmr: false, watch: null },
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
      'gods-eye-git-feature-gods-eye-view-i-24bbf9-maidanamauro816-cpu.vercel.app',
    ].filter(Boolean).map((value) => value.toLowerCase());
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (process.env.VERCEL === '1' && !allowedHosts.includes(host)) {
      res.statusCode = 403;
      res.end('Blocked request host');
      return;
    }

    if (process.env.VERCEL === '1') {
      req.headers = { ...req.headers };
      // Vercel terminates TLS before invoking Node. Normalize the socket
      // scheme and strip only platform forwarding metadata before local gates.
      try {
        Object.defineProperty(req.socket, 'encrypted', {
          value: true,
          configurable: true,
        });
      } catch {
        /* immutable runtime socket */
      }
      for (const name of [
        'forwarded', 'via', 'x-forwarded-for', 'x-forwarded-host',
        'x-forwarded-port', 'x-forwarded-proto', 'x-real-ip',
        'cf-connecting-ip', 'cf-ray',
      ]) delete req.headers[name];
    }

    const vite = await getMiddlewareServer();
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        res.removeListener('finish', finish);
        res.removeListener('close', finish);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      // Provider middleware usually ends the response without calling next().
      // Resolve on response completion as well as on Connect's next callback.
      res.once('finish', finish);
      res.once('close', finish);
      try {
        vite.middlewares(req, res, (error) => {
          if (error) return fail(error);
          if (!res.writableEnded) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'provider_not_found' }));
          }
          finish();
        });
      } catch (error) {
        fail(error);
      }
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
