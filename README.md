# Worldview

One MCP server that answers three questions: **what your life is about, what game you are playing, and whether you are playing it well.**

It becomes a persistent personal agent when connected to deco studio — or to any software factory that speaks MCP.

The code is public and copyable. Your projects, goals, memory, decisions, captures, briefs, credentials, and activity stay in your own Cloudflare D1 database and Worker secrets.

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
src/core/             pure logic shared by worker and tests
src/worker/           the Worker: MCP server, tools, D1 state, auth
mcp-app/              the MCP App UI, inlined to one HTML by vite
migrations/           D1 — measurement only, never declaration
tests/                bun tests
scripts/              corpus upload, bookmark import
```

One Cloudflare Worker: D1 for state, R2 + AI Search for the writing corpus, an hourly cron for read-only GitHub evidence. The MCP App builds to `dist-mcp/index.html` and is imported as text by `src/worker/resources.ts`, so **`bun run build` must run before `dev`, `test`, or `deploy`.**

## Capability boundary

The same `/mcp` endpoint has two modes:

- **Public, without a token:** published writing tools only.
- **Private, with `MCP_PRIVATE_TOKEN`:** public tools plus everything else and the MCP App.

Private tools are omitted from `tools/list` and private resources from `resources/list` for unauthenticated clients, and the server re-checks on call — guessing a name does not bypass it.

A bearer token proves possession, not Studio identity. Store it only in the private Studio connection. A later version can replace it with Studio-issued OAuth/JWT.

## Run locally

```bash
bun install
cp .dev.vars.example .dev.vars   # then fill it in
bun run db:local
bun run build
bun run dev
```

MCP URL: `http://localhost:8787/mcp` (wrangler picks the next free port if that one is taken — check its output).

Private connection:

```text
URL:           http://localhost:8787/mcp
Authorization: Bearer <MCP_PRIVATE_TOKEN>
```

Never commit `.dev.vars`.

## Private tools

- `GET_DECLARATION`, `SET_STRATEGIC_RESULT_PROGRESS`, `UPDATE_SCORECARD_ITEM`
- `GET_PORTFOLIO`, `SAVE_PROJECT`, `GET_PROJECT`, `SET_PROJECT_PROGRESS`
- `GET_ATTENTION_MAP`, `GET_STALE_PROJECTS`, `REFRESH_GITHUB`
- `LIST_GOALS`, `CREATE_GOAL`, `UPDATE_GOAL`, `COMPLETE_GOAL`
- `RECALL_MEMORY`, `REMEMBER`, `SUPERSEDE_MEMORY`, `FORGET_MEMORY`
- `LIST_DECISIONS`, `RECORD_DECISION`
- `CAPTURE`, `GET_INBOX`
- `GET_DAILY_BRIEF_INPUT`, `SAVE_DAILY_BRIEF`, `GET_DAILY_BRIEF`
- `SITES_OVERVIEW`, `SITE_METRICS`
- bookmarks: `LIST_ALL_BOOKMARKS`, `SEARCH_ALL_BOOKMARKS`, `CREATE_BOOKMARK`, `UPDATE_BOOKMARK`, `DELETE_BOOKMARK`, `IMPORT_BOOKMARKS`, `ENRICH_BOOKMARK`
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

Secrets are set with `wrangler secret put MCP_PRIVATE_TOKEN` and `wrangler secret put GITHUB_TOKEN`; migrations with `bun run db:remote`.

> **This repo deploys over an existing Worker.** The Worker name, D1 `database_id`, R2 bucket, and AI Search instance in `wrangler.jsonc` are deliberately unchanged from before this project was extracted out of `vibegui.com/mcp`, so it is a drop-in replacement for a deployment holding real data. Renaming any of them is a migration, not a rename.

## Copy for yourself

Intentionally one deployment per person:

1. Fork the repository.
2. **Write your own `worldview.json`.** This is the actual work — the rest is plumbing. A declaration is a place to stand, not a prediction; it does not have to be true when you write it.
3. Change the Worker name and the D1/R2 names in `wrangler.jsonc`, remove the `database_id`, and create your own with `wrangler d1 create`.
4. Point the public writing adapter at your own site, or delete the public tools.
5. `bun run db:remote`, set `MCP_PRIVATE_TOKEN` and `GITHUB_TOKEN`, deploy.
6. Add the `/mcp` URL to a private Studio connection with the bearer token.
7. Ask it for `GET_DECLARATION`, then `SAVE_PROJECT` for your first project.

`GITHUB_TOKEN` is currently a classic PAT with `repo` scope so it can read repositories across accounts and orgs. The Worker only issues GET requests, but that scope is broader than ideal — GitHub App auth should replace it.

The declaration, projects, goals, memory, and briefing core carry no hardcoded personal data beyond `worldview.json`. The public writing tools are an example module.

## Attribution

The two scores and this system's treatment of integrity and the created future come from the ontological leadership work of Werner Erhard, Michael C. Jensen, Steve Zaffron, and Kari Granger. See [`NOTICE`](./NOTICE).

## License

MIT — see [`LICENSE`](./LICENSE).
