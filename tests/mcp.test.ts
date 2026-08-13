import { describe, expect, test } from "bun:test";
import type { Env } from "../src/worker/env.ts";
import { dispatchMcp } from "../src/worker/mcp.ts";
import {
  BOOKMARKS_RESOURCE,
  mergeSemanticWriting,
  PERSONAL_AI_OS_RESOURCE,
} from "../src/worker/tools.ts";

import declarationJson from "../worldview.json" with { type: "json" };
import { resolveWorldview } from "../src/core/worldview.ts";
import { parseProjects, publicProject } from "../src/core/projects.ts";

const worldview = resolveWorldview({ declaration: declarationJson });

/** An instance with every optional module on and one project made public. */
const env = {
  worldview,
  projects: parseProjects([
    `---\nid: shown\nname: Shown\nserves: [agency]\npublic: true\n---\n\n## Declared outcome\n\nx\n`,
  ]),
  publicWriting: { siteOrigin: "https://example.com", manifestPath: "/m.json" },
  bookmarks: { publicRoutes: true },
  analytics: { sites: ["example.com"] },
} as unknown as Env;

/** An instance that configured nothing: declaration, projects, scores. */
const bare = { worldview, projects: [] } as unknown as Env;

describe("MCP capability boundary", () => {
  test("public clients see the declaration layer and nothing operational", async () => {
    const result = (await dispatchMcp(env, "public", "tools/list")) as {
      tools: Array<{ name: string }>;
    };
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain("LIST_PUBLIC_WRITING");
    expect(names).toContain("GET_PUBLIC_WRITING");
    expect(names).toContain("LIST_BOOKMARKS");
    expect(names).toContain("SEARCH_BOOKMARKS");
    expect(names).toContain("GET_BOOKMARK");
    // The declaration and the project map are the public face; everything that
    // is working state is not.
    expect(names).toContain("GET_DECLARATION");
    expect(names).toContain("GET_PORTFOLIO");
    expect(names).not.toContain("RECALL_MEMORY");
    expect(names).not.toContain("GET_PROJECT");
    expect(names).not.toContain("GET_DAILY_BRIEF");
    expect(names).not.toContain("CREATE_BOOKMARK");
    expect(names).not.toContain("UPDATE_BOOKMARK");
    expect(names).not.toContain("DELETE_BOOKMARK");
    expect(names).not.toContain("IMPORT_BOOKMARKS");
    expect(names).not.toContain("ENRICH_BOOKMARK");
  });

  test("private clients see public and private tools", async () => {
    const result = (await dispatchMcp(env, "private", "tools/list")) as {
      tools: Array<{ name: string }>;
    };
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain("LIST_PUBLIC_WRITING");
    expect(names).toContain("GET_PORTFOLIO");
    expect(names).toContain("RECALL_MEMORY");
    expect(names).toContain("GET_DAILY_BRIEF_INPUT");
    expect(names).toContain("CREATE_BOOKMARK");
    expect(names).toContain("LIST_ALL_BOOKMARKS");
    expect(names).toContain("SEARCH_ALL_BOOKMARKS");
    expect(names).toContain("GET_BOOKMARK_ADMIN");
    expect(names).toContain("IMPORT_BOOKMARKS");
    expect(names).toContain("ENRICH_BOOKMARK");
  });

  test("an unconfigured module is absent, not disabled", async () => {
    const result = (await dispatchMcp(bare, "private", "tools/list")) as {
      tools: Array<{ name: string }>;
    };
    const names = result.tools.map((tool) => tool.name);

    // Core survives with no configuration at all.
    expect(names).toContain("GET_DECLARATION");
    expect(names).toContain("GET_PORTFOLIO");
    expect(names).toContain("RECALL_MEMORY");

    // Modules the instance never configured do not exist. A tool that appears
    // and then throws "not configured" advertises a capability the deployment
    // cannot honour.
    for (const absent of [
      "LIST_BOOKMARKS",
      "LIST_ALL_BOOKMARKS",
      "ENRICH_BOOKMARK",
      "SITES_OVERVIEW",
      "SITE_METRICS",
      "LIST_PUBLIC_WRITING",
      "SEARCH_PUBLIC_WRITING",
    ]) {
      expect(names, `${absent} leaked from an unconfigured module`).not.toContain(
        absent,
      );
    }
  });

  test("calling into an unconfigured module fails like an unknown tool", async () => {
    // Filtering the list is not enough — guessing the name must not work either.
    expect(
      dispatchMcp(bare, "private", "tools/call", {
        name: "LIST_ALL_BOOKMARKS",
        arguments: {},
      }),
    ).rejects.toThrow(/Unknown tool/);
  });

  test("guessed private tool calls fail for public clients", async () => {
    expect(
      dispatchMcp(env, "public", "tools/call", {
        name: "GET_PROJECT",
        arguments: { id: "anything" },
      }),
    ).rejects.toThrow("Unknown tool");
    expect(
      dispatchMcp(env, "public", "tools/call", {
        name: "IMPORT_BOOKMARKS",
        arguments: { bookmarks: [] },
      }),
    ).rejects.toThrow("Unknown tool");
  });

  test("bookmark resources are visible only to private clients", async () => {
    const publicResult = (await dispatchMcp(
      env,
      "public",
      "resources/list",
    )) as { resources: unknown[] };
    const privateResult = (await dispatchMcp(
      env,
      "private",
      "resources/list",
    )) as { resources: Array<{ uri: string }> };

    expect(publicResult.resources).toEqual([]);
    expect(privateResult.resources.map((resource) => resource.uri)).toContain(
      BOOKMARKS_RESOURCE,
    );
    expect(privateResult.resources.map((resource) => resource.uri)).toContain(
      PERSONAL_AI_OS_RESOURCE,
    );
  });

  test("private bookmark app boots the complete list tool", async () => {
    const result = (await dispatchMcp(env, "private", "resources/read", {
      uri: BOOKMARKS_RESOURCE,
    })) as { contents: Array<{ text: string }> };

    expect(result.contents[0]?.text).toContain(
      'window.__BOOT_TOOL__="LIST_ALL_BOOKMARKS"',
    );
  });

  test("semantic results exclude stale or unpublished corpus slugs", () => {
    const merged = mergeSemanticWriting(
      [
        { slug: "published", text: "best", score: 0.9 },
        { slug: "published", text: "duplicate", score: 0.5 },
        { slug: "stale-draft", text: "must not leak", score: 1 },
      ],
      [{ slug: "published", title: "Published article" }],
      10,
    );

    expect(merged).toEqual([
      {
        slug: "published",
        title: "Published article",
        text: "best",
        score: 0.9,
      },
    ]);
  });
});

describe("what a stranger may see", () => {
  const projects = parseProjects([
    `---\nid: open\nname: Open\nserves: [agency]\npublic: true\n---\n\n**Spirit:** shown.\n\n## Declared outcome\n\nVisible.\n\n## Competing with a colleague\n\nNot for the internet.\n`,
    `---\nid: closed\nname: Closed\nserves: [agency]\n---\n\n**Spirit:** hidden.\n\n## Declared outcome\n\nInvisible.\n`,
  ]);

  test("a project is private until it says otherwise", () => {
    // The default has to be closed. A project file states positions about work
    // other people own, so a system that leaks by default is wrong however good
    // its transparency story is.
    expect(projects.find((p) => p.id === "open")?.isPublic).toBe(true);
    expect(projects.find((p) => p.id === "closed")?.isPublic).toBe(false);
  });

  test("the public shape of a project never carries its prose", () => {
    const open = projects.find((p) => p.id === "open")!;
    const shape = publicProject(open);
    expect(shape.outcome).toBe("Visible.");
    // The competitive sections live in the body, which is why it is omitted
    // entirely rather than filtered.
    expect(JSON.stringify(shape)).not.toContain("Competing with a colleague");
    expect("body" in shape).toBe(false);
  });

  test("the declaration is public but its diagnostics are not", async () => {
    const withProjects = { ...env, projects } as Env;
    const anonymous = (await dispatchMcp(withProjects, "public", "tools/list")) as {
      tools: Array<{ name: string }>;
    };
    const names = anonymous.tools.map((tool) => tool.name);

    expect(names).toContain("GET_DECLARATION");
    expect(names).toContain("GET_PORTFOLIO");
    // Everything operational stays behind the password.
    for (const absent of [
      "GET_DAILY_BRIEF",
      "RECALL_MEMORY",
      "LIST_DECISIONS",
      "GET_INBOX",
      "GET_PROJECT",
      "SET_PROJECT_STATE",
      "SITES_OVERVIEW",
    ]) {
      expect(names, `${absent} is public`).not.toContain(absent);
    }
  });
});

describe("a public tab that would always be empty", () => {
  const closed = parseProjects([
    `---\nid: a\nname: A\nserves: [agency]\n---\n\n## Declared outcome\n\nx\n`,
  ]);
  const open = parseProjects([
    `---\nid: b\nname: B\nserves: [agency]\npublic: true\n---\n\n## Declared outcome\n\nx\n`,
  ]);

  test("does not appear", async () => {
    // Zero public projects means GET_PORTFOLIO would answer "0 projects" to
    // every visitor. That advertises something they cannot have, so the tool is
    // absent — the same rule that governs an unconfigured module.
    const result = (await dispatchMcp(
      { ...env, projects: closed } as Env,
      "public",
      "tools/list",
    )) as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name)).not.toContain("GET_PORTFOLIO");
  });

  test("appears as soon as one project opts in", async () => {
    const result = (await dispatchMcp(
      { ...env, projects: open } as Env,
      "public",
      "tools/list",
    )) as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name)).toContain("GET_PORTFOLIO");
  });

  test("is always there for the owner", async () => {
    const result = (await dispatchMcp(
      { ...env, projects: closed } as Env,
      "private",
      "tools/list",
    )) as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name)).toContain("GET_PORTFOLIO");
  });
});
