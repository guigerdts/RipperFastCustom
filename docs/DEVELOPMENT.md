# Development

Everything in this project runs with **Node.js ≥ 20 and npm**. No global packages are
required or installed; every tool lives in `devDependencies`.

---

## 1. Setup

```bash
cd RipperFastCustom
npm install          # local only, ~140 packages
npm run check        # typecheck + lint + format check + tests
```

`npm run check` is the gate. If it is green, the tree is healthy.

---

## 2. Commands

| Command                     | What it does                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`             | Vite (lib, IIFE, ES2019) → `dist/index.js`; inlines the theme into `dist/index.html`; copies `manifest.json` and `assets/` |
| `npm run typecheck`         | `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`                            |
| `npm run lint`              | ESLint 10 flat config + `typescript-eslint` (non-type-checked rules; types are owned by `tsc`)                             |
| `npm run format`            | Prettier write                                                                                                             |
| `npm run format:check`      | Prettier verify (used in `check`)                                                                                          |
| `npm test`                  | Vitest with `happy-dom`, `tests/**/*.test.ts`                                                                              |
| `npm run test:watch`        | Vitest in watch mode                                                                                                       |
| `npm run validate:manifest` | Only the manifest contract suite                                                                                           |
| `npm run check`             | typecheck → lint → format:check → test                                                                                     |
| `npm run package`           | `check` + `build` — the release gate                                                                                       |

---

## 3. Test strategy

```
tests/
  unit/            Pure behaviour, no Photoshop needed        (green)
  compatibility/   Manifest contract + architecture boundary  (green)
  integration/     Requires a real Photoshop host             (SKIPPED, declared)
  helpers/         Fake `photoshop` / `uxp` modules and loader
```

- **Vitest + happy-dom** gives a DOM so the shell can mount and react to clicks.
- The module loader is injectable (`ModuleLoader = (id) => unknown`), so every test supplies
  fixtures instead of the real host. See `tests/helpers/fakeHost.ts`.
- **Real-Photoshop tests are marked `describe.skip`** with an explicit reason. They are not
  reported as passing. When you run on Windows, remove the `skip` and run `npm test`.

### Test-first policy

Behaviour changes are written test-first: observe the failing test, implement, then keep it
green. The suite is the specification for anything host-independent.

---

## 4. Project rules (enforced, not aspirational)

| Rule                                                | Enforced by                                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| Only `src/adapters/` may touch `photoshop` / `uxp`  | `architecture-boundary.test.ts`                        |
| `src/engines/` stays pure — no host, no DOM, no I/O | `architecture-boundary.test.ts`                        |
| ES and EN dictionaries have identical keys          | `i18n.test.ts` + `Record<TranslationKey, string>` type |
| Manifest stays within the v4 contract               | `manifest.test.ts`                                     |
| No user-visible text hardcoded in components        | review + i18n key coverage                             |

Run `npm run check` before every commit.

---

## 5. Windows workflow (loading the plugin)

Photoshop and UXP Developer Tool run on **Windows** (or macOS). They do **not** run on
Linux — see `docs/COMPATIBILITY.md` §5.

1. On Windows, clone/copy this repository (or just the `dist/` folder).
2. Install **Adobe Photoshop 22.0 or newer**.
3. Install **UXP Developer Tool** from the Adobe Developer Console
   (developer.adobe.com → Photoshop → UXP Developer Tool).
4. Build:

   ```bash
   npm install
   npm run package      # runs the full check, then produces dist/
   ```

5. Open **UXP Developer Tool** → **Add Plugin…** → navigate to `dist/` (the folder that
   contains `manifest.json`) → **Add**.
6. Select the plugin in the list and press **Load**.
7. Open Photoshop: **Plugins → RipperFastCustom**. The panel appears in the dock.
8. **Reload** in the tool after every rebuild.

### What you should see

- Header: product name and version `0.1.0`.
- Dashboard: **Photoshop: Conectado**, the host version, the UXP runtime version, and — if a
  document is open — its dimensions and resolution.
- Eight navigation entries; the six feature modules render an explicit **pending** screen.
- **Settings** switches between Español and English instantly.

If the panel does not appear, confirm `dist/manifest.json` exists and that Photoshop's
version is ≥ 22.0.0.

---

## 6. Ubuntu development

Development (edit, typecheck, lint, test, build) works on Ubuntu, including aarch64. What
does **not** work here:

- installing or running UXP Developer Tool,
- running Photoshop,
- loading the plugin,
- running the `tests/integration/` suite.

That is an environment limitation, not a project limitation: nothing in the build depends on
the host OS. CI on Linux can run `npm run check` and `npm run build` without any Adobe
software.

---

## 7. Architecture and decisions

- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, boundaries, data flow.
- [DECISIONS.md](DECISIONS.md) — why each technical choice was made.
- [ROADMAP.md](ROADMAP.md) — what lands next.
