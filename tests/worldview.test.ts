import { describe, expect, test } from "bun:test";
import type { Env } from "../src/worker/env.ts";
import { getDeclarationDashboard, setStrategicResultProgress } from "../src/worker/state.ts";
import { SCORE_IDS } from "../src/core/worldview.ts";
import declarationJson from "../worldview.json" with { type: "json" };
import { resolveWorldview } from "../src/core/worldview.ts";

const worldview = resolveWorldview({ declaration: declarationJson });


/**
 * The declared future is authoritative in git; D1 only holds measurement.
 * These check the two ways that seam can silently break: a result declared in
 * git with no D1 row must read as 0% rather than vanish, and progress must not
 * be recordable against an id nobody declared.
 */

type Row = Record<string, unknown>;

function env(strategicRows: Row[], scorecardRows: Row[]): Env {
  const captured: { sql: string; values: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        _values: [] as unknown[],
        bind(...values: unknown[]) {
          statement._values = values;
          return statement;
        },
        all: async () => ({
          results: sql.includes("strategic_results")
            ? strategicRows
            : scorecardRows,
        }),
        run: async () => {
          captured.push({ sql, values: statement._values });
          return { meta: { changes: 1 } };
        },
        first: async () => null,
      };
      return statement;
    },
    _captured: captured,
  };
  // The declaration arrives on env, the way an instance's config does — the
  // library never reads it from disk.
  return { DB: db, worldview, projects: [] } as unknown as Env;
}

describe("declaration: git structure joined with D1 measurement", () => {
  test("every result declared in git appears, in declared order", async () => {
    const dashboard = await getDeclarationDashboard(env([], []));
    expect(dashboard.strategic_results).toHaveLength(
      worldview.strategicResults.length,
    );
    const positions = dashboard.strategic_results.map((r) => r.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("a declared result with no D1 row reads as 0%, not missing", async () => {
    const dashboard = await getDeclarationDashboard(env([], []));
    for (const result of dashboard.strategic_results) {
      expect(result.progress_percent).toBe(0);
      expect(result.progress_note).toBe("");
    }
  });

  test("D1 progress is joined onto the git structure by id", async () => {
    const target = worldview.strategicResults[0]!;
    const dashboard = await getDeclarationDashboard(
      env(
        [
          {
            id: target.id,
            progress_percent: 35,
            progress_note: "evidence",
            updated_at: "2026-08-11",
          },
        ],
        [],
      ),
    );
    const joined = dashboard.strategic_results.find((r) => r.id === target.id);
    expect(joined?.progress_percent).toBe(35);
    expect(joined?.progress_note).toBe("evidence");
    // Structure still comes from git, not from the D1 row.
    expect(joined?.title).toBe(target.title);
  });

  test("there are exactly two scores", async () => {
    const dashboard = await getDeclarationDashboard(env([], []));
    expect(Object.keys(dashboard.scores).sort()).toEqual([...SCORE_IDS].sort());
  });

  test("integrity names all three domains, not just word", () => {
    expect(Object.keys(worldview.scores.integrity.domains).sort()).toEqual([
      "objects",
      "systems",
      "word",
    ]);
  });

  test("a reading lands on the metric that declared its id", async () => {
    const metric = worldview.strategicResults.flatMap((r) => r.metrics)[0]!;
    const dashboard = await getDeclarationDashboard(
      env([], [{ id: metric.id, current_value: 3, note: "", position: 1 }]),
    );
    const onCard = dashboard.scorecard.find((item) => item.id === metric.id);
    expect(onCard?.current).toBe(3);
    // Target stays git's word regardless of what the row happens to say.
    expect(onCard?.target).toBe(metric.target);
    // And it is no longer loose measurement — it has a home.
    expect(dashboard.diagnostics.map((d) => d.id)).not.toContain(metric.id);
  });

  test("an unmeasured metric is null, never zero", async () => {
    const dashboard = await getDeclarationDashboard(env([], []));
    expect(dashboard.scorecard.every((item) => item.current === null)).toBe(
      true,
    );
  });

  test("a reading nothing declares survives as a diagnostic", async () => {
    // Readings taken against an earlier declaration. Dropping them would delete
    // the only record that someone once measured this.
    const dashboard = await getDeclarationDashboard(
      env(
        [],
        [
          { id: "alignment", current_value: null, note: "", position: -2 },
          { id: "deployments", current_value: 1, note: "", position: 5 },
        ],
      ),
    );
    expect(dashboard.diagnostics.map((d) => d.id)).toEqual(["deployments"]);
  });
});

describe("progress cannot outrun the declaration", () => {
  test("recording progress against an undeclared id fails", async () => {
    await expect(
      setStrategicResultProgress(env([], []), "not-declared", 50),
    ).rejects.toThrow(/not declared in worldview.json/);
  });

  test("progress is clamped to 0-100", async () => {
    const id = worldview.strategicResults[0]!.id;
    const over = await setStrategicResultProgress(env([], []), id, 250);
    expect(over.progress_percent).toBe(100);
    const under = await setStrategicResultProgress(env([], []), id, -10);
    expect(under.progress_percent).toBe(0);
  });
});
