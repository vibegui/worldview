import { appBundleHtml } from "../generated/app-html.ts";
import type { AccessLevel, Env } from "./env.ts";
import {
  ANALYTICS_RESOURCE,
  BOOKMARKS_RESOURCE,
  PERSONAL_AI_OS_RESOURCE,
} from "./tools.ts";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ??
      character,
  );
}

export const MCP_APP_MIME = "text/html;profile=mcp-app";

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  access: AccessLevel;
}

const resources: ResourceDefinition[] = [
  {
    uri: BOOKMARKS_RESOURCE,
    name: "VibeGUI Bookmarks",
    description:
      "Private bookmark workspace for creation, editing, deletion, and enrichment.",
    access: "private",
  },
  {
    uri: PERSONAL_AI_OS_RESOURCE,
    name: "VibeGui Worldview OS",
    description:
      "Private project map, goals, memory, daily brief, attention evidence, and inbox.",
    access: "private",
  },
  {
    uri: ANALYTICS_RESOURCE,
    name: "Site Analytics",
    description:
      "Pageviews and unique visitors for vibegui.com, poesiadairene.com and buscamalvados.com — opens straight on the Analytics tab.",
    access: "private",
  },
];

export function resourcesForAccess(access: AccessLevel): ResourceDefinition[] {
  return resources.filter(
    (resource) => resource.access === "public" || access === "private",
  );
}

/**
 * The one UI bundle, served two ways.
 *
 * An MCP host reads it as a resource and talks to the server over the app
 * bridge. A browser gets the identical bytes from `GET /` with `__STANDALONE__`
 * set, which is the app's signal to call the same tools over HTTP JSON-RPC
 * against `/mcp` instead. Same markup, same tools, one transport switch.
 */
export function appHtml(
  env: Env,
  bootTool: string | null,
  standalone = false,
): string {
  const html = appBundleHtml;
  // The bundle is built once into the library; the declaration belongs to the
  // instance serving it. So it is injected per request rather than imported —
  // otherwise every deployment would ship whoever built the library's worldview.
  // Names and titles only: the app calls GET_DECLARATION for the rest.
  const declaration = {
    name: env.worldview.name,
    results: Object.fromEntries(
      env.worldview.strategicResults.map((result) => [result.id, result.title]),
    ),
  };
  // Rewritten in the markup rather than set from script, so the tab is right on
  // first paint and a crawler sees it at all.
  const title = env.site?.title ?? env.worldview.name;
  let head = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(title)}</title>`,
  );
  if (env.site?.description) {
    head = head.replace(
      "</head>",
      `<meta name="description" content="${escapeHtml(env.site.description)}"></head>`,
    );
  }
  if (env.site?.favicon) {
    head = head.replace(
      "</head>",
      `<link rel="icon" href="${escapeHtml(env.site.favicon)}"></head>`,
    );
  }

  const boot = bootTool
    ? `window.__BOOT_TOOL__=${JSON.stringify(bootTool)};`
    : "";
  const mode = standalone ? "window.__STANDALONE__=true;" : "";
  return `${head}<script>window.__WORLDVIEW__=${JSON.stringify(declaration)};${mode}${boot}</script>`;
}

export function readResource(
  env: Env,
  uri: string,
  access: AccessLevel,
): { resource: ResourceDefinition; body: string } | null {
  const resource = resourcesForAccess(access).find(
    (candidate) => candidate.uri === uri,
  );
  if (!resource) return null;
  const bootTool =
    uri === ANALYTICS_RESOURCE
      ? "SITES_OVERVIEW"
      : uri === BOOKMARKS_RESOURCE
        ? "LIST_ALL_BOOKMARKS"
        : null;
  return { resource, body: appHtml(env, bootTool) };
}
