# Contributing to THE RECEIPT

## Before changing code

Read `README.md`, `HANDOFF.md`, `PRODUCT.md`, `DESIGN_SYSTEM.md`, `ARCHITECTURE.md`, and `INTERACTION_AUDIT.md`. Treat the current receipt-paper visual system and prediction loop as the baseline. Do not redesign the product or add AI, betting, payments, or generic dashboard behavior without an explicit product decision.

## Development loop

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

For schema changes, update `drizzle/schema.ts`, run `pnpm drizzle-kit generate`, review the generated SQL, and apply it only to the intended database. Add or update server tests for validation, authorization, persistence, and state transitions.

## Interaction standard

Every visible primary control must navigate, persist data, mutate data, or clearly explain why it is unavailable. A toast is not enough evidence: show durable in-page success or error feedback. Preserve authenticated ownership checks on the server, especially for receipt resolution and private data.

## UI standard

Use existing tokens in `client/src/index.css` and the reusable primitives in `client/src/App.tsx` unless a meaningful extraction is needed. Keep the receipt as the signature visual object. Verify both desktop and phone layouts. The daily flow should remain fast to understand and complete.

## Commit guidance

Keep changes focused and describe user-visible behavior in commit messages. Do not commit `.env`, generated `dist/`, logs, local runtime metadata, or credentials. Before opening a pull request, include the commands run and note any schema or auth changes.

## Pull request checklist

- [ ] Product behavior strengthens discovery, prediction, anticipation, resolution, identity, competition, or sharing.
- [ ] No secrets or private environment values are included.
- [ ] `pnpm check` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Schema migrations are generated and reviewed if needed.
- [ ] Public/private authorization is tested.
- [ ] Mobile and desktop primary controls remain reachable.
- [ ] Documentation reflects the actual implementation.
