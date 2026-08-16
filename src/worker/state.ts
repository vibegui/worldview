import {
  DEFAULT_LOCALE,
  t,
  tAll,
  type Locale,
  type LocalizedText,
} from "../core/localize.ts";
import type { Env } from "./env.ts";
import {
  SCORE_IDS,
  type ScoreId,
  strategicResultById,
} from "../core/worldview.ts";

type ProjectLifecycle = "draft" | "active" | "archived";
type GoalStatus = "active" | "paused" | "completed" | "cancelled";
type MemoryKind =
  | "fact"
  | "observation"
  | "preference"
  | "lesson"
  | "reflection";

/**
 * The writable half of a project. Everything else — name, outcome, success
 * criteria, `serves` — is declared in the instance's git and cannot be set here.
 */
export interface SetProjectStateInput {
  id: string;
  lifecycle?: ProjectLifecycle;
  next_review?: string | null;
  /** Deliberate order within the lifecycle group. Unset sorts last, by name. */
  position?: number | null;
}

export interface CreateGoalInput {
  project_id?: string | null;
  parent_goal_id?: string | null;
  title: string;
  desired_outcome: string;
  success_criteria?: string;
  horizon?: string | null;
  current_assessment?: string;
  next_review?: string | null;
}

export interface UpdateGoalInput {
  id: string;
  title?: string;
  desired_outcome?: string;
  success_criteria?: string;
  horizon?: string | null;
  status?: GoalStatus;
  current_assessment?: string;
  next_review?: string | null;
}

export interface RememberInput {
  project_id?: string | null;
  kind: MemoryKind;
  content: string;
  source: string;
  confidence?: number;
  expires_at?: string | null;
  supersedes_id?: string | null;
}

/**
 * Join the declared future (git) with the measurement (D1).
 *
 * Structure, targets, and acceptance criteria come from `worldview.json` so
 * that changing them is a commit. Progress and notes come from D1 because they
 * are evidence, not declaration. A result declared in git with no row in D1 yet
 * simply reads as 0% — no migration needed to add one.
 */
export async function getDeclarationDashboard(
  env: Env,
  locale: Locale = DEFAULT_LOCALE,
) {
  const [progressRows, scorecard, lifecycleRows] =
    await Promise.all([
      env.DB.prepare(
        "SELECT id, progress_percent, progress_note, updated_at FROM strategic_results",
      ).all<Record<string, unknown>>(),
      env.DB.prepare("SELECT * FROM scorecard_items ORDER BY position").all<
        Record<string, unknown>
      >(),
      env.DB.prepare("SELECT id, lifecycle FROM projects").all<{
        id: string;
        lifecycle: string;
      }>(),
    ]);

  // Alignment is derived, never asserted: the share of active projects that
  // serve at least one declared strategic result. `serves` comes from git and
  // `lifecycle` from D1, so the score is the join of intent and state — which is
  // the only thing it could honestly be.
  const lifecycleById = new Map(
    lifecycleRows.results.map((row) => [row.id, row.lifecycle]),
  );
  const activeProjects = env.projects.filter(
    (project) =>
      (lifecycleById.get(project.id) ?? project.initialLifecycle ?? "draft") ===
      "active",
  );
  const projectsByResult = new Map<string, number>();
  for (const project of activeProjects) {
    for (const result of project.serves) {
      projectsByResult.set(result, (projectsByResult.get(result) ?? 0) + 1);
    }
  }

  // The work pointed at each result, named rather than counted. A count says a
  // result is being pursued; the names say by what, which is the part worth
  // reading next to it.
  const workByResult = new Map<
    string,
    Array<{
      id: string;
      name: string;
      repo: string | null;
      lifecycle: string;
      primary: boolean;
    }>
  >();
  for (const project of env.projects) {
    const lifecycle = String(
      lifecycleById.get(project.id) ?? project.initialLifecycle ?? "draft",
    );
    if (lifecycle === "archived") continue;
    for (const result of project.serves) {
      workByResult.set(result, [
        ...(workByResult.get(result) ?? []),
        {
          id: project.id,
          name: project.name,
          repo: project.repo ?? null,
          lifecycle,
          // `serves` is ordered. A project whose *first* result is this one is
          // pointed at it; the rest contribute to it on the way somewhere else.
          // A result that everything contributes to and nothing is aimed at is
          // a result nobody is actually working on.
          primary: project.serves[0] === result,
        },
      ]);
    }
  }

  const progressById = new Map(
    progressRows.results.map((row) => [String(row.id), row]),
  );

  const active = activeProjects.length;
  const serving = activeProjects.filter(
    (project) => project.serves.length > 0,
  ).length;
  // No active projects is not zero alignment — it is nothing to measure. A share
  // of nothing is not a number, and inventing one would be inventing a number.
  const alignmentValue = active > 0 ? Math.round((serving / active) * 100) : null;
  const unaligned = active - serving;

  const strategicResults = env.worldview.strategicResults
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((result) => {
      const progress = progressById.get(result.id);
      return {
        id: result.id,
        position: result.position,
        stage: result.stage ?? null,
        score: result.score ?? null,
        commitment: result.commitment ?? null,
        title: t(result.title, locale),
        narrative: t(result.narrative, locale),
        acceptance_criteria: tAll(result.acceptanceCriteria, locale),
        metrics: result.metrics.map((metric) => ({
          ...metric,
          label: t(metric.label, locale),
          unit: t(metric.unit, locale),
        })),
        progress_percent: Number(progress?.progress_percent ?? 0),
        progress_note: String(progress?.progress_note ?? ""),
        updated_at: progress?.updated_at ?? null,
        // How much active work is actually pointed at this result. Zero here on
        // a result with progress is the interesting disagreement.
        active_project_count: projectsByResult.get(result.id) ?? 0,
        // Aimed-at first, then the ones contributing on their way elsewhere,
        // then drafts. Declaration order put the focused project sixth out of
        // seven, which buried the one fact the list exists to state.
        projects: (workByResult.get(result.id) ?? []).slice().sort((a, b) =>
          Number(b.primary) - Number(a.primary) ||
          Number(a.lifecycle === "draft") - Number(b.lifecycle === "draft") ||
          a.name.localeCompare(b.name),
        ),
      };
    });

  const scoreValueById = new Map(
    scorecard.results.map((row) => [String(row.id), row]),
  );

  // The scorecard is not a separate list of numbers — it is every declared
  // metric, read. Target and label come from git, the reading from D1, joined on
  // the metric id. A metric with no row is `current: null`, which the UI shows
  // as unmeasured; rendering it as 0 would claim a measurement nobody took.
  const scorecardMetrics = env.worldview.strategicResults
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((result) =>
      result.metrics.map((metric) => {
        const row = scoreValueById.get(metric.id);
        const current = row?.current_value ?? row?.boolean_value ?? null;
        return {
          ...metric,
          label: t(metric.label, locale),
          unit: t(metric.unit, locale),
          current: current === null ? null : Number(current),
          note: String(row?.note ?? ""),
          updated_at: row?.updated_at ?? null,
          result_id: result.id,
          result_title: t(result.title, locale),
          commitment: result.commitment ?? null,
        };
      }),
    );

  const measuredIds = new Set(scorecardMetrics.map((metric) => metric.id));

  return {
    strategic_results: strategicResults,
    scorecard: scorecardMetrics,
    scores: {
      alignment: {
        ...localizedScore(env.worldview.scores.alignment, locale),
        ...pickScoreValue(scoreValueById.get("alignment")),
        // Derived last, so it wins over anything previously typed into the
        // scorecard row. The note explains the fraction rather than asserting it.
        current_value: alignmentValue,
        note: alignmentNote(locale, active, serving, unaligned),
      },
      integrity: {
        ...localizedScore(env.worldview.scores.integrity, locale),
        domains: Object.fromEntries(
          Object.entries(env.worldview.scores.integrity.domains).map(
            ([name, text]) => [name, t(text, locale)],
          ),
        ),
        ...pickScoreValue(scoreValueById.get("integrity")),
      },
    },
    // Rows that no declared metric claims. They are readings taken against an
    // earlier declaration, so they are not on the scorecard any more — and they
    // are not deleted either, because a measurement someone actually took is
    // evidence, and this is the only place it still exists.
    diagnostics: scorecard.results.filter(
      (row) =>
        !SCORE_IDS.includes(String(row.id) as ScoreId) &&
        !measuredIds.has(String(row.id)),
    ),
  };
}

/** The one sentence the worker writes rather than reads, so it is translated here. */
function alignmentNote(
  locale: Locale,
  active: number,
  serving: number,
  unaligned: number,
): string {
  if (active === 0) {
    return locale === "en"
      ? "No active projects to measure"
      : "Nenhum projeto ativo para medir";
  }
  if (locale === "en") {
    return (
      `${serving} of ${active} active projects serve a declared result` +
      (unaligned > 0
        ? `; ${unaligned} ${unaligned === 1 ? "serves" : "serve"} nothing declared`
        : "")
    );
  }
  return (
    `${serving} de ${active} projetos ativos servem um resultado declarado` +
    (unaligned > 0
      ? `; ${unaligned} não ${unaligned === 1 ? "serve" : "servem"} nada declarado`
      : "")
  );
}

function localizedScore<T extends Record<string, unknown>>(
  score: T,
  locale: Locale,
) {
  return {
    ...score,
    label: t(score.label as LocalizedText, locale),
    question: t(score.question as LocalizedText, locale),
    measure: t(score.measure as LocalizedText, locale),
  };
}

function pickScoreValue(row: Record<string, unknown> | undefined) {
  if (!row) return { current_value: null, note: "", updated_at: null };
  return {
    current_value: row.current_value ?? null,
    note: String(row.note ?? ""),
    updated_at: row.updated_at ?? null,
  };
}

export async function setStrategicResultProgress(
  env: Env,
  id: string,
  progressPercent: number,
  progressNote = "",
) {
  const declared = strategicResultById(env.worldview, id);
  if (!declared) {
    throw new Error(
      `Strategic result not declared in worldview.json: ${id}. ` +
        `Declare it in git before recording progress against it.`,
    );
  }
  const progress = Math.min(100, Math.max(0, Math.round(progressPercent)));
  await env.DB.prepare(
    `INSERT INTO strategic_results (id, position, title, narrative, progress_percent, progress_note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       progress_percent = excluded.progress_percent,
       progress_note = excluded.progress_note,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      declared.position,
      declared.title,
      declared.narrative,
      progress,
      progressNote.trim(),
    )
    .run();

  return {
    ...declared,
    progress_percent: progress,
    progress_note: progressNote.trim(),
  };
}

export async function updateScorecardItem(
  env: Env,
  input: {
    id: string;
    current_value?: number | null;
    boolean_value?: boolean | null;
    note?: string;
  },
) {
  const existing = await env.DB.prepare(
    "SELECT * FROM scorecard_items WHERE id = ?",
  )
    .bind(input.id)
    .first<Record<string, unknown>>();
  if (!existing) throw new Error(`Scorecard item not found: ${input.id}`);

  await env.DB.prepare(
    `UPDATE scorecard_items
     SET current_value = ?, boolean_value = ?, note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(
      input.current_value === undefined
        ? existing.current_value
        : input.current_value,
      input.boolean_value === undefined
        ? existing.boolean_value
        : input.boolean_value === null
          ? null
          : input.boolean_value
            ? 1
            : 0,
      input.note === undefined ? existing.note : input.note.trim(),
      input.id,
    )
    .run();
  return env.DB.prepare("SELECT * FROM scorecard_items WHERE id = ?")
    .bind(input.id)
    .first();
}

/**
 * The portfolio: structure from git, state from D1, joined by id.
 *
 * Same seam as the declaration, one level down. A project declared in git with
 * no D1 row reads as its initial lifecycle at 0% and needs no migration; a D1
 * row for a project nobody declared is dropped, because state about a project
 * that does not exist is not information.
 */
export async function getPortfolio(
  env: Env,
  publicOnly = false,
  locale: Locale = DEFAULT_LOCALE,
) {
  const stateRows = await env.DB.prepare(
    `SELECT
      p.*,
      (SELECT COUNT(*) FROM goals g WHERE g.project_id = p.id AND g.status = 'active') AS active_goal_count,
      (SELECT MAX(a.occurred_at) FROM activity_events a WHERE a.project_id = p.id) AS last_activity_at,
      (SELECT COUNT(*) FROM captures c WHERE c.project_id = p.id AND c.status = 'inbox') AS inbox_count,
      (SELECT COUNT(*) FROM work_items w WHERE w.project_id = p.id AND w.state = 'open') AS open_work_item_count
    FROM projects p`,
  ).all<Record<string, unknown>>();

  const stateById = new Map(
    stateRows.results.map((row) => [String(row.id), row]),
  );
  const rank: Record<string, number> = { active: 0, draft: 1, archived: 3 };
  // Which commitment a project sits under: the one its *primary* result serves.
  // `serves` is ordered, primary first, and a project that genuinely spans two
  // commitments still has to be filed somewhere — filing it by the result its
  // author put first is the only ordering the declaration actually states.
  const commitmentOf = new Map(
    env.worldview.strategicResults.map((result) => [
      result.id,
      result.commitment ?? null,
    ]),
  );

  const visible = publicOnly
    ? env.projects.filter((project) => project.isPublic)
    : env.projects;

  const projects = visible
    .map((declared) => {
      const state = stateById.get(declared.id);
      const lifecycle = String(
        state?.lifecycle ?? declared.initialLifecycle ?? "draft",
      );
      return {
        id: declared.id,
        name: declared.name,
        repository: declared.repo ?? null,
        spirit: declared.spirit[locale],
        current_outcome: declared.outcome[locale],
        success_criteria: declared.successCriteria[locale],
        // Many-to-many: real work serves more than one result, and forcing a
        // single choice would make alignment lie by omission.
        serves: declared.serves,
        commitment: commitmentOf.get(declared.serves[0] ?? "") ?? null,
        lifecycle,
        position: state?.position ?? null,
        next_review: state?.next_review ?? declared.initialNextReview ?? null,
        progress_percent: state?.progress_percent ?? null,
        progress_note: String(state?.progress_note ?? ""),
        // Goal, inbox, and work-item counts are operational: they describe how
        // the work is being run, not what was declared or how far it got.
        ...(publicOnly
          ? {}
          : {
              active_goal_count: Number(state?.active_goal_count ?? 0),
              inbox_count: Number(state?.inbox_count ?? 0),
              open_work_item_count: Number(state?.open_work_item_count ?? 0),
              last_activity_at: state?.last_activity_at ?? null,
            }),
        updated_at: state?.updated_at ?? null,
      };
    })
    .sort(
      (a, b) =>
        (rank[a.lifecycle] ?? 2) - (rank[b.lifecycle] ?? 2) ||
        // Deliberate order first; anything unplaced falls to the end of its
        // lifecycle group and stays alphabetical.
        (a.position === null ? 1 : 0) - (b.position === null ? 1 : 0) ||
        Number(a.position ?? 0) - Number(b.position ?? 0) ||
        a.name.localeCompare(b.name),
    );

  const [dailyBrief, unfiled] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM daily_briefs ORDER BY brief_date DESC LIMIT 1",
    ).first(),
    // Captures filed under no project. Everything else is reachable through the
    // project it belongs to; these would be invisible without a home.
    env.DB.prepare(
      `SELECT * FROM captures
       WHERE project_id IS NULL AND status = 'inbox'
       ORDER BY created_at DESC`,
    ).all(),
  ]);

  return {
    daily_brief: dailyBrief,
    projects,
    unfiled: unfiled.results,
  };
}

/**
 * Set the state of a project the instance already declared in git.
 *
 * This replaced SAVE_PROJECT, which could bring a project into existence from a
 * conversation. It no longer can: what a project *is* — its name, the outcome it
 * declares, what would count as success, and which results it serves — is intent,
 * and changing intent is a commit in the instance's repo. What this writes is
 * only what you flip week to week.
 *
 * An id nobody declared is rejected for the same reason an undeclared strategic
 * result is: state about something that does not exist is not information.
 */
export async function setProjectState(env: Env, input: SetProjectStateInput) {
  const declared = env.projects.find((project) => project.id === input.id);
  if (!declared) {
    throw new Error(
      `Project not declared in git: ${input.id}. ` +
        `Add projects/${input.id}.md to the instance repository first. ` +
        `Declared: ${env.projects.map((p) => p.id).join(", ") || "none"}`,
    );
  }

  await env.DB.prepare(
    `INSERT INTO projects (id, name, lifecycle, next_review, position)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       lifecycle = COALESCE(excluded.lifecycle, projects.lifecycle),
       next_review = CASE WHEN ? THEN excluded.next_review ELSE projects.next_review END,
       position = COALESCE(excluded.position, projects.position),
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      declared.id,
      // The name column is legacy and no longer read; git owns it. It is written
      // only because the column is NOT NULL.
      declared.name,
      input.lifecycle ?? declared.initialLifecycle ?? "draft",
      input.next_review ?? declared.initialNextReview ?? null,
      input.position ?? null,
      input.next_review === undefined ? 0 : 1,
    )
    .run();

  return getProject(env, declared.id);
}

export async function setProjectProgress(
  env: Env,
  id: string,
  progressPercent: number,
  progressNote = "",
) {
  // Declared in git is what makes a project real; a D1 row is just the first
  // measurement of it. So this upserts rather than requiring a row to exist —
  // otherwise the first progress note on a freshly declared project would fail.
  const declared = env.projects.find((project) => project.id === id);
  if (!declared) {
    throw new Error(
      `Project not declared in git: ${id}. ` +
        `Add projects/${id}.md to the instance repository first.`,
    );
  }
  const boundedProgress = Math.min(
    100,
    Math.max(0, Math.round(progressPercent)),
  );
  await env.DB.prepare(
    `INSERT INTO projects (id, name, lifecycle, progress_percent, progress_note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       progress_percent = excluded.progress_percent,
       progress_note = excluded.progress_note,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      declared.name,
      declared.initialLifecycle ?? "draft",
      boundedProgress,
      progressNote.trim(),
    )
    .run();
  return getProject(env, id);
}

export async function getProject(
  env: Env,
  id: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const declared = env.projects.find((project) => project.id === id);
  if (!declared) throw new Error(`Project not declared in git: ${id}`);

  const state = await env.DB.prepare("SELECT * FROM projects WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();

  // Structure from git, state from D1. A project with no row yet is not
  // missing — it is declared and unmeasured, which is the correct starting point.
  const project = {
    id: declared.id,
    name: declared.name,
    repository: declared.repo ?? null,
    spirit: declared.spirit[locale],
    current_outcome: declared.outcome[locale],
    success_criteria: declared.successCriteria[locale],
    serves: declared.serves,
    body: declared.body,
    lifecycle: state?.lifecycle ?? declared.initialLifecycle ?? "draft",
    position: state?.position ?? null,
    next_review: state?.next_review ?? declared.initialNextReview ?? null,
    progress_percent: state?.progress_percent ?? null,
    progress_note: String(state?.progress_note ?? ""),
    updated_at: state?.updated_at ?? null,
  };

  const [goals, memories, decisions, captures, activity, workItems] =
    await Promise.all([
      env.DB.prepare(
        `SELECT * FROM goals
       WHERE project_id = ?
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                COALESCE(next_review, '9999-12-31'), created_at DESC`,
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        `SELECT * FROM memories
       WHERE project_id = ? AND status = 'active'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY created_at DESC LIMIT 50`,
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        "SELECT * FROM decisions WHERE project_id = ? ORDER BY decided_at DESC LIMIT 50",
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        "SELECT * FROM captures WHERE project_id = ? AND status = 'inbox' ORDER BY created_at DESC",
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        "SELECT * FROM activity_events WHERE project_id = ? ORDER BY occurred_at DESC LIMIT 50",
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        `SELECT * FROM work_items
       WHERE project_id = ? AND state = 'open'
       ORDER BY updated_at DESC LIMIT 100`,
      )
        .bind(id)
        .all(),
    ]);

  return {
    project,
    goals: goals.results,
    memories: memories.results,
    decisions: decisions.results,
    captures: captures.results,
    activity: activity.results,
    work_items: workItems.results,
  };
}

export async function getAttentionMap(env: Env, days = 30) {
  const safeDays = Math.min(365, Math.max(1, days));
  const modifier = `-${safeDays} days`;
  const events = await env.DB.prepare(
    `SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.lifecycle,
      a.source,
      a.kind,
      COUNT(*) AS event_count,
      MAX(a.occurred_at) AS last_activity_at
    FROM activity_events a
    JOIN projects p ON p.id = a.project_id
    WHERE a.occurred_at >= datetime('now', ?)
    GROUP BY p.id, p.name, p.lifecycle, a.source, a.kind
    ORDER BY event_count DESC, last_activity_at DESC`,
  )
    .bind(modifier)
    .all();

  return {
    days: safeDays,
    disclaimer:
      "Activity events are evidence of attention, not a measurement of hours or effort.",
    events: events.results,
  };
}

export async function getStaleProjects(env: Env, days = 14) {
  const safeDays = Math.min(365, Math.max(1, days));
  const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;

  // Built from the portfolio rather than its own query, so a project declared in
  // git that has never been touched still counts as stale. Querying D1 alone
  // would silently exclude exactly the projects most worth surfacing: the ones
  // with no activity at all.
  const { projects } = await getPortfolio(env);
  const stale = projects
    .filter((project) => project.lifecycle === "active")
    .map((project) => ({
      ...project,
      seen: project.last_activity_at ?? project.updated_at ?? null,
    }))
    .filter(({ seen }) => !seen || Date.parse(`${seen}Z`) < cutoff)
    .sort((a, b) => String(a.seen ?? "").localeCompare(String(b.seen ?? "")));

  return { days: safeDays, projects: stale };
}

export async function listGoals(
  env: Env,
  projectId?: string,
  status: GoalStatus | "all" = "active",
) {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (projectId) {
    clauses.push("g.project_id = ?");
    bindings.push(projectId);
  }
  if (status !== "all") {
    clauses.push("g.status = ?");
    bindings.push(status);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `SELECT g.*, p.name AS project_name
     FROM goals g
     LEFT JOIN projects p ON p.id = g.project_id
     ${where}
     ORDER BY COALESCE(g.next_review, '9999-12-31'), g.created_at DESC`,
  )
    .bind(...bindings)
    .all();
  return { goals: result.results };
}

export async function createGoal(env: Env, input: CreateGoalInput) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO goals (
      id, project_id, parent_goal_id, title, desired_outcome, success_criteria,
      horizon, current_assessment, next_review
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.project_id ?? null,
      input.parent_goal_id ?? null,
      input.title.trim(),
      input.desired_outcome.trim(),
      input.success_criteria?.trim() ?? "",
      input.horizon ?? null,
      input.current_assessment?.trim() ?? "",
      input.next_review ?? null,
    )
    .run();
  return env.DB.prepare("SELECT * FROM goals WHERE id = ?").bind(id).first();
}

export async function updateGoal(env: Env, input: UpdateGoalInput) {
  const existing = await env.DB.prepare("SELECT * FROM goals WHERE id = ?")
    .bind(input.id)
    .first<Record<string, unknown>>();
  if (!existing) throw new Error(`Goal not found: ${input.id}`);

  const nextStatus = input.status ?? (existing.status as GoalStatus);
  await env.DB.prepare(
    `UPDATE goals SET
      title = ?,
      desired_outcome = ?,
      success_criteria = ?,
      horizon = ?,
      status = ?,
      current_assessment = ?,
      next_review = ?,
      completed_at = CASE
        WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
  )
    .bind(
      input.title ?? existing.title,
      input.desired_outcome ?? existing.desired_outcome,
      input.success_criteria ?? existing.success_criteria,
      input.horizon === undefined ? existing.horizon : input.horizon,
      nextStatus,
      input.current_assessment ?? existing.current_assessment,
      input.next_review === undefined
        ? existing.next_review
        : input.next_review,
      nextStatus,
      input.id,
    )
    .run();

  return env.DB.prepare("SELECT * FROM goals WHERE id = ?")
    .bind(input.id)
    .first();
}

export async function recallMemory(env: Env, projectId?: string, limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, limit));
  const scopeClause = projectId
    ? "(project_id IS NULL OR project_id = ?)"
    : "project_id IS NULL";
  const statement = env.DB.prepare(
    `SELECT * FROM memories
     WHERE ${scopeClause}
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY project_id IS NULL DESC, created_at DESC
     LIMIT ?`,
  );
  const result = projectId
    ? await statement.bind(projectId, safeLimit).all()
    : await statement.bind(safeLimit).all();
  return { memories: result.results };
}

export async function remember(env: Env, input: RememberInput) {
  const id = crypto.randomUUID();
  const confidence = Math.min(1, Math.max(0, input.confidence ?? 1));
  const statements: D1PreparedStatement[] = [];
  if (input.supersedes_id) {
    statements.push(
      env.DB.prepare(
        `UPDATE memories
         SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(input.supersedes_id),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO memories (
        id, project_id, kind, content, source, confidence, supersedes_id, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      input.project_id ?? null,
      input.kind,
      input.content.trim(),
      input.source.trim(),
      confidence,
      input.supersedes_id ?? null,
      input.expires_at ?? null,
    ),
  );
  await env.DB.batch(statements);
  return env.DB.prepare("SELECT * FROM memories WHERE id = ?").bind(id).first();
}

export async function forgetMemory(env: Env, id: string) {
  const result = await env.DB.prepare(
    `UPDATE memories
     SET status = 'forgotten', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(id)
    .run();
  if (!result.meta.changes) throw new Error(`Memory not found: ${id}`);
  return { id, status: "forgotten" };
}

export async function listDecisions(env: Env, projectId?: string) {
  const result = projectId
    ? await env.DB.prepare(
        "SELECT * FROM decisions WHERE project_id = ? ORDER BY decided_at DESC",
      )
        .bind(projectId)
        .all()
    : await env.DB.prepare(
        "SELECT * FROM decisions ORDER BY decided_at DESC LIMIT 200",
      ).all();
  return { decisions: result.results };
}

export async function recordDecision(
  env: Env,
  input: {
    project_id?: string | null;
    title: string;
    decision: string;
    rationale?: string;
    source?: string;
  },
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO decisions (
      id, project_id, title, decision, rationale, source
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.project_id ?? null,
      input.title.trim(),
      input.decision.trim(),
      input.rationale?.trim() ?? "",
      input.source?.trim() ?? "studio",
    )
    .run();
  return env.DB.prepare("SELECT * FROM decisions WHERE id = ?")
    .bind(id)
    .first();
}

export async function capture(
  env: Env,
  input: {
    project_id?: string | null;
    kind?: string;
    content: string;
    source?: string;
  },
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO captures (id, project_id, kind, content, source)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.project_id ?? null,
      input.kind ?? "idea",
      input.content.trim(),
      input.source?.trim() ?? "studio",
    )
    .run();
  return env.DB.prepare("SELECT * FROM captures WHERE id = ?").bind(id).first();
}

export async function getInbox(env: Env, limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, limit));
  const result = await env.DB.prepare(
    `SELECT c.*, p.name AS project_name
     FROM captures c
     LEFT JOIN projects p ON p.id = c.project_id
     WHERE c.status = 'inbox'
     ORDER BY c.created_at DESC
     LIMIT ?`,
  )
    .bind(safeLimit)
    .all();
  return { captures: result.results };
}

export async function getDailyBriefInput(env: Env, date = today()) {
  const [portfolio, goals, stale, inbox, previousBrief, decisions, activity] =
    await Promise.all([
      getPortfolio(env),
      listGoals(env, undefined, "active"),
      getStaleProjects(env, 14),
      getInbox(env, 50),
      env.DB.prepare(
        "SELECT * FROM daily_briefs WHERE brief_date < ? ORDER BY brief_date DESC LIMIT 1",
      )
        .bind(date)
        .first(),
      env.DB.prepare(
        "SELECT * FROM decisions WHERE decided_at >= datetime('now', '-7 days') ORDER BY decided_at DESC",
      ).all(),
      getAttentionMap(env, 7),
    ]);

  return {
    brief_date: date,
    generated_at: new Date().toISOString(),
    instructions: [
      "State what changed since the previous brief.",
      "Identify which goals moved and which are stale or blocked.",
      "Compare observed activity with active project goals without calling activity hours.",
      "Surface pending decisions.",
      "Recommend the smallest high-leverage next steps.",
    ],
    portfolio,
    goals: goals.goals,
    stale_projects: stale.projects,
    inbox: inbox.captures,
    recent_decisions: decisions.results,
    attention: activity,
    previous_brief: previousBrief,
  };
}

export async function saveDailyBrief(
  env: Env,
  input: { brief_date?: string; content: string; source_snapshot?: unknown },
) {
  const briefDate = input.brief_date ?? today();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO daily_briefs (id, brief_date, content, source_snapshot)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(brief_date) DO UPDATE SET
       content = excluded.content,
       source_snapshot = excluded.source_snapshot,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      briefDate,
      input.content.trim(),
      JSON.stringify(input.source_snapshot ?? {}),
    )
    .run();
  return env.DB.prepare("SELECT * FROM daily_briefs WHERE brief_date = ?")
    .bind(briefDate)
    .first();
}

export async function getDailyBrief(env: Env, date?: string) {
  const brief = date
    ? await env.DB.prepare("SELECT * FROM daily_briefs WHERE brief_date = ?")
        .bind(date)
        .first()
    : await env.DB.prepare(
        "SELECT * FROM daily_briefs ORDER BY brief_date DESC LIMIT 1",
      ).first();
  return { brief };
}

export async function getStatus(env: Env) {
  const tables = [
    "projects",
    "goals",
    "memories",
    "decisions",
    "captures",
    "activity_events",
    "work_items",
    "daily_briefs",
  ] as const;
  const results = await env.DB.batch(
    tables.map((table) =>
      env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`),
    ),
  );
  return {
    ok: true,
    service: "vibegui-personal-ai-os",
    private_state: Object.fromEntries(
      tables.map((table, index) => [
        table,
        Number(
          (
            results[index]?.results[0] as
              | { count?: number | string }
              | undefined
          )?.count ?? 0,
        ),
      ]),
    ),
    generated_at: new Date().toISOString(),
  };
}

export async function markBriefDue(env: Env) {
  await env.DB.prepare(
    `INSERT INTO sync_state (source, last_attempt_at, last_success_at)
     VALUES ('daily-brief-due', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(source) DO UPDATE SET
       cursor = ?,
       last_attempt_at = CURRENT_TIMESTAMP,
       last_success_at = CURRENT_TIMESTAMP,
       last_error = NULL`,
  )
    .bind(today())
    .run();
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
