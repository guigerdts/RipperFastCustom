# Roadmap

Order is deliberate: verify the foundation on real hardware first, then build the pure
kernels, then the features that consume them.

---

## Now — v0.1.0 foundation (done in this repository)

- [x] Environment audit (E0)
- [x] Project structure under `src/`
- [x] Validated UXP manifest v4, Photoshop ≥ 22.0.0, API v1
- [x] Loadable floating panel shell (pending-module screens, no simulated features)
- [x] ES/EN i18n with typed keys and instant switching
- [x] Adapter layer + capability detection + diagnostics
- [x] Strict TypeScript, ESLint, Prettier, Vitest
- [x] Installable build in `dist/`
- [x] Documentation set (README + 5 docs)

---

## Next — v0.2.0 host verification (blocking)

Nothing below should be considered real until this step is executed on Windows.

- [ ] Load `dist/` in Photoshop 22.0+ via UXP Developer Tool
- [ ] Un-skip `tests/integration/photoshop-host.integration.test.ts` and run it
- [ ] Verify Dashboard shows real document width/height/resolution
- [ ] Verify language switch inside Photoshop
- [ ] Record the verified Photoshop + UXP versions in `docs/COMPATIBILITY.md` §4
- [ ] Decide whether `localFileSystem` permission is needed for presets → if yes, request it
      with the feature (D6)

---

## Then — engines (pure, host-free)

Each engine lands with its own tests; none may import Photoshop.

| Engine       | Responsibility                                        | Depends on   |
| ------------ | ----------------------------------------------------- | ------------ |
| `color`      | RGB/CMYK/spot conversion, ink coverage, trapping math | —            |
| `halftone`   | AM/FM screening, angle/frequency/lpi, spot functions  | `color`      |
| `morphology` | Erosion/dilate/outline, separation of strokes         | —            |
| `graphics`   | Raster primitives, masks, anti-aliasing               | `morphology` |
| `export`     | Format writers, DPI metadata, naming conventions      | —            |

---

## Then — feature modules (in dependency order)

| Module                 | State   | Needs                                         |
| ---------------------- | ------- | --------------------------------------------- |
| **Preflight**          | pending | `color` + document read-only inspection       |
| **Calibration Lab**    | pending | `halftone` + test-print patterns              |
| **Halftone Studio**    | pending | `halftone`, `color`, `morphology`             |
| **Serigrafía**         | pending | `halftone`, `color`, `morphology`, `graphics` |
| **DTF Studio**         | pending | `color`, `export`, white-ink handling         |
| **Production Manager** | pending | `export`, batch naming, job metadata          |

Rules for every module:

1. The UI reads only `AppContext`; host writes go through `DocumentService`/`LayerService`.
2. Anything requiring a host capability checks `capabilities.getState(...)` first and shows
   an unavailable state instead of failing.
3. The module ships with its unit tests before its UI.
4. Unimplemented sections keep rendering the explicit **pending** screen until then.

---

## Later

- [ ] Presets persisted with a real permission-scoped storage backend
- [ ] Real Photoshop versions added to the compatibility matrix as they are tested
- [ ] CI running `npm run check` + `npm run build` on Linux (no Adobe software needed)
- [ ] Installer packaging (`.ccx`) once the panel is verified on Windows
