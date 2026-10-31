import { cp, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.env.GEV_UPSTREAM_DIR || '/tmp/gods-eye-view';
const dirs = ['src', 'server', 'build', 'config', 'public', 'docs', 'tools'];
for (const dir of dirs) {
  await cp(path.join(upstream, dir), path.join(root, dir), { recursive: true, force: true });
}

// Keep the Android icon preparer owned by this app; upstream's icon generator
// remains available under its own name.
const iconPreparer = path.join(root, 'scripts', 'prepare-icon.mjs');
if (!existsSync(iconPreparer)) {
  throw new Error('Android icon preparation script was not preserved');
}

for (const file of [
  'index.html', 'style.css', 'vite.config.js', 'DATA_SOURCES.md',
  'LICENSE', 'README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md',
  'package.json',
]) {
  const from = path.join(upstream, file);
  if (existsSync(from)) await copyFile(from, path.join(root, file));
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.name = 'gods-eye-world';
pkg.private = true;
pkg.scripts = {
  ...pkg.scripts,
  'cap:sync': 'cap sync android',
  'android:assets': 'capacitor-assets generate --android',
};
pkg.dependencies = {
  ...pkg.dependencies,
  // Vercel's serverless adapter runs the upstream Vite middleware in production.
  vite: pkg.devDependencies.vite,
  'vite-plugin-cesium': pkg.devDependencies['vite-plugin-cesium'],
  '@capacitor/android': '^6.2.0',
  '@capacitor/core': '^6.2.0',
  '@capacitor/local-notifications': '^6.1.0',
};
pkg.devDependencies = {
  ...pkg.devDependencies,
  '@capacitor/cli': '^6.2.0',
  '@capacitor/assets': '^3.0.5',
};
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Integrated upstream application source and merged Android dependencies.');
