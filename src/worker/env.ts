import type { DeclaredProject } from "../core/projects.ts";
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
   * Raw contents of the instance's `projects/*.md`, one string each. The library
   * parses them: an instance holds configuration and content, never an `if`.
   */
  projects?: string[];
  /**
   * What the browser tab says. An instance is somebody's site, so it owns its
   * own title, icon, and description rather than advertising the engine.
   */
  site?: { title?: string; description?: string; favicon?: string };
  /**
   * The masthead on the public Writing view: who this is, in their own words.
   *
   * Structured rather than free-form, because it is the one block every visitor
   * reads first and it has to survive being rendered by a library that has never
   * seen this instance. `intro` takes inline markdown links.
   */
  hero?: {
    /** Small line above the title, e.g. "Ada Lovelace · London". */
    eyebrow?: string;
    title: string;
    /** A paragraph. `[text](href)` is supported; nothing else is. */
    intro?: string;
    links?: Array<{ label: string; href: string }>;
    /** Square image, rendered as a circle. */
    avatar?: string;
  };
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
export interface ResolvedConfig
  extends Omit<WorldviewConfig, "declaration" | "projects"> {
  worldview: Worldview;
  /** Declared projects, already parsed. */
  projects: DeclaredProject[];
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
  /** The one credential: browser password and MCP bearer token. */
  WORLDVIEW_PASSWORD?: string;
  /** Its former name. Still honoured so deployments predating the rename work. */
  MCP_PRIVATE_TOKEN?: string;
  MESH_GATEWAY_URL?: string;
  MESH_API_KEY?: string;
  GITHUB_TOKEN?: string;
  ANALYTICS_SALT?: string;
}

export type AccessLevel = "public" | "private";
