# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## How labels are stored locally

Statuses and labels are managed as Markdown (see `issue-tracker.md`). They do not depend on
GitHub Issues, and nothing is created or synchronized remotely. A "label" is a line in the
ticket file, not a tracker API call:

```markdown
Status: ready-for-agent
```

One status line per ticket, near the top, alongside `Type:` and `Blocked by:` when present.
There is no `gh label create` step and no automatic remote label creation.
