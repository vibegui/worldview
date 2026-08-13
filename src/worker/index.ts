import { accessForRequest } from "./auth.ts";
import {
  BookmarkError,
  getBookmarkFacets,
  getPublicBookmark,
  listBookmarks,
  searchBookmarks,
} from "./bookmarks.ts";
import type { Env, ResolvedConfig } from "./env.ts";
import { refreshGitHub } from "./github.ts";
import { handleMcpRequest } from "./mcp.ts";
import { appHtml } from "./resources.ts";
import {
  COOKIE_NAME,
  handleLogin,
  handleLogout,
  hasSession,
  loginPage,
  readCookie,
  sessionCookieHeader,
} from "./session.ts";
import { markBriefDue } from "./state.ts";
import { EVENT_NAME_RE, pruneEvents, track } from "./track.ts";

/**
 * Build the worker around one instance's configuration.
 *
 * The config is folded into `env` rather than threaded through every signature:
 * handlers already receive `env`, and the declaration is read the same way a
 * binding is. That keeps the diff at the call sites to `env.worldview` instead
 * of a module-level import.
 */
export function createWorker(config: ResolvedConfig): ExportedHandler<Env> {
  const SERVICE_NAME = config.worldview.instance;

  // Every view, in both languages. `/en/...` mirrors the site, where the URL is
  // the source of truth for language rather than a cookie.
  const VIEWS = ["/", "/declaration", "/projects", "/analytics", "/learning", "/bookmarks"];
  const VIEW_PATHS = new Set([
    ...VIEWS,
    ...VIEWS.map((view) => (view === "/" ? "/en/" : `/en${view}`)),
    "/en",
  ]);

  return {
    async fetch(request, baseEnv, ctx) {
      const env: Env = { ...baseEnv, ...config };
      const url = new URL(request.url);
    // Two ways to hold the one credential: a bearer token an MCP client sends,
    // or a signed cookie a browser got by typing the password. Both mean the
    // same thing to every check downstream.
    const access =
      accessForRequest(request, env) === "private" ||
      (await hasSession(request, env))
        ? "private"
        : "public";

    if (
      request.method === "OPTIONS" &&
      (url.pathname === "/bookmarks" ||
        url.pathname === "/bookmarks/search" ||
        url.pathname === "/bookmarks/facets" ||
        url.pathname === "/bookmarks/content")
    ) {
      return new Response(null, {
        status: 204,
        headers: bookmarkCorsHeaders(env),
      });
    }

    // `/bookmarks` is both a JSON API the static site calls and a view a person
    // navigates to. A browser asks for text/html and fetch() does not, so the
    // two can share the path — which beats renaming an endpoint that is already
    // deployed and consumed, or giving the tab a word that is not its name.
    const wantsHtml = (request.headers.get("accept") ?? "").includes(
      "text/html",
    );

    if (
      request.method === "GET" &&
      !wantsHtml &&
      (url.pathname === "/bookmarks" ||
        url.pathname === "/bookmarks/search" ||
        url.pathname === "/bookmarks/facets" ||
        url.pathname === "/bookmarks/content")
    ) {
      try {
        if (url.pathname === "/bookmarks") {
          const result = await listBookmarks(env, {
            limit: queryNumber(url, "limit"),
            offset: queryNumber(url, "offset"),
            tags: url.searchParams.getAll("tag"),
            platform: url.searchParams.get("platform") ?? undefined,
            minStars: queryNumber(url, "min_stars"),
            sort: querySort(url.searchParams.get("sort")),
            publicOnly: true,
          });
          return bookmarkJson(result, env, 200, 300);
        }
        if (url.pathname === "/bookmarks/facets") {
          return bookmarkJson(await getBookmarkFacets(env), env, 200, 300);
        }
        if (url.pathname === "/bookmarks/search") {
          const query = url.searchParams.get("q")?.trim() ?? "";
          if (!query) {
            throw new BookmarkError("q is required", 400, "BAD_QUERY");
          }
          const result = await searchBookmarks(env, query, {
            limit: queryNumber(url, "limit"),
            offset: queryNumber(url, "offset"),
            tags: url.searchParams.getAll("tag"),
            platform: url.searchParams.get("platform") ?? undefined,
            minStars: queryNumber(url, "min_stars"),
            publicOnly: true,
          });
          return bookmarkJson(result, env, 200, 60);
        }
        const bookmarkUrl = url.searchParams.get("url")?.trim() ?? "";
        if (!bookmarkUrl) {
          throw new BookmarkError("url is required", 400, "BAD_URL");
        }
        const bookmark = await getPublicBookmark(env, bookmarkUrl);
        if (!bookmark) {
          throw new BookmarkError(
            "Bookmark not found",
            404,
            "BOOKMARK_NOT_FOUND",
          );
        }
        return bookmarkJson({ bookmark }, env, 200, 300);
      } catch (error) {
        const status = error instanceof BookmarkError ? error.status : 500;
        const code =
          error instanceof BookmarkError ? error.code : "INTERNAL_ERROR";
        console.error(
          JSON.stringify({
            message: "bookmark request failed",
            path: url.pathname,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
        return bookmarkJson(
          {
            error: {
              code,
              message:
                status >= 500
                  ? "Bookmark service failed"
                  : error instanceof Error
                    ? error.message
                    : "Request failed",
            },
          },
          env,
          status,
          0,
        );
      }
    }

    // Public popularity ranking (feeds the "mais vistas" sort on the sites).
    // Aggregated pageview counts only — no visitor data leaves the worker.
    if (request.method === "GET" && url.pathname === "/popular") {
      const site = url.searchParams.get("site") ?? "";
      const days = Math.min(
        Math.max(Number(url.searchParams.get("days")) || 90, 1),
        90,
      );
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const { results } = await env.DB.prepare(
        `SELECT path, COUNT(*) AS views
         FROM events
         WHERE name = 'pageview' AND ts >= ? AND site = ?
         GROUP BY path ORDER BY views DESC LIMIT 2000`,
      )
        .bind(since, site)
        .all();
      return new Response(JSON.stringify({ site, days, items: results }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=300",
        },
      });
    }

    // Public analytics beacon (first-party, fire-and-forget). The vibegui.com
    // Pages middleware posts server-side pageviews here for the three sites.
    if (request.method === "POST" && url.pathname === "/e") {
      const body = (await request.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const name = typeof body?.name === "string" ? body.name : "";
      if (!body || !EVENT_NAME_RE.test(name)) {
        return json({ error: "invalid event" }, 400);
      }
      const str = (v: unknown) => (typeof v === "string" ? v : undefined);
      ctx.waitUntil(
        track(env, name, {
          value: typeof body.value === "number" ? body.value : undefined,
          site: str(body.site),
          path: str(body.path),
          ref: str(body.ref),
          country:
            str(body.country) ??
            request.headers.get("cf-ipcountry") ??
            undefined,
          dims:
            body.dims && typeof body.dims === "object"
              ? (body.dims as Record<string, unknown>)
              : undefined,
          ip: str(body.ip) ?? request.headers.get("cf-connecting-ip") ?? "",
          ua: str(body.ua) ?? request.headers.get("user-agent") ?? "",
        }),
      );
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && url.pathname === "/login") {
      return handleLogin(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/logout") {
      return handleLogout(url);
    }

    if (request.method === "GET" && url.pathname === "/login") {
      return access === "private"
        ? Response.redirect(new URL("/", url).toString(), 303)
        : loginPage(url);
    }

    // The standalone entry point, and the public face. Anonymous visitors get
    // the same bundle; the server decides what it may show them, and the app
    // builds its nav from the tools it is actually allowed to call. One
    // codebase, one boundary, no second frontend to keep in sync.
    //
    // Every view path serves the same bundle so a tab can have a real URL that
    // survives a refresh. Listed rather than a catch-all, so an actual typo is
    // still a 404 instead of a page that renders and then does nothing.
    if (request.method === "GET" && VIEW_PATHS.has(url.pathname)) {
      return new Response(appHtml(env, null, true), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          // A signed-in view must not be cached by anything in front of the
          // worker; the anonymous one is the same bytes for everyone.
          "cache-control":
            access === "private" ? "no-store" : "public, max-age=60",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/mcp") {
      return json({
        jsonrpc: "2.0",
        server: {
          name: SERVICE_NAME,
          version: "0.1.0",
        },
        mode: access,
        hint: "POST MCP JSON-RPC requests here.",
      });
    }

    if (request.method === "POST" && url.pathname === "/mcp") {
      // A browser whose session expired should be sent back to the form, not
      // shown a tool list with everything quietly missing. Only a request that
      // carries our cookie can be in that situation; a plain MCP client with no
      // token still gets the public tier.
      if (access === "public" && readCookie(request, COOKIE_NAME)) {
        // Clear the cookie that caused this. Without it the browser keeps
        // presenting the same dead session, and since `/` now serves the app
        // rather than the login form, the redirect has nothing to break the
        // cycle — it just reloads and 401s again.
        return new Response(JSON.stringify({ error: "session expired" }), {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "set-cookie": sessionCookieHeader("", url, 0),
          },
        });
      }
      return handleMcpRequest(request, env, access);
    }

      return json({ error: "not found", path: url.pathname }, 404);
    },

    async scheduled(_controller, baseEnv, context) {
      const env: Env = { ...baseEnv, ...config };
      context.waitUntil(
        Promise.all([
          markBriefDue(env),
          pruneEvents(env),
          env.GITHUB_TOKEN
            ? refreshGitHub(env).catch((error) => {
                console.warn("Scheduled GitHub refresh failed", error);
              })
            : Promise.resolve(),
        ]).then(() => undefined),
      );
    },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function bookmarkJson(
  value: unknown,
  env: Env,
  status: number,
  maxAgeSeconds: number,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...bookmarkCorsHeaders(env),
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        maxAgeSeconds > 0
          ? `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=86400`
          : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function bookmarkCorsHeaders(env: Env): Record<string, string> {
  void env;
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function queryNumber(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new BookmarkError(`${key} must be a number`, 400, "BAD_QUERY");
  }
  return value;
}

function querySort(
  value: string | null,
): "recent" | "published" | "rating" | "title" | undefined {
  if (value === null || value === "") return undefined;
  if (
    value === "recent" ||
    value === "published" ||
    value === "rating" ||
    value === "title"
  ) {
    return value;
  }
  throw new BookmarkError(
    "sort must be recent, rating, or title",
    400,
    "BAD_QUERY",
  );
}
