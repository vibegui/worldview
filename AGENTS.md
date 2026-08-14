# Working on Worldview

One repo, one deployment, one owner. The declaration, the projects, the tools,
the schema, and the UI all live here and ship together.

This used to be `vibegui.com/mcp`. It was extracted because it had outgrown
being a subdirectory of a blog, and because the blog is a *project inside* the
worldview rather than the thing wrapped around it.

## Not a blog engine

vibegui.com stays a Cloudflare Pages deployment that renders its own articles,
its own feeds, and its own metadata. This worker does not serve article HTML and
should never start.

What it does with the blog is read it: `LIST_PUBLIC_WRITING`,
`GET_PUBLIC_WRITING`, and `SEARCH_PUBLIC_WRITING` fetch the published manifest
and the source markdown, so an agent can check what has already been said before
writing something that repeats it. The relationship is one link in the blog menu
pointing at worldview.vibegui.com, and one manifest fetch pointing back.

If a task starts with "render the articles here", stop and check — that is the
line this repo already decided not to cross once.

## Running it

Two servers, answering different questions:

```bash
bun run build && bun run dev   # the worker: real declaration, real D1  :8787
bun run dev:ui                 # the UI with hot reload                  :5173
```

Design and component changes hot-reload at `:5173` without losing the view you
are on. Content — `worldview.json`, `projects/*.md` — reloads the page, because
it lives on the worker side where vite's module graph cannot see it.

**Sign in once at `:8787`.** The worker owns `/`, so `:5173` has no login form;
cookies are scoped by host and ignore the port, so the session carries over.

`bun run build` must come before `dev`, `test`, or `deploy` — the UI bundle is
imported as text by `src/worker/resources.ts`, and a stale one fails the import.

## Local mirrors production

```bash
bun run db:pull      # schema from migrations, data from the deployed D1
```

Strictly one-way; nothing writes back. It leaves `.snapshot.sql`, which holds
real personal data, is gitignored, and should be deleted when you are done.

There is no seeded demo mode. Local *is* production's data, which is the only
way to notice the bugs that only real rows produce.

## Before you say it works

- `bun run check && bun test`.
- **Open the page.** Payload shape is not rendering; more than one bug here has
  been a correct response drawn wrong, and reading the diff missed it both times.
- Open it signed out too. `/` is public and the capability boundary decides the
  nav, so a leak looks like an ordinary component that forgot which tier it was
  in.

## Two rules worth restating

**Public is opt-in.** Projects are private until they say `public: true`, and
even then their prose body is never served. A project file states positions
about work other people own; that is fine in a private scorecard and a different
thing entirely on a website.

**Worldview never executes.** It declares, measures, and scores. If a tool you
are about to add takes an action with a consequence, it belongs somewhere else.
