# Decisions

Each entry records a real choice, the alternatives considered, and the reason. Anything not
listed here was not decided deliberately.

---

## D1 — Vite (lib mode, IIFE) instead of esbuild or webpack

**Decision.** Bundle with Vite in library mode, format `iife`, target `es2019`.

**Alternatives.**

- _esbuild directly:_ rejected — its npm postinstall script was blocked by the npm
  `allowScripts` policy in this environment, so the package could not be installed safely.
- _webpack:_ rejected — much heavier configuration for a single-entry plugin.

**Why it fits.** UXP loads plugins with a plain `<script src="index.js"></script>` tag, so a
single self-contained IIFE with no module loader at runtime is the safest target. Vite was
already present as a peer dependency of Vitest, adding no new dependency. Verified by a
scratch build before committing to it.

---

## D2 — Hand-written ambient typings for `photoshop` / `uxp`

**Decision.** Declare the host modules in `src/types/host.d.ts` by hand, covering only the
members this project uses.

**Alternatives.**

- `@types/uxp` / `@adobe/uxp-typings`: **do not exist** on npm (both resolve to 404).
- Community typings for UXP: describe the **API v2** surface, which this project deliberately
  does not target — using them would push v2 members into the code.

**Why it fits.** The declaration is small, matches API v1 exactly, and makes every host
access explicit. It is also the only file outside `src/adapters/` allowed to name the host
modules, which the boundary test enforces.

---

## D3 — `manifestVersion: 4` with `host` as an object

**Decision.** Use manifest v4 and the object form of `host`.

**Why.** v4 is the contract for the API v1 set this project targets; v5 introduced an array
`entrypoints` and newer fields. The two are different file formats — mixing them produces a
manifest Photoshop rejects.

---

## D4 — `host.data.apiVersion: 1`

**Decision.** Declare API **v1** explicitly.

**Why.** v1 is the **MAX 2020 / Photoshop 22.0** DOM (`photoshop.action`, `batchPlay`,
`executeAsModal`). v2 was introduced in Photoshop 22.5 prerelease. Declaring v1 is what makes
`minVersion 22.0.0` honest; declaring v2 would silently raise the floor to 22.5. Adobe
documents rolling back to v1 by setting this value, so v1 remains supported on current hosts.

---

## D5 — Feature detection instead of version sniffing

**Decision.** Decide capability availability by inspecting whether members exist, never by
parsing `host.version`.

**Why.** Version ranges break across builds and vendors; member presence does not. The
detector returns three states — `available`, `unavailable`, `unknown` — where `unknown`
means "could not check" (for example, document-level members when no document is open).
Collapsing `unknown` into `unavailable` would make the UI claim a feature is missing when it
was simply not inspected.

---

## D6 — Empty `requiredPermissions`

**Decision.** Ship `requiredPermissions: {}`.

**Why.** v0.1.0 performs no network access and no filesystem access: storage is an
in-memory `StorageService` (`createInMemoryStorage`). Requesting `network`, `localFileSystem`
or `clipboard` "just in case" would violate the minimum-permissions rule and trigger user
consent prompts for nothing. Permissions are added only with the feature that needs them.

---

## D7 — CSS inlined into `index.html` at build time

**Decision.** The build replaces a `/*__RIPPERFAST_THEME__*/` placeholder in `index.html`
with the contents of `src/ui/theme/theme.css`, instead of shipping a `<link rel="stylesheet">`.

**Why.** Removes any dependence on stylesheet resolution inside the UXP runtime — one less
thing that can silently fail when the panel is loaded by a host we cannot test on.

---

## D8 — Plain HTML elements, no Spectrum (`sp-*`) widgets

**Decision.** Use native `button`, `select`, `div` with custom CSS.

**Why.** Spectrum web components require the UXP widget runtime and their availability varies
across Photoshop/UXP versions. Native elements work everywhere from 22.0.0 onward and keep
the theme fully under our control. The cost — writing our own focus and hover states — is
paid once in `theme.css`.

---

## D9 — No speculative engine contracts

**Decision.** `src/engines/` contains only README files describing responsibility and
boundaries; no `.ts` interfaces exist yet.

**Why.** Empty interfaces are abstraction without a consumer. The boundary rules (pure,
deterministic, no host, no DOM, no I/O) are documented and _enforced_ by
`architecture-boundary.test.ts`, so the constraint is real even before the code arrives.
Contracts are written together with the module that needs them.

---

## D10 — `unknown` document state when no document is open

**Decision.** Report document dimensions/resolution as "No disponible" rather than `0 × 0`.

**Why.** `0 × 0` is a false fact about a document. With no active document we have not
observed anything, so the honest output is an explicit unavailable state.

---

## D11 — Spanish is the canonical dictionary

**Decision.** `src/i18n/es.ts` defines `TranslationKey` (`keyof typeof es`); `en.ts` is typed
`Record<TranslationKey, string>`.

**Why.** One direction of typing means a missing English key is a **compile error**, not a
runtime surprise, while the product's primary audience is Spanish-speaking. `translate()`
still falls back to Spanish at runtime as a second line of defence.

---

## D12 — ESLint non-type-checked rules; types owned by `tsc`

**Decision.** Use `typescript-eslint`'s recommended (non-type-checked) rules plus
`eslint-config-prettier`; run `tsc --noEmit` separately.

**Why.** Type-aware linting roughly doubles lint time and overlaps with the strict compiler
config that already runs in `npm run check`. Formatting conflicts are eliminated by turning
off stylistic rules in ESLint and letting Prettier own style.

---

## D13 — Pinned toolchain versions

**Decision.** TypeScript **5.9.3**, ESLint 10, Vitest 5, Prettier 3 — all pinned in
`devDependencies`.

**Why.** `typescript-eslint@8` supports `>=4.8.4 <6.1.0`; TypeScript 7 (the global one
installed on this machine) is outside that range. Pinning keeps `npm install` reproducible
and prevents a future major from breaking `npm run check`.

---

## D14 — Skipped integration tests instead of a fake "passing" host suite

**Decision.** `tests/integration/photoshop-host.integration.test.ts` is declared
`describe.skip` with the reason in a header comment.

**Why.** Photoshop cannot run on this Linux host. Reporting those cases as passing would be
a fictional verification. Declaring them skipped keeps the suite green while making the gap
visible and one edit away from being run on Windows.
