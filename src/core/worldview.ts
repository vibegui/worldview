import { LOCALES, missingLocales, t, type LocalizedText } from "./localize.ts";
/**
 * The declared future lives in git, not D1 — and in the *instance's* git, not
 * this library's.
 *
 * What should be is deliberate, reviewable, and forkable, so changing it is a
 * commit. What is — progress, notes, measurements — stays in D1 because it
 * changes constantly and is derived from evidence. The gap between the two is
 * the only interesting query in the system.
 *
 * Nothing here reads a file. An instance passes its declaration to
 * `createWorldview()` as a value, which is what lets one library serve many
 * worldviews.
 */

export interface WorldviewMetric {
  /**
   * Join key into D1's `scorecard_items`, which is where the *current* reading
   * lives. The target is declared here, because changing what counts as success
   * should be a commit; the reading is evidence and belongs in the database.
   * An id with no row yet reads as unmeasured — which is not the same as zero.
   */
  id: string;
  label: LocalizedText;
  target: number;
  unit: LocalizedText;
}

export interface WorldviewStrategicResult {
  id: string;
  position: number;
  title: LocalizedText;
  narrative: LocalizedText;
  acceptanceCriteria: LocalizedText[];
  metrics: WorldviewMetric[];
  /** Which stage of the loop this result belongs to, if it is production work. */
  stage?: "ideas" | "expansion" | "execution" | "content" | "distribution";
  /** Which score this result belongs to, if it is a condition rather than a stage. */
  score?: "alignment" | "integrity";
}

/** The parsed contents of an instance's `worldview.json`. Structure only. */
export interface WorldviewDeclaration {
  version: number;
  /**
   * Machine slug. It becomes the `ui://<instance>/…` resource namespace, the MCP
   * server name, and the service name in GET_STATUS. Resource URIs are pinned by
   * live host connections, so changing this on an existing deployment breaks
   * saved views.
   */
  instance: string;
  /** Display name: the app header, resource names, and the model instructions. */
  name: string;
  /**
   * Optional fallback prose. Instances are expected to pass `declaredFuture` to
   * `createWorldview()` as markdown instead — five paragraphs inside an escaped
   * JSON string is the worst part of editing a declaration, and the declared
   * future is the field its author touches most.
   */
  declaredFuture?: LocalizedText;
  scores: {
    alignment: {
      label: LocalizedText;
      question: LocalizedText;
      measure: LocalizedText;
      kind: string;
    };
    integrity: {
      label: LocalizedText;
      question: LocalizedText;
      measure: LocalizedText;
      kind: string;
      domains: {
        word: LocalizedText;
        systems: LocalizedText;
        objects: LocalizedText;
      };
    };
  };
  /**
   * The three a reader should be able to repeat back. Distinct from integrity's
   * `word` domain, which is the full ledger — these are the headline.
   */
  commitments?: LocalizedText[];
  conditionsOfSatisfaction: LocalizedText[];
  strategicResults: WorldviewStrategicResult[];
}

/**
 * A declaration with its prose resolved — what the rest of the worker reads.
 * `declaredFuture` is always a string here, whichever source it came from.
 */
export interface Worldview extends WorldviewDeclaration {
  declaredFuture: LocalizedText;
}

export interface WorldviewInput {
  declaration: unknown;
  /** Markdown prose. Falls back to `declaration.declaredFuture` when omitted. */
  declaredFuture?: LocalizedText;
}

/** Merge the two halves an instance provides into the shape everything reads. */
export function resolveWorldview(input: WorldviewInput): Worldview {
  const declaration = input.declaration as WorldviewDeclaration;
  return {
    ...declaration,
    declaredFuture: input.declaredFuture ?? declaration?.declaredFuture ?? "",
  };
}

/**
 * Everything wrong with a declaration, as messages. Empty array means valid.
 *
 * Deliberately not thrown at module load. `createWorldview()` runs at module
 * scope in a Worker, so a throw there would turn one typo into a 500 on every
 * route — including the public tier that is meant to survive hostile input.
 * A declaration is edited in git, so the cheap place to be loud is the
 * instance's `check` and `test`, before it can reach a deployment.
 */
export function worldviewErrors(input: WorldviewInput): string[] {
  const errors: string[] = [];
  const slug = /^[a-z0-9-]+$/;

  if (!input?.declaration || typeof input.declaration !== "object") {
    return ["declaration must be the parsed contents of worldview.json"];
  }

  const candidate = resolveWorldview(input);

  if (!slug.test(candidate.instance ?? "")) {
    errors.push("instance must be a lowercase slug — it is a URI segment");
  }
  // Every language, not just the default: a declaration that silently reads in
  // English on the Portuguese page is the failure this is here to catch.
  for (const field of ["name", "declaredFuture"] as const) {
    const missing = missingLocales(candidate[field]);
    if (missing.length === LOCALES.length) errors.push(`${field} is required`);
    else if (missing.length) {
      errors.push(`${field} is missing ${missing.join(", ")}`);
    }
  }
  for (const domain of ["word", "systems", "objects"] as const) {
    if (missingLocales(candidate.scores?.integrity?.domains?.[domain]).length) {
      errors.push(`integrity domain "${domain}" is required in both languages`);
    }
  }
  candidate.conditionsOfSatisfaction?.forEach((condition, index) => {
    const missing = missingLocales(condition);
    if (missing.length) {
      errors.push(
        `conditionsOfSatisfaction[${index}] is missing ${missing.join(", ")}`,
      );
    }
  });
  if (!candidate.strategicResults?.length) {
    errors.push("declare at least one strategic result");
  }

  const seenIds = new Set<string>();
  const seenPositions = new Set<number>();
  const seenMetricIds = new Set<string>();
  for (const result of candidate.strategicResults ?? []) {
    const at = `strategicResults[${result.id ?? "?"}]`;
    if (!slug.test(result.id ?? "")) errors.push(`${at}: id must be a slug`);
    if (seenIds.has(result.id)) errors.push(`${at}: duplicate id`);
    if (!Number.isInteger(result.position)) {
      errors.push(`${at}: position must be an integer`);
    } else if (seenPositions.has(result.position)) {
      errors.push(`${at}: position ${result.position} collides`);
    }
    for (const field of ["title", "narrative"] as const) {
      const missing = missingLocales(result[field]);
      if (missing.length) {
        errors.push(`${at}: ${field} is missing ${missing.join(", ")}`);
      }
    }
    if (!result.acceptanceCriteria?.length) {
      errors.push(`${at}: needs at least one acceptance criterion`);
    }
    result.acceptanceCriteria?.forEach((criterion, index) => {
      const missing = missingLocales(criterion);
      if (missing.length) {
        errors.push(
          `${at}: acceptanceCriteria[${index}] is missing ${missing.join(", ")}`,
        );
      }
    });
    for (const metric of result.metrics ?? []) {
      if (typeof metric.target !== "number") {
        errors.push(
          `${at}: metric "${t(metric.label, "en")}" needs a numeric target`,
        );
      }
      // Without an id there is nowhere for the reading to come from, so the
      // metric renders as a target forever and nobody notices it is not wired.
      if (!slug.test(metric.id ?? "")) {
        errors.push(`${at}: metric "${t(metric.label, "en")}" needs a slug id`);
      } else if (seenMetricIds.has(metric.id)) {
        errors.push(`${at}: metric id "${metric.id}" is used twice`);
      }
      seenMetricIds.add(metric.id);
    }
    seenIds.add(result.id);
    seenPositions.add(result.position);
  }
  return errors;
}

export const SCORE_IDS = ["alignment", "integrity"] as const;
export type ScoreId = (typeof SCORE_IDS)[number];

export function strategicResultById(
  worldview: Worldview,
  id: string,
): WorldviewStrategicResult | undefined {
  return worldview.strategicResults.find((result) => result.id === id);
}
