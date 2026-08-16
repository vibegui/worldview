import { describe, expect, test } from "bun:test";
import {
  COOKIE_NAME,
  mintSession,
  readCookie,
  sessionCookieHeader,
  verifySession,
} from "../src/worker/session.ts";

const PASSWORD = "a-long-random-value";
const OTHER = "a-long-random-valu3";

describe("browser sessions", () => {
  test("a freshly minted cookie verifies", async () => {
    expect(await verifySession(await mintSession(PASSWORD), PASSWORD)).toBe(true);
  });

  test("the cookie never contains the password", async () => {
    expect(await mintSession(PASSWORD)).not.toContain(PASSWORD);
  });

  test("a tampered signature is rejected", async () => {
    const cookie = await mintSession(PASSWORD);
    const flipped = `${cookie.slice(0, -1)}${cookie.endsWith("0") ? "1" : "0"}`;
    expect(await verifySession(flipped, PASSWORD)).toBe(false);
  });

  test("a tampered expiry is rejected", async () => {
    const cookie = await mintSession(PASSWORD);
    const signature = cookie.slice(cookie.indexOf(".") + 1);
    const extended = `${Date.now() + 10_000_000}.${signature}`;
    expect(await verifySession(extended, PASSWORD)).toBe(false);
  });

  test("an expired cookie is rejected", async () => {
    const past = Date.now() - 60_000;
    // Minted for a moment far enough back that its own deadline has passed.
    const cookie = await mintSession(PASSWORD, past - 40 * 24 * 60 * 60 * 1000);
    expect(await verifySession(cookie, PASSWORD)).toBe(false);
  });

  test("rotating the password invalidates outstanding sessions", async () => {
    // The whole reason there is no session table: the HMAC key is the password.
    const cookie = await mintSession(PASSWORD);
    expect(await verifySession(cookie, OTHER)).toBe(false);
  });

  test("malformed and missing values are rejected", async () => {
    for (const value of [null, "", ".", "abc", "abc.def", ".deadbeef", "12345"]) {
      expect(await verifySession(value, PASSWORD), `accepted ${value}`).toBe(false);
    }
  });
});

describe("cookie attributes", () => {
  test("Secure is set over https", () => {
    const header = sessionCookieHeader("v", new URL("https://example.com/"), 60);
    expect(header).toContain("Secure");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });

  test("Secure is omitted over http so localhost can log in", () => {
    // A Secure cookie on http is silently dropped by the browser, which looks
    // like a wrong password rather than a configuration bug.
    const header = sessionCookieHeader("v", new URL("http://localhost:8787/"), 60);
    expect(header).not.toContain("Secure");
    expect(header).toContain("HttpOnly");
  });
});

describe("reading cookies", () => {
  test("finds the session among others", () => {
    const request = new Request("https://example.com/", {
      headers: { cookie: `other=1; ${COOKIE_NAME}=wanted; trailing=2` },
    });
    expect(readCookie(request, COOKIE_NAME)).toBe("wanted");
  });

  test("does not match a name by prefix", () => {
    const request = new Request("https://example.com/", {
      headers: { cookie: `${COOKIE_NAME}_other=nope` },
    });
    expect(readCookie(request, COOKIE_NAME)).toBeNull();
  });

  test("returns null with no cookie header", () => {
    expect(readCookie(new Request("https://example.com/"), COOKIE_NAME)).toBeNull();
  });
});
