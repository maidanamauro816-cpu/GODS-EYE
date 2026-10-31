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
for (const dir of ['src', 'server', 'build', 'config', 'public', 'docs', 'tools']) {
  await cp(path.join(upstream, dir), path.join(root, dir), { recursive: true, force: true });
}
await cp(path.join(upstream, 'scripts'), path.join(root, 'scripts'), { recursive: true, force: true });
for (const name of ['prepare-icon.mjs', 'integrate-upstream.mjs']) {
  const saved = path.join(preservedDir, name);
  if (existsSync(saved)) await copyFile(saved, path.join(root, 'scripts', name));
}
const iconPreparer = path.join(root, 'scripts', 'prepare-icon.mjs');
if (!existsSync(iconPreparer)) throw new Error('Android icon preparation script was not preserved');
for (const file of ['index.html', 'style.css', 'vite.config.js', 'DATA_SOURCES.md', 'LICENSE', 'README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'package.json']) {
  const from = path.join(upstream, file);
  if (existsSync(from)) await copyFile(from, path.join(root, file));
}
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.name = 'gods-eye-world';
pkg.private = true;
pkg.scripts = { ...pkg.scripts, 'cap:sync': 'cap sync android', 'android:assets': 'capacitor-assets generate --android' };
pkg.dependencies = {
  ...pkg.dependencies,
  vite: pkg.devDependencies.vite,
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
  "const GODS_EYE_API_ORIGIN = 'https://gods-eye-neon.vercel.app';",
  'const godsEyeFetch = globalThis.fetch.bind(globalThis);',
  'globalThis.fetch = (input, init) => {',
  "  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;",
  "  if (typeof raw === 'string' && raw.startsWith('/api/')) {",
  '    const absolute = GODS_EYE_API_ORIGIN + raw;',
  '    if (input instanceof Request) return godsEyeFetch(new Request(absolute, input), init);',
  '    return godsEyeFetch(absolute, init);',
  '  }',
  '  return godsEyeFetch(input, init);',
  '};',
  '',
].join('\n');
if (!main.includes('GODS_EYE_API_ORIGIN')) main = bridge + main;
await writeFile(mainPath, main);

const gatePath = path.join(root, 'src', 'localRequestGate.mjs');
let gate = await readFile(gatePath, 'utf8');
gate = gate.replace("  if (site !== '' && site !== 'same-origin' && site !== 'none') {", "  const nativeAppOrigin = String(origin || '') === 'capacitor://localhost';\n  if (site !== '' && site !== 'same-origin' && site !== 'none' && !nativeAppOrigin) {");
gate = gate.replace('  // (3) If Origin is present it must exactly equal the request\'s own authority.', '  // The installed Capacitor shell uses this fixed, app-owned origin.\n  if (nativeAppOrigin) return { ok: true };\n  // (3) If Origin is present it must exactly equal the request\'s own authority.');
await writeFile(gatePath, gate);
console.log('Integrated upstream source, Vercel runtime dependencies, and Android API bridge.');
