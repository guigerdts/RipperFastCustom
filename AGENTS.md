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

## Agent skills

### Issue tracker

Local markdown tickets under `.scratch/<feature>/` are the canonical specification and
ticket system. They are not synchronized with GitHub Issues, and no GitHub issue is created
automatically. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles used as-is, stored as a `Status:` line in each ticket. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
