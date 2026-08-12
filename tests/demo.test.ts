import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { worldviewErrors } from "../src/core/worldview.ts";
import { parseProjects, projectErrors } from "../src/core/projects.ts";
import declarationJson from "../worldview.json" with { type: "json" };
import { resolveWorldview } from "../src/core/worldview.ts";

const worldview = resolveWorldview({ declaration: declarationJson });

const projects = parseProjects(
  readdirSync(join(import.meta.dir, "..", "projects"))
    .filter((file) => file.endsWith(".md"))
    .map((file) =>
      readFileSync(join(import.meta.dir, "..", "projects", file), "utf8"),
    ),
);


const root = join(import.meta.dir, "..");

function seededDatabase(applySeedTimes = 1): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(join(root, "migrations")).sort()) {
    db.run(readFileSync(join(root, "migrations", file), "utf8"));
  }
  const seed = readFileSync(join(root, "seeds", "demo.sql"), "utf8");
  for (let index = 0; index < applySeedTimes; index += 1) db.run(seed);
  return db;
}

function count(db: Database, sql: string): number {
  return (db.query(sql).get() as { n: number }).n;
}

describe("the declaration", () => {
  test("is valid", () => {
    expect(worldviewErrors({ declaration: declarationJson })).toEqual([]);
  });
});

describe("migrations alone", () => {
  test("seed no declaration of their own", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    for (const file of readdirSync(join(root, "migrations")).sort()) {
      db.run(readFileSync(join(root, "migrations", file), "utf8"));
    }

    // A fresh database must not inherit anybody's progress. The only rows the
    // schema is allowed to create are the two scores, which are structural.
    expect(count(db, "SELECT COUNT(*) n FROM strategic_results")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM projects")).toBe(0);
    expect(
      db
        .query("SELECT id FROM scorecard_items ORDER BY id")
        .all()
        .map((row) => (row as { id: string }).id),
    ).toEqual(["alignment", "integrity"]);
  });
});

describe("the demo seed", () => {
  const db = seededDatabase();

  test("measures exactly what the declaration declares", () => {
    const seeded = db
      .query("SELECT id FROM strategic_results ORDER BY id")
      .all()
      .map((row) => (row as { id: string }).id);
    const declared = worldview.strategicResults.map((r: { id: string }) => r.id).sort();

    // Both directions on purpose: a rename in either file breaks one of these,
    // and SET_STRATEGIC_RESULT_PROGRESS rejects an id that is not declared.
    expect(seeded).toEqual(declared);
  });

  test("points every declared project at a result declared in git", () => {
    // Nothing in SQLite can enforce this: `serves` lives in the instance's
    // markdown and the results live in worldview.json. Two git files that must
    // agree, with no foreign key between them, is exactly what a test is for.
    const declared = new Set(worldview.strategicResults.map((r: { id: string }) => r.id));
    expect(projects.length).toBeGreaterThan(0);
    expect(projectErrors(projects, [...declared])).toEqual([]);
  });

  test("every project row in D1 belongs to a project declared in git", () => {
    // State about a project that does not exist is not information.
    const ids = new Set(projects.map((p) => p.id));
    const rows = db
      .query("SELECT id FROM projects")
      .all()
      .map((row) => (row as { id: string }).id);
    expect(rows.length).toBeGreaterThan(0);
    for (const id of rows) {
      expect(ids.has(id), `D1 has state for undeclared project ${id}`).toBe(true);
    }
  });

  test("leaves one active project serving nothing, so alignment can speak", () => {
    const lifecycles = new Map(
      db
        .query("SELECT id, lifecycle FROM projects")
        .all()
        .map((row) => {
          const r = row as { id: string; lifecycle: string };
          return [r.id, r.lifecycle] as const;
        }),
    );
    const active = projects.filter(
      (p) => (lifecycles.get(p.id) ?? p.initialLifecycle) === "active",
    );
    const serving = active.filter((p) => p.serves.length > 0);

    expect(active.length).toBeGreaterThan(0);
    // A demo where every project is aligned demonstrates a score that never
    // says anything.
    expect(serving.length).toBeLessThan(active.length);
  });

  test("declares at least one many-to-many project", () => {
    // A single TEXT column could not express this, which is why `serves` moved
    // to git rather than staying a column.
    expect(projects.some((p) => p.serves.length > 1)).toBe(true);
  });

  test("keeps integrity a count to zero, never a percentage", () => {
    const integrity = db
      .query("SELECT unit, target_value, current_value FROM scorecard_items WHERE id = 'integrity'")
      .get() as { unit: string; target_value: number; current_value: number };

    expect(integrity.target_value).toBe(0);
    expect(integrity.unit).not.toBe("%");
    expect(integrity.current_value).toBeGreaterThan(0);
  });

  test("leaves the two scores as the only non-diagnostic items", () => {
    const nonDemo = db
      .query("SELECT id FROM scorecard_items WHERE id NOT LIKE 'demo-%' ORDER BY id")
      .all()
      .map((row) => (row as { id: string }).id);
    expect(nonDemo).toEqual(["alignment", "integrity"]);
    expect(count(db, "SELECT COUNT(*) n FROM scorecard_items WHERE id LIKE 'demo-%'"))
      .toBeGreaterThan(0);
  });

  test("gives every view something to render", () => {
    const populated: Array<[string, string]> = [
      ["projects", "SELECT COUNT(*) n FROM projects WHERE lifecycle = 'active'"],
      ["goals", "SELECT COUNT(*) n FROM goals WHERE status = 'active'"],
      // RECALL_MEMORY with no project filters on project_id IS NULL.
      ["global memories", "SELECT COUNT(*) n FROM memories WHERE project_id IS NULL"],
      ["decisions", "SELECT COUNT(*) n FROM decisions"],
      ["inbox", "SELECT COUNT(*) n FROM captures WHERE status = 'inbox'"],
      ["activity", "SELECT COUNT(*) n FROM activity_events"],
      ["open work items", "SELECT COUNT(*) n FROM work_items WHERE state = 'open'"],
      ["today's brief", "SELECT COUNT(*) n FROM daily_briefs WHERE brief_date = date('now')"],
      ["bookmarks", "SELECT COUNT(*) n FROM bookmarks"],
      ["pageviews", "SELECT COUNT(*) n FROM events WHERE name = 'pageview'"],
      ["blocked events", "SELECT COUNT(*) n FROM events WHERE name = 'blocked'"],
    ];
    for (const [label, sql] of populated) {
      expect(count(db, sql), `${label} is empty`).toBeGreaterThan(0);
    }
  });

  test("surfaces a stale project and a slipped commitment", () => {
    // The demo is only useful if the gap it shows is a gap worth looking at.
    expect(
      count(
        db,
        "SELECT COUNT(*) n FROM projects WHERE lifecycle = 'active' AND updated_at < datetime('now', '-30 days')",
      ),
    ).toBeGreaterThan(0);
    expect(
      count(db, "SELECT COUNT(*) n FROM goals WHERE next_review < date('now')"),
    ).toBeGreaterThan(0);
  });

  test("indexes bookmarks into the full-text table", () => {
    // Proves the FTS5 external-content triggers actually fired on insert.
    expect(count(db, "SELECT COUNT(*) n FROM bookmarks_fts WHERE bookmarks_fts MATCH 'migrations'"))
      .toBeGreaterThan(0);
  });

  test("spreads analytics across sites and days", () => {
    expect(count(db, "SELECT COUNT(DISTINCT site) n FROM events")).toBeGreaterThan(1);
    expect(
      count(db, "SELECT COUNT(DISTINCT date(ts / 1000, 'unixepoch')) n FROM events"),
    ).toBeGreaterThan(20);
  });

  test("is idempotent", () => {
    // Re-running must replace the demo rows rather than duplicate them, and must
    // not trip the decisions table's immutability triggers.
    const once = seededDatabase(1);
    const twice = seededDatabase(2);
    const tables = [
      "projects",
      "goals",
      "memories",
      "decisions",
      "captures",
      "activity_events",
      "work_items",
      "daily_briefs",
      "strategic_results",
      "scorecard_items",
      "bookmarks",
      "bookmark_tags",
      "events",
    ];
    for (const table of tables) {
      expect(
        count(twice, `SELECT COUNT(*) n FROM ${table}`),
        `${table} duplicated on a second seed`,
      ).toBe(count(once, `SELECT COUNT(*) n FROM ${table}`));
    }
  });
});

describe("project markdown", () => {
  test("reads every section, including the last one in the file", () => {
    // `## Success criteria` is last in these files, which is exactly the case a
    // regex terminator gets wrong: it returned nothing until the end-of-string
    // lookahead was correct, and nothing looks the same as "not written yet".
    for (const project of projects) {
      expect(project.outcome, `${project.id} has no declared outcome`).not.toBe(
        "",
      );
      expect(
        project.successCriteria.length,
        `${project.id} has no success criteria`,
      ).toBeGreaterThan(0);
    }
  });

  test("ignores a file with no frontmatter instead of throwing", () => {
    expect(parseProjects(["# Just notes\n\nno frontmatter here"])).toEqual([]);
  });
});
