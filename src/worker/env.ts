import type { Worldview, WorldviewInput } from "../core/worldview.ts";

/**
 * What an instance passes to `createWorldview()`.
 *
 * The instance owns configuration and content; the library owns behaviour.
 * Optional modules are **absent, not disabled** — omit a key and its tools never
 * appear in `tools/list`, its HTTP routes are not served, and its tab does not
 * render. A module that is present but broken is worse than one that is not
 * there, because it advertises a capability it cannot honour.
 */
export interface WorldviewConfig extends WorldviewInput {
  /**
   * Published writing as prior art: "have I already said this?". Omit and the
   * three public writing tools do not exist.
   */
  publicWriting?: {
    siteOrigin: string;
    manifestPath: string;
    /** Raw git origin for source markdown. Enables semantic corpus search. */
    repoRawOrigin?: string;
  };
  /**
   * The reference library. Omit and the bookmark tools do not exist.
   * `publicRoutes` additionally serves `/bookmarks*` with permissive CORS, so it
   * is opt-in rather than implied.
   */
  bookmarks?: { publicRoutes?: boolean };
  /**
   * First-party site analytics. Omit and no `/e` beacon is served and neither
   * analytics tool exists.
   */
  analytics?: { sites: string[] };
}

/** The config after validation, with the declaration merged and prose resolved. */
export interface ResolvedConfig extends Omit<WorldviewConfig, "declaration"> {
  worldview: Worldview;
}

export interface Env extends ResolvedConfig {
  DB: D1Database;
  /** Object storage for the writing corpus and bookmark markdown. Local by default. */
  CORPUS: R2Bucket;
  /** Writing module. Absent unless the deployment created the AI Search index. */
  AUTORAG?: AiSearchInstance;
  PUBLIC_SITE_ORIGIN?: string;
  PUBLIC_REPO_RAW_ORIGIN?: string;
  GITHUB_USERNAME?: string;
  AUTORAG_INSTANCE?: string;
  WORLDVIEW_PASSWORD?: string;
  MESH_GATEWAY_URL?: string;
  MESH_API_KEY?: string;
  GITHUB_TOKEN?: string;
  ANALYTICS_SALT?: string;
}

export type AccessLevel = "public" | "private";
