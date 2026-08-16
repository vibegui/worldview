import { passwordFor, timingSafeEqual } from "./auth.ts";
import type { Env } from "./env.ts";

/**
 * Browser sessions for the standalone deployment.
 *
 * There is one credential, `WORLDVIEW_PASSWORD`. An MCP client sends it as a
 * bearer token; a person types it into the form at `/`. Both end up at the same
 * `/mcp` endpoint with the same tool registry and the same access checks, which
 * is why there is no second API and no second permission model.
 *
 * The cookie holds `<expiresAt>.<hmac>`, never the password itself. The HMAC is
 * keyed by the password, so rotating it invalidates every outstanding session
 * for free — no session table, no D1 write, no dependency.
 */

export const COOKIE_NAME = "worldview_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieHeader(value: string, url: URL, maxAge: number) {
  // `Secure` only over https: setting it unconditionally makes login on
  // http://localhost fail silently, because the browser accepts the response
  // and drops the cookie.
  const attributes = [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (url.protocol === "https:") attributes.push("Secure");
  return attributes.join("; ");
}

async function sign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function mintSession(
  secret: string,
  now = Date.now(),
): Promise<string> {
  const expiresAt = String(now + MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${await sign(secret, expiresAt)}`;
}

export async function verifySession(
  cookieValue: string | null,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!cookieValue) return false;
  const separator = cookieValue.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  const deadline = Number(expiresAt);
  if (!Number.isSafeInteger(deadline) || deadline <= now) return false;

  return timingSafeEqual(signature, await sign(secret, expiresAt));
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export async function hasSession(request: Request, env: Env): Promise<boolean> {
  const password = passwordFor(env);
  if (!password) return false;
  return verifySession(readCookie(request, COOKIE_NAME), password);
}

export async function handleLogin(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  // ponytail: no rate limiting. A Worker has no shared counter without KV or a
  // Durable Object; the upgrade path is a KV counter keyed by cf-connecting-ip
  // with a short TTL. Worth adding the moment this is on a public hostname with
  // a password a human chose.
  const form = await request.formData().catch(() => null);
  const submitted = form?.get("password");
  const expected = passwordFor(env);

  if (!expected) {
    return loginPage(url, "No password is configured on this deployment.", 503);
  }
  if (typeof submitted !== "string" || !timingSafeEqual(submitted, expected)) {
    return loginPage(url, "That password is not right.", 401);
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": sessionCookieHeader(
        await mintSession(expected),
        url,
        MAX_AGE_SECONDS,
      ),
    },
  });
}

export function handleLogout(url: URL): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": sessionCookieHeader("", url, 0),
    },
  });
}

export function loginPage(url: URL, error = "", status = 200): Response {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Worldview</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center;
    font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: Canvas; color: CanvasText;
  }
  form { width: min(22rem, 90vw); display: grid; gap: .75rem; }
  h1 { font-size: 1.25rem; margin: 0; }
  p { margin: 0; opacity: .7; font-size: .875rem; }
  p.error { opacity: 1; color: #b3261e; }
  input, button {
    font: inherit; padding: .6rem .75rem; border-radius: .5rem;
    border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
    background: Canvas; color: inherit;
  }
  button { cursor: pointer; background: CanvasText; color: Canvas; border: 0; }
</style>
</head>
<body>
  <form method="post" action="/login">
    <h1>Worldview</h1>
    <p>What your life is about, what game you are playing, and whether you are playing it well.</p>
    <input type="password" name="password" autocomplete="current-password"
           placeholder="Password" aria-label="Password" autofocus required>
    <button type="submit">Enter</button>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  </form>
</body>
</html>`;

  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      // The login page must never be framed; the app itself is embedded by MCP
      // hosts, but this form takes a credential.
      "x-frame-options": "DENY",
      // Clear a cookie that failed verification so a stale one cannot loop the
      // browser between / and the form.
      ...(status === 401
        ? { "set-cookie": sessionCookieHeader("", url, 0) }
        : {}),
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
