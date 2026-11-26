/**
 * Assembles the installable UXP plugin folder in `dist/`.
 *
 * Steps:
 *   1. Bundle `src/main.ts` to `dist/index.js` (IIFE) through Vite.
 *   2. Copy `manifest.json` verbatim to `dist/manifest.json`.
 *   3. Inline the theme stylesheet into `dist/index.html`.
 *   4. Copy static assets when present.
 *
 * The build is reproducible: it reads only repository files and writes only
 * inside `dist/`.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');
const THEME_PLACEHOLDER = '/*__RIPPERFAST_THEME__*/';

function fail(message) {
  throw new Error(message);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    return fail(`cannot read ${path.relative(root, file)}: ${error.message}`);
  }
}

async function main() {
  const manifest = await readJson(path.join(root, 'manifest.json'));
  if (manifest.manifestVersion !== 4) {
    fail(`manifestVersion must be 4, received ${String(manifest.manifestVersion)}`);
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({ configFile: path.join(root, 'vite.config.mjs'), logLevel: 'warn' });

  const bundlePath = path.join(outDir, 'index.js');
  if (!existsSync(bundlePath)) fail('bundle dist/index.js was not produced');

  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const htmlTemplate = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!htmlTemplate.includes(THEME_PLACEHOLDER)) {
    fail('index.html is missing the theme placeholder');
  }
  const themeCss = await readFile(path.join(root, 'src/ui/theme/theme.css'), 'utf8');
  await writeFile(
    path.join(outDir, 'index.html'),
    htmlTemplate.replace(THEME_PLACEHOLDER, themeCss),
    'utf8',
  );

  const assetsDir = path.join(root, 'assets');
  if (existsSync(assetsDir)) {
    await cp(assetsDir, path.join(outDir, 'assets'), {
      recursive: true,
      // Documentation lives in the repository, not in the installable folder.
      filter: (source) => !source.endsWith('README.md'),
    });
  }

  const bundle = await readFile(bundlePath, 'utf8');
  console.log(
    `[build] dist/ ready — manifest v${manifest.manifestVersion} · api v${manifest.host.data.apiVersion} · ` +
      `min PS ${manifest.host.minVersion} · bundle ${(bundle.length / 1024).toFixed(1)} kB`,
  );
}

main().catch((error) => {
  console.error(`[build] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
