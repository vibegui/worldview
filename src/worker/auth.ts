import type { AccessLevel, Env } from "./env.ts";

const BEARER_PREFIX = "Bearer ";

export function extractPrivateToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith(BEARER_PREFIX)) {
    return authorization.slice(BEARER_PREFIX.length).trim();
  }

  const custom = request.headers.get("x-mcp-auth");
  if (custom?.trim()) return custom.trim();

  // fallback para hosts MCP que só guardam uma URL (ex.: deco studio):
  // https://.../mcp?token=<WORLDVIEW_PASSWORD>
  try {
    const token = new URL(request.url).searchParams.get("token");
    return token?.trim() || null;
  } catch {
    return null;
  }
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * The one credential, under either name.
 *
 * `MCP_PRIVATE_TOKEN` was the original name and is still the secret set on
 * deployments that predate the rename. Accepting both means an existing worker
 * keeps working after a deploy without anyone remembering to re-put a secret —
 * and forgetting would not error, it would silently drop the deployment to the
 * public tier, which is the worst kind of failure: quiet and total.
 */
export function passwordFor(env: Env): string | undefined {
  return env.WORLDVIEW_PASSWORD || env.MCP_PRIVATE_TOKEN;
}

export function accessForRequest(request: Request, env: Env): AccessLevel {
  const expected = passwordFor(env);
  if (!expected) return "public";

  const received = extractPrivateToken(request);
  if (!received || !timingSafeEqual(received, expected)) return "public";
  return "private";
}
