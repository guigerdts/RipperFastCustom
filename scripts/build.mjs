/**
 * Assembles the installable UXP plugin folders in `dist/` and `dist-legacy/`.
 *
 * Steps:
 *   1. Bundle `src/main.ts` to `dist/index.js` (IIFE) through Vite.
 *   2. Inline the theme stylesheet into `dist/index.html`.
 *   3. Copy static assets when present.
 *   4. Write the modern manifest into `dist/`.
 *   5. Mirror the same bundle into `dist-legacy/` with the legacy manifest.
 *
 * Both folders carry identical code; only the manifest differs, which is the
 * whole point of the staged builds (`docs/compatibility-uxp.md`). The build is
 * reproducible: it reads only repository files and writes only inside `dist*`.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');
const legacyOutDir = path.join(root, 'dist-legacy');
const THEME_PLACEHOLDER = '/*__RIPPERFAST_THEME__*/';

const VARIANTS = [
  { key: 'modern', manifest: 'manifest.json', dir: outDir },
  { key: 'legacy', manifest: 'manifest-legacy.json', dir: legacyOutDir },
];

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

function describe(manifest) {
  const host = manifest.host ?? {};
  const apiVersion = host.data?.apiVersion;
  const range = host.maxVersion
    ? `PS ${host.minVersion}–${host.maxVersion}`
    : `PS ${host.minVersion}+`;
  return `manifest v${manifest.manifestVersion} · api v${apiVersion} · ${range}`;
}

async function main() {
  const loaded = [];
  for (const variant of VARIANTS) {
    const manifest = await readJson(path.join(root, variant.manifest));
    if (manifest.manifestVersion !== 4) {
      fail(
        `${variant.manifest}: manifestVersion must be 4, received ${String(manifest.manifestVersion)}`,
      );
    }
    loaded.push({ ...variant, manifest });
  }

  await rm(outDir, { recursive: true, force: true });
  await rm(legacyOutDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({ configFile: path.join(root, 'vite.config.mjs'), logLevel: 'warn' });

  const bundlePath = path.join(outDir, 'index.js');
  if (!existsSync(bundlePath)) fail('bundle dist/index.js was not produced');

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

  // The legacy folder is a copy of the modern one before the manifest is
  // replaced, so the two packages never drift in code.
  await cp(outDir, legacyOutDir, { recursive: true });
  await rm(path.join(legacyOutDir, 'manifest.json'), { force: true });

  for (const variant of loaded) {
    await writeFile(
      path.join(variant.dir, 'manifest.json'),
      `${JSON.stringify(variant.manifest, null, 2)}\n`,
      'utf8',
    );
  }

  const bundle = await readFile(bundlePath, 'utf8');
  console.log(`[build] bundle ${(bundle.length / 1024).toFixed(1)} kB (one bundle, two packages)`);
  for (const variant of loaded) {
    console.log(
      `[build] ${path.relative(root, variant.dir)}/ — ${variant.key} — ${describe(variant.manifest)}`,
    );
  }
}

main().catch((error) => {
  console.error(`[build] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
