# worldview: the layer above the factory

You (the coding agent) are working on Worldview — the system that answers what
its owner's life is about, what game they are playing, and whether they are
playing it well.

## The one rule that shapes everything

**Worldview never executes.** It declares, measures, and scores. Nothing in
this repo writes code, opens a pull request, publishes a post, sends a message,
or ships anything. Execution belongs to whatever factory connects to it.

That line is testable, so use it as a test: if a tool you are about to add
takes an action with a consequence, it does not belong here. It is also what
makes one deployment safe to connect to several factories at once — a
scorekeeper with no hands.

## Where things live, and why

**The declared future is in git.** `worldview.json` holds *what should be*: the
declared future, the strategic results and their targets, the conditions of
satisfaction, and the definitions of the two scores. Changing it is a commit,
so changing your future is reviewable and forkable.

**D1 holds only what is**: progress, notes, measurements, evidence, memory,
captures, decisions. It changes constantly and is derived from evidence.

`GET_DECLARATION` joins them. **The gap between the two is the only
interesting query in the system.** Consequences to respect:

- A result declared in git with no D1 row reads as 0%. Adding one needs no
  migration — do not write one.
- Recording progress against an id that is *not* declared in git fails on
  purpose. Do not "fix" that by relaxing the check; declare it in git.
- Never move declaration fields into D1 to make a write easier. That is the
  whole architecture, inverted.

## Two scores, and only two

- **Alignment** — does this serve the declared future. A percentage.
- **Integrity** — is it whole and complete, across **word**, **systems**, and
  **objects**. A **count of unacknowledged commitments, target zero.**

Never add a third score. Anything else is diagnostic detail beneath one of
these two — that is what the `diagnostics` array is for, and why the eleven
previous scorecard items were kept rather than deleted.

**Never put a percentage on integrity.** It is a mountain with no top; a
progress bar on it is a category error the model this system is built on
explicitly warns about.

Integrity is a *positive* property, not a moral one: whole and complete, like a
bicycle wheel with all its spokes. A missed commitment is not the breach —
leaving it unacknowledged is. When something will not be kept, the system's job
is to make honoring it cheap: say so, say what happens instead and by when,
clean up the consequences.

## Layout

```
worldview.json        what should be — the declaration, in git
src/core/             pure logic shared by worker and tests (declaration loader)
src/worker/           the Worker: MCP server, tools, D1 state, auth
mcp-app/              the MCP App UI, inlined to one HTML by vite
migrations/           D1 — measurement only, never declaration
tests/                bun tests
scripts/              corpus upload, bookmark import
```

The MCP App builds to `dist-mcp/index.html` and is imported as text by
`src/worker/resources.ts` (wired via the `rules` block in `wrangler.jsonc`), so
**`bun run build` must run before `bun run dev`, `test`, or `deploy`** — a stale
or missing bundle fails the import.

## Capability boundary

The same `/mcp` endpoint serves two capability sets:

- **Public, no token:** published writing tools only.
- **Private, `MCP_PRIVATE_TOKEN`:** everything, plus the MCP App.

Private tools are omitted from `tools/list` for unauthenticated clients, and
the server re-checks on call — guessing a name does not bypass it. When adding
a tool, set `access` deliberately and assume the public set is hostile input.

A bearer token proves possession, not identity. Store it only in the private
Studio connection.

## Live infrastructure — read before touching wrangler.jsonc

This repo deploys over an **existing** Worker holding real personal data. The
Worker name, the D1 `database_id`, the R2 bucket, and the AutoRAG instance are
deliberately unchanged from before the extraction so this is a drop-in
replacement. **Renaming any of them is a migration, not a rename** — it orphans
the data or breaks the owner's Studio connection. Do not do it as a cleanup.

## Rules

- **Never invent numbers.** Every claim about state comes from a query or an
  artifact. No data? Instrument first, conclude later.
- **Migrations are additive.** D1 has no down-migrations here. Remap and keep
  history rather than dropping rows; the eleven old scorecard items are the
  precedent.
- **GitHub is read-only.** Never claim to have changed an external project.
- **Persist only durable information.** Routine conversation is not memory.
- **Project lifecycle is explicit:** draft, active, archived. Do not invent
  priority labels.
- **Activity is evidence of attention, never measured hours.**
- Keep `bun run check` and `bun test` green. Non-trivial logic leaves one
  runnable check behind — see `tests/worldview.test.ts` for the shape.

## Stack docs

`README.md` (run and deploy), `PRODUCT.md` (what this is for), `NOTICE`
(attribution for the leadership model this is built on).
