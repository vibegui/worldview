import worldviewJson from "../../worldview.json" with { type: "json" };

/**
 * The declared future lives in git, not D1.
 *
 * What should be is deliberate, reviewable, and forkable, so changing it is a
 * commit. What is — progress, notes, measurements — stays in D1 because it
 * changes constantly and is derived from evidence. The gap between the two is
 * the only interesting query in the system.
 */

export interface WorldviewMetric {
  label: string;
  target: number;
  unit: string;
}

export interface WorldviewStrategicResult {
  id: string;
  position: number;
  title: string;
  narrative: string;
  acceptanceCriteria: string[];
  metrics: WorldviewMetric[];
  /** Which stage of the loop this result belongs to, if it is production work. */
  stage?: "ideas" | "expansion" | "execution" | "content" | "distribution";
  /** Which score this result belongs to, if it is a condition rather than a stage. */
  score?: "alignment" | "integrity";
}

export interface Worldview {
  version: number;
  instance: string;
  declaredFuture: string;
  scores: {
    alignment: {
      label: string;
      question: string;
      measure: string;
      kind: string;
    };
    integrity: {
      label: string;
      question: string;
      measure: string;
      kind: string;
      domains: { word: string; systems: string; objects: string };
    };
  };
  conditionsOfSatisfaction: string[];
  strategicResults: WorldviewStrategicResult[];
}

export const worldview = worldviewJson as Worldview;

export const SCORE_IDS = ["alignment", "integrity"] as const;
export type ScoreId = (typeof SCORE_IDS)[number];

export function strategicResultById(
  id: string,
): WorldviewStrategicResult | undefined {
  return worldview.strategicResults.find((result) => result.id === id);
}
