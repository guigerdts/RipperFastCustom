# RipperFastCustom — E0/E1 Foundation & UXP Bootstrap

Objective: deliver RipperFastCustom v0.1.0 as a loadable Photoshop UXP plugin with modular
architecture, ES/EN i18n, host capability detection, automated tests and full docs.
Branch: `main` · Delivery: single branch, no PRs yet (local only) · Test runner: `vitest`.

## Specs

### S1 — Environment audit (E0)
- Identify the current directory, check whether a project already exists, and never overwrite
  pre-existing files: "No sobrescribas proyectos existentes."
- Check Git, Node.js, npm and available versions: "Comprueba Git, Node.js y npm."
- Check Gentle AI, Engram, GGA, CodeGraph and Context7 without modifying their configurations:
  "Comprueba Gentle AI, Engram, GGA, CodeGraph y Context7 sin modificar sus configuraciones."
- Identify Linux limitations for running UXP Developer Tool and Photoshop:
  "Identifica limitaciones del entorno Linux para ejecutar UXP Developer Tool y Photoshop."
- "No instales dependencias globales sin autorización."

### S2 — Repository and architecture
- "Crear localmente el repositorio RipperFastCustom" and keep all changes local:
  "No publiques todavía en GitHub."
- Modular structure under `src/`: main, app, ui, adapters, engines, modules, services, i18n,
  types, constants, validation, plus `tests/`, `docs/`, `assets/`.
- "No implementar todavía todos los módulos. Crear sus contratos y límites arquitectónicos
  cuando corresponda."
- "La estructura puede ajustarse si existe una justificación técnica documentada."

### S3 — Manifest (E1)
- `manifestVersion: 4`, name `RipperFastCustom`, version `0.1.0`, host Photoshop,
  `minVersion: 22.0.0`, explicit Photoshop API v1, panel entrypoint, stable provisional id,
  minimum necessary permissions.
- "No solicitar permisos de red, sistema de archivos o capacidades innecesarias."
- Do not confuse manifest version / Photoshop API version / UXP runtime version / host version.

### S4 — Initial UI
- Floating panel, graphite dark theme, electric blue accent, readable typography, industrial
  visual hierarchy, consistent spacing, reusable components, panel-size-adaptive design.
- Navigation: 1. Dashboard, 2. Serigrafía, 3. DTF Studio, 4. Halftone Studio,
  5. Calibration Lab, 6. Preflight, 7. Production Manager, 8. Settings.
- "Las secciones no implementadas deben identificarse como módulos pendientes.
  No simular funcionalidades inexistentes."
- Dashboard shows product name, version, Photoshop connection status, active document,
  dimensions and resolution when compatible APIs allow, detected Photoshop version,
  detected UXP version, current language.

### S5 — Internationalization
- Spanish and English from the start; independent dictionaries; typed keys; fallback to
  Spanish; language change without restarting the plugin;
  "Ningún texto de interfaz importante codificado directamente en los componentes."

### S6 — Adapters and compatibility
- Interfaces: `PhotoshopHostAdapter`, `PhotoshopCapabilities`, `DocumentService`,
  `LayerService`, `UXPEnvironmentService`.
- "La aplicación no debe acceder directamente a Photoshop desde los componentes de interfaz."
- "Registrar las capacidades disponibles y las no disponibles."
- "Nunca ejecutar una operación incompatible sin comprobar previamente su disponibilidad."

### S7 — Quality and tests
- Strict TypeScript, linter, formatter, Vitest for host-independent operations, contract
  tests, manifest validation, reproducible build.
- Minimum tested: i18n, capability detection, version detection, config validation,
  application initialization.
- "Las pruebas que necesiten Photoshop real deben identificarse como pruebas de integración
  pendientes, no presentarse como ejecutadas."

### S8 — Documentation
- `README.md`, `docs/ARCHITECTURE.md`, `docs/COMPATIBILITY.md`, `docs/DEVELOPMENT.md`,
  `docs/DECISIONS.md`, `docs/ROADMAP.md`.
- Document Windows requirements, development from Ubuntu, loading with UXP Developer Tool,
  Linux environment limitations, Photoshop 22.0+ compatibility, how to run tests, how to
  generate the installable package.

### S9 — Engineering rules
- "No implementar funciones ficticias." · "No introducir abstracciones innecesarias."
- "No utilizar dependencias sin justificar." · "No duplicar lógica."
- "No acoplar el motor gráfico a Photoshop." · "No utilizar APIs incompatibles sin fallback."
- "Mantener funciones pequeñas y tipadas." · "Documentar decisiones arquitectónicas."

## Tasks

| ID | S# | Route | Status | Evidence |
|----|----|-------|--------|----------|
| T1 | S1 | inline | done | audit reported in session; no global installs; no files overwritten |
| T2 | S2 | inline | done | `src/` tree with main/app/ui/adapters/engines/modules/services/i18n/validation/constants/types; engines hold boundary READMEs only; boundary test enforces it |
| T3 | S3 | inline | done | `manifest.json` v4 · PS 22.0.0 · apiVersion 1 · panel entrypoint · `requiredPermissions: {}`; 13 assertions in `tests/compatibility/manifest.test.ts` |
| T4 | S4 | inline | done | shell + 8 nav sections + pending screens + dashboard readout; `tests/unit/bootstrap.test.ts` (13) and `navigation.test.ts` (6) |
| T5 | S5 | inline | done | `es.ts` canonical, `en.ts` typed `Record<TranslationKey,string>`; instant switch tested; `tests/unit/i18n.test.ts` (13) |
| T6 | S6 | inline | done | five adapter interfaces, injectable `ModuleLoader`, three-state capability detection; `capabilities.test.ts` (6) + `architecture-boundary.test.ts` (4) |
| T7 | S7 | inline | done | `npm run check` green: tsc 0 errors, eslint 0, prettier clean, **66 passed / 4 skipped**; `npm run build` → dist/ 55K |
| T8 | S8 | inline | done | README.md + docs/{ARCHITECTURE,COMPATIBILITY,DEVELOPMENT,DECISIONS,ROADMAP}.md, Windows load procedure included |
| T9 | S9 | inline | done | `npm run check` + `npm run build` green; 14 decisions documented in `docs/DECISIONS.md`; no fictitious features (pending screens) |

## Log

L1 (verbatim): "RipperFastCustom — Task E0/E1: Foundation & UXP Bootstrap. Rol: Actúa como
arquitecto de software senior y desarrollador especializado en Adobe Photoshop UXP, JavaScript,
TypeScript, procesamiento de imágenes y sistemas de preimpresión industrial... Objetivo final:
entregar RipperFastCustom v0.1.0 como una base UXP funcional, no solamente como una estructura
de carpetas."

L2 (2026-11-26, decisions): Vite 8 lib-mode IIFE instead of esbuild (postinstall blocked by
npm allowScripts); hand-written ambient typings because no Photoshop/UXP typings exist on npm
and community ones target API v2; manifest v4 object-form host; `apiVersion: 1` to keep the
floor at PS 22.0.0; feature detection over version sniffing with a distinct `unknown` state;
empty `requiredPermissions` because storage is in-memory; CSS inlined into index.html at
build time; plain HTML instead of Spectrum widgets; engines ship README boundaries only (no
speculative interfaces); Spanish canonical dictionary with EN typed against it; ESLint
non-type-checked with types owned by `tsc`; integration suite declared `describe.skip` rather
than faked. Full rationale in `docs/DECISIONS.md` D1–D14.

L3 (2026-11-26, verification): `npm run check` green — tsc 0 errors, eslint 0 problems,
prettier clean, **66 tests passed, 4 skipped** (the skipped ones are the Photoshop host
integration suite). `npm run build` green — `dist/` contains `manifest.json`, `index.html`
(theme inlined) and a 30.9 kB IIFE `index.js`; 55K total. Architecture boundary test enforces
that only `src/adapters/` and `src/types/host.d.ts` reference host modules.

L4 (2026-11-26, pending): loading the panel in real Photoshop was NOT verified — this host is
Ubuntu 25.10 aarch64 with no Photoshop, no UXP Developer Tool and no Wine. Documented as
pending in `docs/COMPATIBILITY.md` §3 and `docs/ROADMAP.md`; Windows procedure in
`docs/DEVELOPMENT.md` §5.
