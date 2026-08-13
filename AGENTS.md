# Working on Worldview: two repositories, at once

Worldview is an engine. On its own it runs, but it is nobody's worldview — the
declaration, the projects, the writing, and the look belong to a **client repo**
that consumes this one.

So development happens across two checkouts at the same time:

| | repo | holds |
|---|---|---|
| **engine** | this one (`worldview`) | all behaviour: MCP server, tools, D1 schema, the UI, auth |
| **client** | `vibegui.com` → `worldview/` | the declaration, `projects/*.md`, bindings, secrets, hero, theme |

**You change the engine here, and you look at the result in the client.** That is
the loop. Changing the engine and only ever running the engine's own example
instance is how a change ships that works for nobody's real data.

> **Forking this?** Rewrite the table above and the paths below to name *your*
> client repo, then delete this note. An agent reading a file that describes
> somebody else's setup will confidently do the wrong thing.

## Wiring the two together

The client depends on the engine by link, so edits here are live there with no
publish step:

```bash
cd <engine>            && bun link          # register
cd <client>/worldview  && bun link worldview && bun install
cd <client>/worldview  && bun run schema:sync   # engine migrations -> client git
```

`node_modules/worldview` in the client is a symlink to this working copy. It
follows your current branch, which is usually what you want and is occasionally
a surprise.

## Running it

Two servers. Both matter, and they answer different questions.

```bash
# the client's worker: real declaration, real D1, real bindings
cd <client>/worldview && bun run dev            # :8787

# the engine's UI with hot reload, pointed at that client
cd <engine> && WORLDVIEW_DIR=<client>/worldview bun run dev:ui   # :5173
```

Design and component changes hot-reload at `:5173` without losing the view you
are on. Content changes — `worldview.json`, `projects/*.md` — reload the page,
because they live on the worker side where vite's module graph cannot see them.

**Sign in once at `:8787`.** The worker owns `/`, so `:5173` has no login form;
cookies are scoped by host and ignore the port, so the session carries over.

`bun run demo` runs the engine's own instance with seeded data and no client at
all. Use it for the demo and for tests, not to judge whether a change works.

## Where a change belongs

Ask what breaks if the other instance did not exist.

- Behaviour, a tool, a view, schema, the capability boundary → **engine**.
- A declaration, a project, a hero, a site title, a binding, a secret → **client**.
- Anything with an `if` in it → engine. If the client needs a branch, the engine
  is missing a config key.

Mirroring production into the client's local D1, one-way, never writing back:

```bash
cd <client>/worldview && bun node_modules/worldview/scripts/db-pull.ts
```

## Before you say it works

- `bun run check && bun test` in the engine.
- `bun run check` in the client — it runs `worldviewErrors()` and
  `projectErrors()` against the real declaration, and catches what typing cannot.
- **Open the page.** Payload shape is not rendering; more than one bug here has
  been a correct response drawn wrong, and both times reading the diff missed it.
- Open it signed out too. `/` is public, and the boundary decides the nav — a
  leak looks like an ordinary component that forgot which tier it was in.

## Two rules this setup exists to protect

**The client contains no logic.** It is configuration and content. The moment it
needs a conditional, add the key to `WorldviewConfig` instead.

**Public is opt-in.** Projects are private until they say `public: true`, and
even then their prose body is never served. A project file states positions
about work other people own; that is fine in a private scorecard and is a
different thing entirely on a website.
