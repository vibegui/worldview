import { describe, expect, test } from "bun:test";
import { accessForRequest, timingSafeEqual } from "../src/worker/auth.ts";
import type { Env } from "../src/worker/env.ts";

function env(token?: string): Env {
  return {
    WORLDVIEW_PASSWORD: token,
  } as Env;
}

describe("private MCP authentication", () => {
  test("fails closed when no private token is configured", () => {
    const request = new Request("https://example.com/mcp", {
      headers: { authorization: "Bearer anything" },
    });
    expect(accessForRequest(request, env())).toBe("public");
  });

  test("accepts the configured bearer token", () => {
    const request = new Request("https://example.com/mcp", {
      headers: { authorization: "Bearer private-value" },
    });
    expect(accessForRequest(request, env("private-value"))).toBe("private");
  });

  test("rejects an incorrect token", () => {
    const request = new Request("https://example.com/mcp", {
      headers: { "x-mcp-auth": "wrong" },
    });
    expect(accessForRequest(request, env("private-value"))).toBe("public");
  });

  test("honours the former secret name, so an existing deployment keeps working", () => {
    // A deploy that forgets to re-put the secret under the new name would not
    // error — it would silently drop to the public tier with every private tool
    // gone. Accepting both names is what makes the rename a non-event.
    const request = new Request("https://example.com/mcp", {
      headers: { authorization: "Bearer legacy-value" },
    });
    expect(
      accessForRequest(request, { MCP_PRIVATE_TOKEN: "legacy-value" } as Env),
    ).toBe("private");
  });

  test("the new name wins when both are set", () => {
    const request = new Request("https://example.com/mcp", {
      headers: { authorization: "Bearer new-value" },
    });
    expect(
      accessForRequest(request, {
        WORLDVIEW_PASSWORD: "new-value",
        MCP_PRIVATE_TOKEN: "legacy-value",
      } as Env),
    ).toBe("private");
  });

  test("timing-safe comparison handles equal and unequal values", () => {
    expect(timingSafeEqual("same", "same")).toBe(true);
    expect(timingSafeEqual("same", "diff")).toBe(false);
    expect(timingSafeEqual("short", "longer")).toBe(false);
  });
});
