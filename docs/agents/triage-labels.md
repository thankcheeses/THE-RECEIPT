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

## Which of these exist on GitHub

The table above is the mapping the skills read. It does not create anything, and
a label the repo lacks cannot be applied — `gh issue edit --add-label` fails on
an unknown label rather than creating it.

As of this file's creation, `thankcheeses/THE-RECEIPT` had only `wontfix`, which
GitHub creates by default. The other four need creating once:

```sh
gh label create needs-triage    --color fbca04 --description "Maintainer needs to evaluate this issue"
gh label create needs-info      --color d93f0b --description "Waiting on reporter for more information"
gh label create ready-for-agent --color 0e8a16 --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --color 1d76db --description "Requires human implementation"
```

`gh label create` exits non-zero on a label that already exists, so the
commands are safe to re-run only one at a time, or with `|| true`.

## Category roles

Separate from the five state roles above, `triage` also assigns one **category**
role per issue, and both are GitHub defaults that already exist here:

| Role          | Meaning                        |
| ------------- | ------------------------------ |
| `bug`         | Something is broken            |
| `enhancement` | New feature or improvement     |

Every triaged issue should end up carrying exactly one category role and one
state role.
