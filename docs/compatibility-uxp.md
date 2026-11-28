# UXP compatibility from Photoshop 22.0

This document records what the UXP platform officially supports for running one
plugin across Photoshop 22.0 (2021) and later, and the staged architecture this
repository adopts because of it. Every claim is tagged with the source that
supports it.

Legend: **Verified** — stated by Adobe documentation. **Derived** — follows from
verified facts by construction. **Unverified** — not documented; never relied on
silently.

---

## 1. Verified platform facts

### V1 — One manifest per plugin package

The manifest lives at the root of the plugin folder and must be named
`manifest.json`. `host` accepts a `HostDefinition` or an array of them, but an
array **can only be used during development**; a marketplace submission needs a
single definition.

Source: [UXP Manifest v4](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v4/)

### V2 — `apiVersion` is a single, static value

`apiVersion` is one number in the manifest. It is optional, and its default
depends on the declared minimum host version:

- `minVersion` below `23.0.0` → `apiVersion` **1**, unless the plugin specifies
  otherwise;
- `minVersion` `23.0.0` or greater → `apiVersion` **2**, unless the plugin
  specifies otherwise.

`apiVersion: 2` selects the modal JavaScript paradigm; `apiVersion: 1` selects
the original Photoshop 2021 implementation. Adobe states that with the
introduction of `apiVersion: 2` the original implementation is **formally
deprecated** and support for `apiVersion: 1` **will be removed in a future major
update**.

Sources:
[Photoshop specific manifest properties](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v4/photoshop-manifest/),
[UXP manifest v4 — host](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v4/)

### V3 — `executeAsModal` requires `apiVersion` 2

`executeAsModal` has a documented minimum version of **22.5**, and — verbatim —
_"ExecuteAsModal is only available to plugin that is using apiVersion 2 or
higher."_ The modal scope is what makes `apiVersion: 2` different in kind, not
only in degree.

Sources:
[core.executeAsModal](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/photoshopcore/),
[Modal execution](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal/)

> **Correction to D4.** `docs/DECISIONS.md` D4 states that the API v1 DOM
> includes `executeAsModal`. That is not correct: `executeAsModal` requires
> `apiVersion: 2`. D4's separate claim — that declaring v1 is what keeps the
> `22.0.0` floor honest — remains correct.

### V4 — The Imaging API arrives in Photoshop 24.2 / 24.4

The Imaging API (`getPixels`, `putPixels`, `createImageDataFromBuffer`, …) was
introduced as a **beta in Photoshop 24.2 (February 2023)** under
`require("photoshop").imaging_beta`. In **Photoshop 24.4 (April 2023)** the
module name changed to `imaging`; Adobe's changelog still describes that step as
_"moving out of Prerelease"_ and **"available in the Beta build"**, so 24.4 is
where the member name appears, not a claim that every 24.4 install exposes it.

That is why this repository treats `imaging` as a **detected member**, never as
a version entitlement: presence is the only thing the code relies on.

Source:
[Photoshop changelog](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/changelog/),
[Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging/)

### V5 — Imaging API shape and limits

- `getPixels({documentID?, layerID?, historyStateID?, sourceBounds?, targetSize?, colorSpace?, colorProfile?, componentSize?, applyAlpha?})`
  returns `{ imageData, sourceBounds, level }`.
- `imageData.colorSpace` is one of `"RGB"`, `"Grayscale"`, `"Lab"`; requesting a
  different `colorSpace` than the source makes Photoshop convert through the
  working profile.
- `imageData.componentSize` is `8`, `16` or `32`; `getData({chunky?, fullRange?})`
  returns `Uint8Array | Uint16Array | Float32Array`.
- `PhotoshopImageData` must be released with `dispose()`.
- `putPixels({layerID (required), imageData, replace?, targetBounds?, commandName?})`
  writes into an existing **pixel layer**.

Source: [Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging/)

### V6 — Document creation and layers

`app.createDocument({width, height, resolution, mode, depth, name, fill, profile})`
and `document.createLayer(kind?, options?)` are documented from **22.5**.

Sources:
[createDocument](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/photoshop/),
[DocumentCreateOptions](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/objects/createoptions/documentcreateoptions/),
[Document.createLayer](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/document/)

### V7 — `host.maxVersion` exists

`HostDefinition` accepts `maxVersion` alongside `minVersion`, with the same
`x.y` formatting.

Source: [UXP manifest v4 — HostDefinition](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v4/)

### V8 — Marketplace versioning carries an app range per version

- _"A UXP listing can have multiple Versions available to users simultaneously,
  while ZXP listings only offer the latest Version."_ (Glossary — verified)
- The portal's "Manage All Versions" table shows, per version, _"app min and max
  version"_. (Verified)
- The portal asks, per uploaded package, for "versions of Adobe products that
  your app supports", and rejects malformed ranges. (Verified)
- **Constraint:** `host.minVersion` and `host.maxVersion` must be submitted in
  `a.b` format (two segments). (Verified)

Sources:
[Glossary](https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/glossary),
[Getting started — Versions](https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/getting-started),
[FAQ — UXP manifest notes](https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/faq)

### V9 — Direct distribution is a file hand-off

A `.ccx` is a zip of the plugin folder renamed; installing it is
double-click → Creative Cloud install, or UPIA in restricted environments. The
developer chooses which file to hand out.

Sources:
[Options for distribution](https://developer.adobe.com/photoshop/uxp/2022/guides/distribution/distribution-options/),
[Packaging your plugin](https://developer.adobe.com/photoshop/uxp/2022/guides/distribution/packaging-your-plugin/),
[FAQ — offline / restricted installs](https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/faq)

---

## 2. What follows

### D1 — One manifest cannot cover 22.0 and the imaging flow (Derived)

`apiVersion` is static (V2) and `executeAsModal` requires `apiVersion: 2` (V3),
while the hosts from 22.0 to 22.4 have no modal implementation at all (V2). The
Imaging API only exists from 24.2 (V4). A single manifest therefore cannot be
simultaneously:

- honest about supporting 22.0, and
- able to run modal execution and pixel I/O.

### D2 — Staged compatibility needs at least two packages (Derived)

Because `apiVersion` cannot vary at runtime (V2) and `host` cannot be an array in
distribution (V1), the only supported way to differ by host version is to ship
different **versions** of the same listing, each with its own manifest and app
range (V7, V8).

### D3 — The plugin id must stay identical (Derived)

Different plugin ids would produce two listings, two panel entries and a
duplicated product. The staged builds therefore keep the same `id`, the same
code, and the same engine; **only the manifest differs**.

### D4 — Runtime detection stays authoritative (Derived)

Because a build can be installed on a host newer than its floor, and because
Adobe recommends feature detection over version sniffing, every capability the
halftone flow needs is decided by member presence at runtime. The manifest
declares a floor; it never grants a capability.

---

## 3. Unverified behaviour (never relied on)

### U1 — `apiVersion: 2` declared with a `minVersion` below 23.0

Adobe says a plugin with `minVersion` below 23.0.0 gets `apiVersion` 1 _"unless
the plugin specifies otherwise"_, but does not document what a host from 22.0 to
22.4 does when it is told otherwise. Those hosts have no `core.executeAsModal`
and no modal scope, so the only safe reading is that such a combination cannot
deliver modal behaviour, and its load behaviour is undefined.

**Consequence:** this repository never ships that combination.

### U2 — Which version Creative Cloud installs when several are compatible

The portal stores a per-version app range and allows several published versions
at once (V8), which is the official basis for staged delivery, but the resolver
rule ("highest compatible version") is not stated in the documentation.

**Consequence:** the ranges are made **disjoint** so the choice is not a
decision the resolver has to make, and direct `.ccx` distribution — where the
developer picks the file — is verified without depending on the resolver at all
(V9).

### U3 — `imaging` availability under `apiVersion: 1`

The Imaging API documentation does not restate the `apiVersion` gate that
`executeAsModal` has. The detection code treats `imaging` as available only when
the member exists, and the flow requires the member; it never assumes the gate
either way.

---

## 4. Adopted architecture: one source, two staged builds

```
                    ┌─────────────────────────────┐
                    │  src/  (single codebase)    │
                    │  ui · app · adapters ·      │
                    │  engines/halftone (pure)    │
                    └──────────────┬──────────────┘
                                   │ same bundle
              ┌────────────────────┴────────────────────┐
              │                                         │
   ┌──────────▼───────────┐                 ┌───────────▼──────────┐
   │ legacy manifest      │                 │ modern manifest      │
   │ apiVersion 1         │                 │ apiVersion 2         │
   │ minVersion 22.0      │                 │ minVersion 24.4      │
   │ maxVersion 24.3      │                 │                      │
   └──────────┬───────────┘                 └───────────┬──────────┘
              │                                         │
   Photoshop 2021 – 2024.3                  Photoshop 24.4 and later
   panel, dashboard, diagnostics,           everything above, plus the
   capability report. Halftone flow         real halftone flow: read the
   reports *unavailable* with the           composite through imaging,
   exact missing capability. No             screen it, write channels back
   simulation.                              to a new document.
```

### Why the split is at 24.4

24.4 is the first release that exposes the `imaging` module name (V4). Splitting
at 22.5 would create a third variant that gains modal execution but still cannot
reach pixels, so it would add a package and a test matrix without adding a
capability. Because `imaging` is still detected rather than assumed (U3), a 24.4
host that lacks it degrades exactly like a legacy host: the flow reports the
missing member instead of pretending.

### Why `maxVersion: 24.3` on the legacy build

Disjoint ranges remove the reliance on U2: a 24.3 host can only match the legacy
build, a 24.4 host can only match the modern build.

### Installed builds replace, they do not coexist

Both packages carry the same `id`, so Creative Cloud treats them as one plugin:
installing one replaces the other. There is no state in which a user runs both at
once, which is intended — the point of the shared id is one product, one panel,
one marketplace listing (D3). For direct `.ccx` hand-off the consequence is
operational: the developer must give a user the file matching their Photoshop
version, because installing the wrong one leaves them with a build whose manifest
range excludes their host.

### What is _not_ duplicated

| Concern                               | Shared                                          |
| ------------------------------------- | ----------------------------------------------- |
| AM engine (`src/engines/halftone`)    | yes — one implementation                        |
| Application orchestration (`src/app`) | yes                                             |
| UI, i18n, theme                       | yes                                             |
| Host adapters                         | yes — detection-based, no variant-specific code |
| Business rules, validation            | yes                                             |
| Manifest                              | **no** — the one deliberate difference          |

### Numeric format

Both manifests write `minVersion`/`maxVersion` as `a.b` (`22.0`, `24.3`,
`24.4`), which is valid for UXP (V1) and required by the marketplace (V8). The
Maven-style `a.b.c` form is accepted by UXP but rejected at marketplace upload.

---

## 5. Rejected alternative: `apiVersion: 1` plus `batchPlay` file I/O

A single package could keep `apiVersion: 1` on every host and perform pixel I/O
through `batchPlay` (save/open a document through a temporary TIFF file), since
`batchPlay` exists at v1 and needs no modal scope. That would make the flow
reachable on 22.0 with one manifest.

Rejected because:

- it adds `requiredPermissions.localFileSystem`, which triggers a user consent
  prompt for every install (D6 currently promises none);
- it needs a hand-written TIFF encoder/decoder in the plugin, a second binary
  format to keep correct across 8/16-bit, and a large new failure surface;
- it round-trips full rasters through disk, which is slower and worse for large
  canvases than `imaging`;
- it buys flow support on 22.0–24.3 — hosts Adobe has already deprecated for
  plugin isolation — at the cost of the whole product's reliability.

It remains the documented fallback **only** if the product later requires the
flow itself on 22.0. It is not implemented pre-emptively.

---

## 6. What still requires a real Photoshop host

This repository's CI runs no Photoshop. The following are implemented and
covered by contract tests with a fake host, but are **not** validated against a
real application, and must not be reported as such:

1. `apiVersion` 1 and 2 load behaviour on 22.0 / 22.5 / 24.3 / 24.4.
2. `imaging.getPixels` on an RGB, a grayscale, a 16-bit and a CMYK document.
3. `imaging.putPixels` into a freshly created pixel layer.
4. Which version Creative Cloud picks from disjoint published ranges (U2).
5. Panel layout and repaint behaviour while a screening run is in progress.

---

## 7. Publishing checklist (when the time comes)

1. Bump `version` in the source manifest; both builds must carry the same
   product version.
2. Package `dist/` (modern) and `dist-legacy/` (legacy) as two `.ccx` files.
3. Upload both as versions of the **same listing**, with matching app ranges
   `22.0 – 24.3` and `24.4 – *`.
4. Confirm the portal accepted `a.b` ranges and shows both versions as
   simultaneously available.
5. Verify on real hosts: 22.0 installs legacy, 24.4+ installs modern, and each
   reports its capabilities accurately.
