# THE RECEIPT

A social prediction game. Two runtimes share one client: an Express server that
serves tRPC at `/api/trpc`, and a static GitHub Pages build where
`client/src/lib/staticLink.ts` resolves every tRPC procedure in-browser against
`client/src/lib/staticDemo.ts` (localStorage). **Every server procedure must be
mirrored in the static demo**, or the Pages demo breaks at runtime with no
server-side error to find.

See `README.md` for setup, `CONTRIBUTING.md` for conventions, and
`ENVIRONMENT.md` for configuration.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`thankcheeses/THE-RECEIPT`), via the
`gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root, both
created lazily when terms or decisions actually get resolved. See
`docs/agents/domain.md`.
