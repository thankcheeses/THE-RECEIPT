# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in
[`thankcheeses/THE-RECEIPT`](https://github.com/thankcheeses/THE-RECEIPT). Use
the `gh` CLI for all operations.

## This repo's constraints

Two things differ from the generic GitHub setup, and both change which commands
work:

- **`gh` here is 2.89.0, below the 2.94 floor** for `--parent`,
  `--add-sub-issue`, `--blocked-by` and `--add-blocked-by`. Use the `gh api`
  fallbacks spelled out below, or the plain-text `Part of #<n>` / `Blocked by:
  #<n>` conventions. Check with `gh --version` before assuming otherwise — a
  newer `gh` makes the shortcuts available again.
- **In a Claude Code cloud session the `gh` CLI is not the path to GitHub.**
  Those sessions are told to use the GitHub MCP tools (`mcp__github__*`) for
  every GitHub interaction: issues, PRs, comments, CI status. The conventions
  below still describe *what* to do; translate the command to the equivalent
  MCP tool when that is the surface you have. A local developer with `gh`
  authenticated runs them as written.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: on `gh` 2.94+, `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>`. On this repo's 2.89.0: `gh api --method POST repos/thankcheeses/THE-RECEIPT/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. On `gh` 2.94+, `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>`. On 2.89.0: `gh api --method POST repos/thankcheeses/THE-RECEIPT/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/thankcheeses/THE-RECEIPT/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/thankcheeses/THE-RECEIPT/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means startable). `gh issue view <n> --json blockedBy` also lists closed blockers, so filter it: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: post the explanation with `gh issue comment <number> --body "..."`, then `gh issue close <number>`. On an already-closed issue, `gh issue close --comment` drops the comment and still exits 0.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside
a clone.

File issues only into this repo. Never file into `mattpocock/skills` (the repo
these skills come from). In a fork, `gh` can default to the upstream parent, so
before the first `gh issue create` of a session, check the target with
`gh repo view --json nameWithOwner` and confirm it is
`thankcheeses/THE-RECEIPT`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number>`, then `gh pr view <number> --comments` (off a TTY, `--comments` prints only the comments, not the body), and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be
either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Triage labels

The `triage` skill is installed, and the five canonical roles are mapped at
their default strings in `docs/agents/triage-labels.md`. Read that file before
applying a label: four of the five did not exist on the repo when it was
written, and `gh issue edit --add-label` fails on an unknown label rather than
creating it. That file carries the `gh label create` commands.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (see **Count open blockers**, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
