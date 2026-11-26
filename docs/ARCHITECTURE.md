# Architecture

RipperFastCustom is a Photoshop UXP plugin built as a layered, host-decoupled
application. The guiding rule is simple: **the UI never talks to Photoshop, and the engines
never talk to anything at all.**

---

## 1. Layers

```
┌─────────────────────────────────────────────────────────────┐
│  src/ui            Presentation                             │
│  Shell · screens · components · theme                       │
│  Reads AppContext only. No host module access.              │
├─────────────────────────────────────────────────────────────┤
│  src/app           Composition root                         │
│  createAppContext() wires every service once                │
├──────────────┬──────────────────────┬───────────────────────┤
│ src/adapters │ src/services         │ src/i18n              │
│ Host access  │ Storage · diagnostics│ Typed dictionaries     │
├──────────────┴──────────────────────┴───────────────────────┤
│  src/engines       Pure computation (no code yet)           │
│  graphics · color · halftone · morphology · export          │
├─────────────────────────────────────────────────────────────┤
│  src/modules       Feature module contracts + registry      │
│  screen-printing · dtf-studio · halftone-studio ·           │
│  calibration · preflight · production                       │
└─────────────────────────────────────────────────────────────┘
```

### Dependency direction

```
ui  →  app  →  adapters / services / i18n / validation
adapters  →  (host modules: photoshop, uxpe)
engines   →  nothing
modules   →  engines + i18n (types only)
```

Nothing points back upward. There are no import cycles.

---

## 2. The adapter layer

All host access flows through `src/adapters`. This is enforced by a test, not by convention:

- `tests/compatibility/architecture-boundary.test.ts` scans every file under `src/` and
  fails if `require('photoshop')`, `require('uxp')`, or an `import … from 'photoshop' | 'uxp'`
  appears outside `src/adapters/` and `src/types/host.d.ts`.

### Public contracts

| Interface               | File                         | Responsibility                                                     |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `PhotoshopHostAdapter`  | `src/adapters/types.ts`      | Facade: `available`, `capabilities`, `documents`, `layers`         |
| `PhotoshopCapabilities` | `src/adapters/capability.ts` | Reports each capability as `available` / `unavailable` / `unknown` |
| `DocumentService`       | `src/adapters/types.ts`      | Read-only active document facts                                    |
| `LayerService`          | `src/adapters/types.ts`      | Read-only layer count                                              |
| `UXPEnvironmentService` | `src/adapters/types.ts`      | Host name/version and UXP runtime version                          |

### The injectable loader

`src/adapters/runtime/moduleLoader.ts` exposes `ModuleLoader = (id: string) => unknown`.

- Production: `createGlobalModuleLoader()` resolves the `require` global injected by UXP.
- Tests: `createFakeLoader({ photoshop, uxp })` supplies fixtures.

This is the single seam that lets the whole application be tested without Photoshop.

### Capability detection is feature-based, not version-based

`detectCapabilities(hostModule, activeDocument)` inspects members:

- missing module → everything `unavailable`, reason `module_not_loaded`
- member absent → `unavailable`, reason `member_missing`
- document member cannot be checked (no open document) → `unknown`, reason `no_active_document`

Nothing is ever called before it is confirmed to exist. `unknown` is deliberately distinct
from `unavailable`: we do not claim a capability is missing when we simply could not check.

Document-level capabilities are re-evaluated on every read of `adapter.capabilities`, so
opening a document after boot updates the report without restarting the panel.

---

## 3. Application context

`createAppContext(options?)` in `src/app/bootstrap.ts` is the composition root. It:

1. resolves the module loader, storage and diagnostics (all injectable),
2. validates stored configuration (`validateAppConfig`),
3. creates the i18n service,
4. reads the UXP environment once,
5. constructs the Photoshop host adapter,
6. records structured diagnostics for each step.

Screens receive the resulting `AppContext` (`src/app/context.ts`). They never construct
services themselves.

`mountApp(root, context)` renders the shell and returns a handle with
`setScreen`, `getScreen` and `destroy`.

---

## 4. UI structure

```
src/ui/
  dom.ts                  el() / clear() helpers
  components/index.ts     Card · Badge · StatusRow · EmptyState
  theme/theme.css         Design tokens + layout (inlined into index.html at build)
  shell/navigation.ts     The eight ordered sections
  shell/Shell.ts          Header, navigation, active screen, locale subscription
  screens/dashboard/      Environment and document readout
  screens/pending/        Honest placeholder for unimplemented modules
  screens/settings/       Language switch + about
```

### Design language

- Graphite dark surfaces (`--rfc-bg: #14161a`), electric blue accent (`--rfc-accent: #2f80ff`).
- Uppercase micro-labels for card titles (industrial hierarchy), 12 px base type,
  monospace for machine values.
- Consistent 4/8/12/16/24 px spacing scale and a single 6 px radius.
- Below 560 px the navigation collapses from a left rail to a horizontal bar, so the panel
  stays usable when docked narrow.

### Rendering model

The shell re-renders on two events only: a screen change and a locale change. Locale
changes are driven by `i18n.subscribe`, which is why switching language never restarts the
plugin.

---

## 5. Internationalization

- `src/i18n/es.ts` is the canonical dictionary; its `keyof typeof es` defines
  `TranslationKey`.
- `src/i18n/en.ts` is typed `Record<TranslationKey, string>`, so a missing English key is a
  **compile error**.
- `translate(locale, key, params?)` interpolates `{name}` placeholders and falls back to
  Spanish if a key is ever missing at runtime.
- Components never contain user-visible copy; they call `i18n.t(...)` or receive strings.

---

## 6. Engines and modules

`src/engines/` holds the future image-processing kernels. Today each subdirectory contains
only a README stating its responsibility and boundary rules (see `src/engines/README.md`):
pure, deterministic, no Photoshop, no DOM, no I/O. Code is added only when the corresponding
module is scheduled — empty interfaces would be speculative abstraction.

`src/modules/` declares the six feature modules as typed contracts with
`status: 'pending'`, aggregated by `registry.ts`. The shell reads that registry to render the
pending dot in the navigation and the pending screen body. Nothing is faked: a pending module
has no code paths at all.

---

## 7. Build pipeline

```
src/main.ts ──vite (lib, iife, es2019)──► dist/index.js
manifest.json ──────────────────────────► dist/manifest.json
index.html + src/ui/theme/theme.css ────► dist/index.html  (CSS inlined)
assets/ (non-README) ───────────────────► dist/assets/
```

A single IIFE bundle is used because UXP loads plugins with a plain
`<script src="index.js"></script>` tag; no module loader is required at runtime.
Inlining the stylesheet removes any dependency on `<link>` resolution inside the UXP
runtime.

`dist/` is the folder you add to UXP Developer Tool.
