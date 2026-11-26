# RipperFastCustom

Professional Adobe Photoshop plugin for **screen printing (serigrafía)**, **DTF** and
advanced **halftone** generation.

**Status:** v0.1.0 — foundation release (tasks E0/E1). The plugin loads as a real UXP panel
with environment detection, bilingual UI and a modular architecture. Feature modules are
declared but intentionally **not implemented yet**; they appear as explicit pending sections.

---

## What this release contains

| Area                                                                                                             | State                                |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| UXP manifest v4, Photoshop `minVersion 22.0.0`, API **v1**                                                       | done                                 |
| Floating panel with graphite/electric-blue theme                                                                 | done                                 |
| 8-section navigation (Dashboard · Serigrafía · DTF · Halftone · Calibration · Preflight · Production · Settings) | done                                 |
| Environment detection (Photoshop version, UXP version, active document, capabilities)                            | done                                 |
| Spanish/English i18n with typed keys and instant switching                                                       | done                                 |
| Adapter layer (`PhotoshopHostAdapter`, `DocumentService`, `LayerService`, `UXPEnvironmentService`)               | done                                 |
| Automated tests (host-independent)                                                                               | done — 66 passing                    |
| Installable build in `dist/`                                                                                     | done                                 |
| Loading inside real Photoshop                                                                                    | **pending — requires Windows**       |
| Screen printing / DTF / halftone engines                                                                         | pending (boundaries documented only) |

---

## Requirements

- **To develop:** Linux or macOS or Windows, Node.js ≥ 20, npm.
- **To run the plugin:** Windows (or macOS) with **Adobe Photoshop 22.0 or newer** and
  **UXP Developer Tool**. Photoshop and the developer tool do not run on Linux.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full workflow and
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the compatibility contract.

---

## Quick start

```bash
npm install          # local dev dependencies only
npm run check        # typecheck + lint + format check + tests
npm run build        # produces the installable folder in dist/
```

Load `dist/` into Photoshop with UXP Developer Tool:

1. Open **UXP Developer Tool** on Windows.
2. **Add Plugin…** → select the `dist/` folder of this repository (it contains `manifest.json`).
3. Select the plugin in the list and press **Load**.
4. In Photoshop: **Plugins → RipperFastCustom** (or the panel dock).
5. After changing code, run `npm run build` again and press **Reload** in the tool.

---

## Commands

| Command                                   | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `npm run build`                           | Bundle `src/main.ts` + inline theme + copy manifest → `dist/` |
| `npm run typecheck`                       | Strict TypeScript, no emit                                    |
| `npm run lint`                            | ESLint (flat config)                                          |
| `npm run format` / `npm run format:check` | Prettier write / verify                                       |
| `npm test`                                | Vitest, host-independent suite                                |
| `npm run validate:manifest`               | Manifest contract tests only                                  |
| `npm run check`                           | typecheck + lint + format:check + test                        |
| `npm run package`                         | `check` + `build` — the release gate                          |

---

## Repository layout

```
manifest.json            UXP manifest v4 (source of truth; copied into dist/)
index.html               Panel HTML template (theme inlined at build time)
scripts/build.mjs        Assembles dist/
src/
  main.ts                Plugin entrypoint
  app/                   Bootstrap and application context
  ui/                    Shell, screens, components, theme
  adapters/              The ONLY place allowed to touch Photoshop/UXP modules
    capability.ts        Capability contract
    photoshop/api-v1/    API v1 implementation
    uxp/                 UXP environment service
    runtime/             Injectable module loader (test seam)
  engines/               Pure processing kernels (boundaries only, no code yet)
  modules/               Feature module contracts + registry (all pending)
  services/              Storage (session) and diagnostics
  i18n/                  Spanish (canonical) + English dictionaries
  validation/            Manifest, config and version validation
  constants/ types/      Shared constants and host typings
tests/
  unit/                  Host-independent behaviour
  compatibility/         Manifest + architecture boundary contracts
  integration/           Declared, SKIPPED — requires a real Photoshop host
docs/                    Architecture, compatibility, development, decisions, roadmap
```

---

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, boundaries, data flow
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — Photoshop 22.0+ contract and version semantics
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, testing, packaging, Windows/Ubuntu workflow
- [docs/DECISIONS.md](docs/DECISIONS.md) — why each technical choice was made
- [docs/ROADMAP.md](docs/ROADMAP.md) — what lands next

---

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Guillermo Barros.

The source is developed in the open at
[github.com/guigerdts/RipperFastCustom](https://github.com/guigerdts/RipperFastCustom).
