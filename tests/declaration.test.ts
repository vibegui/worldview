import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LOCALES } from "../src/core/localize.ts";
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

describe("project markdown", () => {
  test("reads every section, including the last one in the file", () => {
    // `## Success criteria` is last in these files, which is exactly the case a
    // regex terminator gets wrong: it returned nothing until the end-of-string
    // lookahead was correct, and nothing looks the same as "not written yet".
    for (const project of projects) {
      for (const locale of LOCALES) {
        expect(
          project.outcome[locale],
          `${project.id} has no declared outcome in ${locale}`,
        ).not.toBe("");
        expect(
          project.successCriteria[locale].length,
          `${project.id} has no success criteria in ${locale}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("ignores a file with no frontmatter instead of throwing", () => {
    expect(parseProjects(["# Just notes\n\nno frontmatter here"])).toEqual([]);
  });
});

describe("project prose", () => {
  test("a wrapped list item stays one criterion", () => {
    // Splitting on newlines turns one commitment into two, and the second half
    // reads as its own half-sentence promise.
    const [project] = parseProjects([
      `---\nid: x\n---\n\n## Success criteria\n\n1. One thing that wraps\n   onto a second line.\n2. Another.\n`,
    ]);
    expect(project?.successCriteria.en).toEqual([
      "One thing that wraps onto a second line.",
      "Another.",
    ]);
  });

  test("the outcome is the first paragraph, not the whole argument", () => {
    const [project] = parseProjects([
      `---\nid: x\n---\n\n## Declared outcome\n\nThe outcome.\n\nWhy it matters, at length.\n\n## Success criteria\n\n- a\n`,
    ]);
    expect(project?.outcome.en).toBe("The outcome.");
    expect(project?.outcomeDetail.en).toContain("Why it matters");
    // Only English was written, so Portuguese falls back to it rather than
    // rendering a project with no declared outcome at all.
    expect(project?.outcome["pt-BR"]).toBe("The outcome.");
  });
});
