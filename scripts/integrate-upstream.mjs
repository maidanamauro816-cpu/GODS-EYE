import { cp, copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.env.GEV_UPSTREAM_DIR || '/tmp/gods-eye-view';
const preservedDir = '/tmp/gods-eye-preserved-scripts';
await mkdir(preservedDir, { recursive: true });
for (const name of ['prepare-icon.mjs', 'integrate-upstream.mjs']) {
  const ownFile = path.join(root, 'scripts', name);
  if (existsSync(ownFile)) await copyFile(ownFile, path.join(preservedDir, name));
}
for (const dir of ['src', 'server', 'build', 'config', 'public', 'docs', 'tools', 'changelog.d', 'pinokio', '.agents']) {
  await cp(path.join(upstream, dir), path.join(root, dir), { recursive: true, force: true });
}
await cp(path.join(upstream, 'scripts'), path.join(root, 'scripts'), { recursive: true, force: true });
for (const name of ['prepare-icon.mjs', 'integrate-upstream.mjs']) {
  const saved = path.join(preservedDir, name);
  if (existsSync(saved)) await copyFile(saved, path.join(root, 'scripts', name));
}
const iconPreparer = path.join(root, 'scripts', 'prepare-icon.mjs');
if (!existsSync(iconPreparer)) throw new Error('Android icon preparation script was not preserved');
for (const file of ['index.html', 'style.css', 'vite.config.js', 'DATA_SOURCES.md', 'LICENSE', 'README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'CONTRIBUTING.md', 'TESTING.md', '.env.example', '.gitignore', '.dockerignore', '.prettierignore', '.prettierrc.json', 'Dockerfile', 'compose.yaml']) {
  const from = path.join(upstream, file);
  if (existsSync(from)) await copyFile(from, path.join(root, file));
}
// Restore EL OJO DE DIOS branding after importing the upstream UI.
const brandIcon = path.join(root, 'assets', 'icon.svg');
if (existsSync(brandIcon)) {
  const publicLogo = path.join(root, 'public', 'logo.svg');
  await copyFile(brandIcon, publicLogo);
  let logo = await readFile(publicLogo, 'utf8');
  logo = logo.replace('<svg xmlns=', '<svg role="img" aria-labelledby="brand-title" xmlns=');
  logo = logo.replace('viewBox="0 0 512 512">', 'viewBox="0 0 512 512"><title id="brand-title">EL OJO DE DIOS</title>');
  await writeFile(publicLogo, logo);
}
const htmlPath = path.join(root, 'index.html');
let html = await readFile(htmlPath, 'utf8');
html = html.replace('<html lang="en">', '<html lang="es">');
html = html.replace("<title>God's Eye View</title>", '<title>EL OJO DE DIOS</title>');
html = html.replace('<meta name="apple-mobile-web-app-title" content="God\'s Eye" />', '<meta name="apple-mobile-web-app-title" content="EL OJO DE DIOS" />');
await writeFile(htmlPath, html);
const manifestPath = path.join(root, 'public', 'manifest.webmanifest');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name = 'EL OJO DE DIOS';
  manifest.short_name = 'OJO DE DIOS';
  manifest.description = 'Globo 3D e inteligencia geoespacial en tiempo real.';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
const chromePath = path.join(root, 'src', 'ui', 'templates', 'scene-chrome.html');
let chrome = await readFile(chromePath, 'utf8');
chrome = chrome.replace(
  '<span class="title-logo brand-logo" data-logo-gaze data-logo-src="/logo.svg" aria-hidden="true"><img src="/logo.svg" alt="" /></span> <span translate="no">GOD\'S EYE <span class="title-accent">VIEW</span></span>',
  '<span class="title-logo brand-logo" aria-hidden="true"><img src="/logo.svg" alt="" /></span> <span translate="no">EL OJO <span class="title-accent">DE DIOS</span></span>',
);
await writeFile(chromePath, chrome);

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.name = 'gods-eye-view';
pkg.private = true;
pkg.scripts = { ...pkg.scripts, 'cap:sync': 'cap sync android', 'android:assets': 'capacitor-assets generate --android' };
pkg.dependencies = {
  ...pkg.dependencies,
  vite: pkg.devDependencies.vite,
  ws: pkg.devDependencies.ws,
  'vite-plugin-cesium': pkg.devDependencies['vite-plugin-cesium'],
  '@capacitor/android': '^6.2.0',
  '@capacitor/core': '^6.2.0',
  '@capacitor/local-notifications': '^6.1.0',
};
pkg.devDependencies = { ...pkg.devDependencies, '@capacitor/cli': '^6.2.0', '@capacitor/assets': '^3.0.5', typescript: '^5.7.3' };
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const mainPath = path.join(root, 'src', 'main.js');
let main = await readFile(mainPath, 'utf8');
const bridge = [
  "import { Capacitor } from '@capacitor/core';",
  "const GODS_EYE_API_ORIGIN = import.meta.env.VITE_GEV_API_ORIGIN || 'https://gods-eye-neon.vercel.app';",
  'if (Capacitor.isNativePlatform()) {',
  '  const godsEyeFetch = globalThis.fetch.bind(globalThis);',
  '  globalThis.fetch = (input, init) => {',
  "    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;",
  '    if (typeof raw === \'string\') {',
  '      try {',
  '        const target = new URL(raw, window.location.origin);',
  '        if (target.origin === window.location.origin && target.pathname.startsWith(\'/api/\')) {',
  '          const absolute = GODS_EYE_API_ORIGIN + target.pathname + target.search;',
  '          if (input instanceof Request) return godsEyeFetch(new Request(absolute, input), init);',
  '          return godsEyeFetch(absolute, init);',
  '        }',
  '      } catch { /* Leave non-URL inputs to the native fetch implementation. */ }',
  '    }',
  '    return godsEyeFetch(input, init);',
  '  };',
  '}',
  '',
].join(String.fromCharCode(10));
if (!main.includes('GODS_EYE_API_ORIGIN')) main = bridge + main;
await writeFile(mainPath, main);

const gatePath = path.join(root, 'src', 'localRequestGate.mjs');
let gate = await readFile(gatePath, 'utf8');
gate = gate.replace("  if (site !== '' && site !== 'same-origin' && site !== 'none') {", "  const nativeAppOrigin = ['capacitor://localhost', 'https://localhost'].includes(String(origin || ''));\n  if (site !== '' && site !== 'same-origin' && site !== 'none' && !nativeAppOrigin) {");
gate = gate.replace('  // (3) If Origin is present it must exactly equal the request\'s own authority.', '  // The installed Capacitor shell uses this fixed, app-owned origin.\n  if (nativeAppOrigin) return { ok: true };\n  // (3) If Origin is present it must exactly equal the request\'s own authority.');
await writeFile(gatePath, gate);
console.log('Integrated upstream source, Vercel runtime dependencies, and Android API bridge.');
