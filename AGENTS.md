# RipperFastCustom — Agent Instructions

Adobe Photoshop UXP plugin for screen printing (serigrafía), DTF and halftone generation.
The source is hosted in a public GitHub repository at
<https://github.com/guigerdts/RipperFastCustom>. Pushing, publishing a release, or making any
other remote change requires explicit human authorization for that concrete action.

Before changing anything, read `README.md` and `docs/ARCHITECTURE.md`. Engineering choices
and their rationale live in `docs/DECISIONS.md` (closed E0/E1 record) and `docs/adr/`
(decisions made from now on).

Hard rules enforced by tests, not by goodwill:

- Only `src/adapters/` and `src/types/host.d.ts` may reference the `photoshop` / `uxp`
  modules (`tests/compatibility/architecture-boundary.test.ts`).
- `src/engines/` stays pure: no host, no DOM, no I/O.
- Unimplemented feature modules render an explicit pending screen — never simulated
  behaviour.
- Run `npm run check` before every commit; it must exit 0.
- Run `gga run` as the mandatory quality gate before committing. Never disable, skip or
  bypass the pre-commit hook.

## Commit budget

- Keep each commit within 400 authored changed lines (additions plus deletions), counting
  generated files as zero. A larger change is split into sequential work-unit commits so
  GGA reviews a bounded payload and the pre-commit gate stays fast and meaningful.
- Each commit is one coherent work unit: behaviour, its tests and its docs together. If a
  unit cannot fit the budget, commit it in slices that each leave the tree green.

## Memory (Engram)

The project key is `ripperfastcustom`, resolved from the repository directory name and
not from the `origin` remote. Renaming the directory splits memory into a new project.

- Search memory before work that may have prior context: `mem_search` / `mem_context`
  scoped to `ripperfastcustom`.
- Persist durable decisions, gotchas and completed fixes with `mem_save`.
- Call `mem_session_summary` before closing a working session.
- If an Engram write fails with an unbound session, continue the work and record the
  missing write in the final report. Never claim an observation was persisted when it
  was not.

## Workflow (ODD)

Every request runs Organic Driven Development: authorize, explore, resolve uncertainty,
classify, then implement task by task and close with evidence.

- Small, fully-understood work stays inline and creates no task artifacts.
- Large work is tracked in `.scratch/<feature>/`, which is the canonical specification.
- Each ticket closes only after `npm run check` exits 0, `npm run build` is clean, GGA
  passes through the pre-commit hook, and the commit is verified on `origin/master`.

## Agent skills

### Issue tracker

Local markdown tickets under `.scratch/<feature>/` are the canonical specification and
ticket system. They are not synchronized with GitHub Issues, and no GitHub issue is created
automatically. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles used as-is, stored as a `Status:` line in each ticket. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
