# Worldview

One system that answers three questions: **what my life is about, what game I am playing, and whether I am playing it well.**

It is reachable two ways, and they are the same server:

- **In a browser** at `worldview.vibegui.com` — the declaration and both scores in public, everything else behind one password.
- **As an MCP server** at `/mcp`, so deco Studio or any factory that speaks MCP becomes a persistent personal agent on top of it.

Projects, goals, memory, decisions, captures, briefs, and activity live in one Cloudflare D1 database. This repo was extracted out of `vibegui.com/mcp`; the blog stayed behind, as [a project inside the worldview](./projects/blog.md) rather than the thing wrapped around it.

## What this is not

**Worldview never executes.** It declares, measures, and scores. Nothing here writes code, opens a pull request, publishes a post, or ships anything. Execution belongs to the factory you connect it to.

That line is testable: if a proposed tool takes an action with a consequence, it does not belong in this repo. It is also what makes one deployment safe to connect to several factories at once — a scorekeeper with no hands.

## The declared future lives in git

`worldview.json` holds **what should be**: the declared future, the strategic results and their targets, the conditions of satisfaction, and the definitions of the two scores. Changing it is a commit, so changing your future is reviewable and forkable rather than an untracked edit at 2am.

D1 holds **what is**: progress, notes, measurements, evidence.

`GET_DECLARATION` joins them, and **the gap between the two is the only interesting query in the system.** A result declared in git with no row in D1 yet reads as 0% — adding one needs no migration. Recording progress against an id that is *not* declared in git fails on purpose.

## Two scores, and only two

- **Alignment** — does what I am doing serve the future I declared.
- **Integrity** — is it whole and complete: of my **word**, my **systems**, and my **objects**.

Integrity is a positive property, not a moral one. A missed commitment is not the breach; leaving it unacknowledged is. Its metric is a count of unacknowledged commitments with a target of zero, never a percentage — integrity is a mountain with no top, so a progress bar on it is a category error.

Anything else is diagnostic detail beneath one of the two.

## Architecture

```
worldview.json        what should be — the declaration, in git
projects/*.md         one project each: what it serves, its outcome, its criteria
src/index.ts          the deployment: declaration + projects + modules, wired
src/core/             pure logic shared by worker and tests
src/worker/           the Worker: MCP server, tools, D1 state, auth
mcp-app/              the UI, inlined to one HTML by vite, served two ways
migrations/           D1 — measurement only, never declaration
tests/                bun tests
scripts/              corpus upload, bookmark import, local mirror of prod D1
```

One Cloudflare Worker: D1 for state, R2 + AI Search for the writing corpus, an hourly cron for read-only GitHub evidence. The MCP App builds to `dist-mcp/index.html` and is imported as text by `src/worker/resources.ts`, so **`bun run build` must run before `dev`, `test`, or `deploy`.**

## Capability boundary

The same `/mcp` endpoint has two modes:

- **Public, without a credential:** the declaration, both scores, projects marked `public: true`, public bookmarks, and the published-writing tools.
- **Private, with `WORLDVIEW_PASSWORD`:** everything.

Private tools are omitted from `tools/list` and private resources from `resources/list` for unauthenticated clients, and the server re-checks on call — guessing a name does not bypass it. The browser and MCP share one credential: a bearer token for a client, the same string typed into `/login` for a person, which returns an HMAC-signed cookie. Rotating the password invalidates every session for free. `MCP_PRIVATE_TOKEN` is still accepted under its old name.

A bearer token proves possession, not identity. Store it only in the private Studio connection.

## Run locally

```bash
bun install
cp .dev.vars.example .dev.vars   # then fill it in
bun run db:pull                  # schema from migrations, data from production
bun run build
bun run dev
```

Open `http://localhost:8787`, sign in with `WORLDVIEW_PASSWORD`. MCP is at `/mcp` on the same origin (wrangler picks the next free port if 8787 is taken — check its output).

`bun run dev:ui` adds a hot-reloading UI on `:5173` that proxies everything with a consequence to the worker. See [`AGENTS.md`](./AGENTS.md).

`db:pull` is one-way and leaves `.snapshot.sql`, which holds real personal data and is gitignored. Never commit it, or `.dev.vars`.

## Private tools

- `GET_DECLARATION`, `SET_STRATEGIC_RESULT_PROGRESS`, `UPDATE_SCORECARD_ITEM`
- `GET_PORTFOLIO`, `GET_PROJECT`, `SET_PROJECT_STATE`, `SET_PROJECT_PROGRESS`
- `GET_ATTENTION_MAP`, `GET_STALE_PROJECTS`, `REFRESH_GITHUB`
- `LIST_GOALS`, `CREATE_GOAL`, `UPDATE_GOAL`, `COMPLETE_GOAL`
- `RECALL_MEMORY`, `REMEMBER`, `SUPERSEDE_MEMORY`, `FORGET_MEMORY`
- `LIST_DECISIONS`, `RECORD_DECISION`
- `CAPTURE`, `GET_INBOX`
- `GET_DAILY_BRIEF_INPUT`, `SAVE_DAILY_BRIEF`, `GET_DAILY_BRIEF`
- `SITES_OVERVIEW`, `SITE_METRICS`
- bookmarks: `SAVE_BOOKMARK` (a URL is the whole argument — the page's own `<head>` supplies the rest), `LIST_ALL_BOOKMARKS`, `SEARCH_ALL_BOOKMARKS`, `GET_BOOKMARK_ADMIN`, `CREATE_BOOKMARK`, `UPDATE_BOOKMARK`, `DELETE_BOOKMARK`, `IMPORT_BOOKMARKS`, `ENRICH_BOOKMARK`
- `GET_STATUS`, `GET_CORPUS_STATUS`

The hourly cron refreshes read-only GitHub evidence when `GITHUB_TOKEN` exists and marks the daily brief as due.

## Writing corpus

Markdown in the source site's git is the only article source of truth; articles are never stored in D1. R2 holds a derived mirror under `articles/` purely for AI Search:

```bash
bun run corpus:upload:remote
```

Drafts are excluded. `SEARCH_PUBLIC_WRITING` uses AI Search when indexed results are available and falls back to lexical manifest search while indexing is pending.

## Deploy

```bash
bun run deploy:dry   # build + validate without shipping
bun run deploy
```

Secrets are set with `wrangler secret put WORLDVIEW_PASSWORD` and `wrangler secret put GITHUB_TOKEN`; migrations with `bun run db:remote`.

> **This is a new Worker bound to existing data.** `worldview` deploys to `worldview.vibegui.com` and binds the D1, R2, and AI Search resources the old `vibegui-personal-ai-os` already owned. Nothing is renamed and nothing is copied. That Worker keeps serving `mcp.vibegui.com` until the Studio connection is repointed, so rollback is "stop deploying this one". Renaming any of those resources is a migration with a data-movement plan, never a cleanup.

`GITHUB_TOKEN` is a classic PAT with `repo` scope so it can read repositories across accounts and orgs. The Worker only issues GET requests, but that scope is broader than ideal — GitHub App auth should replace it.

## Attribution

The two scores and this system's treatment of integrity and the created future come from the ontological leadership work of Werner Erhard, Michael C. Jensen, Steve Zaffron, and Kari Granger. See [`NOTICE`](./NOTICE).

## License

MIT — see [`LICENSE`](./LICENSE).
