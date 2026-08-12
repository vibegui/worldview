/**
 * Worldview, as a library.
 *
 * An instance is configuration and content: its declaration, its bindings, its
 * secrets, and the handful of lines below. All behaviour — the MCP server, the
 * tools, the D1 schema, the browser UI, the capability boundary — lives here and
 * is upgraded by bumping this dependency.
 *
 *     import { createWorldview } from "worldview";
 *     import declaredFuture from "../declared-future.md";
 *     import declaration from "../worldview.json" with { type: "json" };
 *
 *     export default createWorldview({ declaration, declaredFuture });
 *
 * Migrations ship in this package under `migrations/`. An instance copies them
 * into its own repo (`bun run schema:sync`) so the schema it is about to apply
 * shows up in its own diff — for a system whose thesis is that consequential
 * change should be reviewable, applying invisible schema is the wrong default.
 */

import { resolveWorldview } from "./core/worldview.ts";
import type { Env, WorldviewConfig } from "./worker/env.ts";
import { createWorker } from "./worker/index.ts";

export function createWorldview(
  config: WorldviewConfig,
): ExportedHandler<Env> {
  const worldview = resolveWorldview(config);

  // Note what is *not* here: a throw when the declaration is malformed. This
  // runs at module scope in a Worker, so throwing would 500 every route rather
  // than the one view that depends on the bad field. Instances call
  // `worldviewErrors()` from `check` and `test`, where loud is free.
  return createWorker({
    worldview,
    publicWriting: config.publicWriting,
    bookmarks: config.bookmarks,
    analytics: config.analytics,
  });
}

export { worldviewErrors, resolveWorldview } from "./core/worldview.ts";
export type {
  Worldview,
  WorldviewDeclaration,
  WorldviewMetric,
  WorldviewStrategicResult,
} from "./core/worldview.ts";
export type { Env, WorldviewConfig } from "./worker/env.ts";
