# Compatibility

This document is the compatibility contract for RipperFastCustom. Anything not listed as
**Verified** here has not been proven on real hardware and must not be reported as working.

---

## 1. Four different versions — never confuse them

| Concept                    | Where it lives                           | This project's value | Meaning                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manifest version**       | `manifest.json` → `manifestVersion`      | `4`                  | The _shape of the manifest file_ (entrypoints, `host` as an object). v5 changed `entrypoints` to an array and added new fields. It says nothing about Photoshop.                                                            |
| **Photoshop API version**  | `manifest.json` → `host.data.apiVersion` | `1`                  | Which _Photoshop DOM_ the plugin targets. `1` = the **MAX 2020 / PS 22.0** DOM (`photoshop.action`, `batchPlay`, `executeAsModal`). `2` requires **PS 22.5+**. Adobe documents rolling back by setting `apiVersion` to `1`. |
| **UXP runtime version**    | runtime `require('uxp').versions.uxp`    | detected at runtime  | The UXP engine bundled with the installed Photoshop (e.g. `uxp-6.0.0`). Used for diagnostics only.                                                                                                                          |
| **Photoshop host version** | runtime `require('uxp').host.version`    | detected at runtime  | The application version (e.g. `22.0.0`, `26.0.0`).                                                                                                                                                                          |

The plugin **detects** the last two at runtime and **declares** the first two. It never
assumes a UXP runtime version, and it never sniffs a host version to decide behaviour —
capability detection is done by feature presence (see `docs/ARCHITECTURE.md` §2).

---

## 2. Declared contract

```jsonc
{
  "manifestVersion": 4,
  "host": { "app": "PS", "minVersion": "22.0.0", "data": { "apiVersion": 1 } },
  "entrypoints": [{ "type": "panel", "id": "ripperfastcustom.main", "main": "index.html" }],
  "requiredPermissions": {}, // deliberately empty — see DECISIONS.md D6
}
```

- **Minimum host:** Adobe Photoshop **22.0.0** (2021 release, the first with the API v1 DOM
  this project targets).
- **No maximum host declared.** Newer Photoshop versions keep API v1 available; the plugin
  only uses v1 members, and every member is feature-detected before use.
- **No C++ / native dependencies.** The plugin is HTML + CSS + JavaScript only.
- **API v2 is not required.** Where a v2-only member is detected, the capability is
  reported `unavailable` and the UI states it; nothing is executed against it.

---

## 3. Status of each claim

### Verified in this environment (Linux, no Photoshop)

| Claim                                                       | Evidence                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| Manifest is valid for the v4 contract                       | `tests/compatibility/manifest.test.ts` — 13 assertions   |
| TypeScript compiles in strict mode                          | `npx tsc --noEmit` → 0 errors                            |
| Lint and formatting are clean                               | `npx eslint .`, `npx prettier --check .` → 0             |
| Host-independent behaviour                                  | `npm test` → **66 passing**, 4 integration skipped       |
| Architecture boundary (only adapters touch the host)        | `tests/compatibility/architecture-boundary.test.ts`      |
| i18n key parity ES/EN, no hardcoded UI copy                 | `tests/unit/i18n.test.ts`                                |
| Capability detection (available / unavailable / unknown)    | `tests/unit/capabilities.test.ts`                        |
| Version parsing and API-version mapping                     | `tests/unit/version.test.ts`                             |
| Config validation and defaults                              | `tests/unit/config-validation.test.ts`                   |
| Application init, mount, offline degradation, locale switch | `tests/unit/bootstrap.test.ts` (13)                      |
| Build produces an installable `dist/`                       | `npm run build` → IIFE bundle + inlined theme + manifest |

### Pending — requires real Photoshop on Windows/macOS

These are **declared as skipped tests**, not as passing ones:
`tests/integration/photoshop-host.integration.test.ts` (`describe.skip`, 4 cases).

| Pending item                                              | Why it cannot run here                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Loading `dist/` through UXP Developer Tool                | UXP Developer Tool is a desktop app; no Linux build exists |
| Real `require('uxp')` / `require('photoshop')` resolution | Both are injected by the Photoshop host                    |
| Panel rendering inside Photoshop's UXP runtime            | Requires Photoshop                                         |
| Reading a real active document's width/height/resolution  | Requires an open document in Photoshop                     |
| `executeAsModal` availability on API v1                   | Requires the Photoshop DOM                                 |
| Photoshop 22.0.0 specifically                             | Oldest supported host; not installed                       |
| Newest Photoshop (2025/2026) with API v1 rollback         | Not installed                                              |

### Environment limitations on this machine

| Limitation                           | Consequence                                  |
| ------------------------------------ | -------------------------------------------- |
| Ubuntu 25.10 **aarch64**             | No Photoshop, no UXP Developer Tool, no Wine |
| No `uxp` CLI installed               | Plugin loading cannot be scripted here       |
| No Adobe account / license available | Cannot obtain Photoshop                      |

---

## 4. Version support matrix (planned verification)

| Photoshop     | UXP runtime | API v1            | Expected result          | Status                  |
| ------------- | ----------- | ----------------- | ------------------------ | ----------------------- |
| 22.0.0 – 22.x | uxp-5.x     | yes               | loads, full v1 DOM       | pending                 |
| 23.x – 24.x   | uxp-5.x/6.x | yes               | loads                    | pending                 |
| 25.x – 26.x   | uxp-6.x/7.x | yes (v1 retained) | loads                    | pending                 |
| < 22.0.0      | —           | —                 | rejected by `minVersion` | pending (manifest gate) |

---

## 5. Operating system matrix

| Task                                | Windows | macOS | Linux                    |
| ----------------------------------- | ------- | ----- | ------------------------ |
| Develop, test, build (`npm run …`)  | ✅      | ✅    | ✅ (verified here)       |
| Load plugin with UXP Developer Tool | ✅      | ✅    | ❌ not available         |
| Run Photoshop                       | ✅      | ✅    | ❌ not available         |
| Run Wine + Photoshop                | —       | —     | ❌ not used, unsupported |

**Conclusion:** development and CI run anywhere Node runs; the plugin can only be _loaded_
on Windows or macOS with Photoshop installed. Nothing in this repository depends on the OS
at build time.

---

## 6. How to verify compatibility yourself

On a Windows machine with Photoshop 22.0+:

```bash
npm run package          # check + build → dist/
```

1. Open **UXP Developer Tool** → **Add Plugin…** → select `dist/`.
2. Press **Load** and open Photoshop.
3. Confirm the panel appears under **Plugins → RipperFastCustom**.
4. Open a document and confirm the Dashboard reports its dimensions and resolution.
5. Switch the language in **Settings** and confirm it changes without reloading.

Record the Photoshop version used and the observed result in `docs/ROADMAP.md`.
