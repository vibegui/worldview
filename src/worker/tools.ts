import {
  DIMENSOES,
  metricsQuery,
  sitesOverview,
  type Dim,
  type MetricsGroup,
} from "./analytics.ts";
import { enrichBookmark } from "./bookmark-enrichment.ts";
import { fetchPageMetadata } from "./bookmark-metadata.ts";
import {
  batchUpsertBookmarks,
  createBookmark,
  deleteBookmark,
  getBookmark,
  getBookmarkStats,
  getPublicBookmark,
  listBookmarks,
  parseBookmarkInput,
  searchBookmarks,
  updateBookmark,
} from "./bookmarks.ts";
import { DEFAULT_LOCALE, isLocale, t, tAll, type Locale } from "../core/localize.ts";
import type { AccessLevel, Env } from "./env.ts";
import { refreshGitHub } from "./github.ts";
import {
  getPublicWriting,
  listPublicWriting,
  searchPublicWriting,
} from "./public-content.ts";
import { getCorpusStatus, searchWritingCorpus } from "./rag.ts";
import {
  capture,
  createGoal,
  forgetMemory,
  getAttentionMap,
  getDailyBrief,
  getDailyBriefInput,
  getDeclarationDashboard,
  getInbox,
  getPortfolio,
  getProject,
  getStaleProjects,
  getStatus,
  listDecisions,
  listGoals,
  recallMemory,
  recordDecision,
  remember,
  saveDailyBrief,
  setProjectState,
  setProjectProgress,
  setStrategicResultProgress,
  updateScorecardItem,
  updateGoal,
} from "./state.ts";

export const PERSONAL_AI_OS_RESOURCE = "ui://vibegui/personal-ai-os/v9";
export const ANALYTICS_RESOURCE = "ui://vibegui/site-analytics/v1";
export const BOOKMARKS_RESOURCE = "ui://vibegui/bookmarks/v1";

export interface ToolDefinition {
  name: string;
  description: string;
  access: AccessLevel;
  inputSchema: Record<string, unknown>;
  _meta?: { ui: { resourceUri: string } };
  /**
   * `access` lets one tool serve both tiers with a narrower payload for
   * strangers, rather than duplicating it into a public twin that drifts.
   */
  execute: (
    env: Env,
    input: Record<string, unknown>,
    access: AccessLevel,
  ) => Promise<unknown>;
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

const BOOKMARK_PROPERTIES: Record<string, unknown> = {
  url: { type: "string", format: "uri" },
  title: { type: ["string", "null"] },
  description: { type: ["string", "null"] },
  icon: { type: ["string", "null"] },
  stars: { type: ["integer", "null"], minimum: 1, maximum: 5 },
  language: { type: ["string", "null"] },
  reading_time_min: { type: ["integer", "null"], minimum: 0 },
  perplexity_research: { type: ["string", "null"] },
  insight_dev: { type: ["string", "null"] },
  insight_founder: { type: ["string", "null"] },
  insight_investor: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
  researched_at: { type: ["string", "null"] },
  classified_at: { type: ["string", "null"] },
  published_at: { type: ["string", "null"] },
  created_at: { type: "string" },
  updated_at: { type: "string" },
  tags: { type: "array", items: { type: "string" } },
  firecrawl_content: { type: ["string", "null"] },
};

// Dimensões filtráveis do dashboard: cada uma vira um filtro opcional aqui e
// uma lista clicável na UI.
const DIM_DESC: Record<Dim, string> = {
  site: "site (vibegui.com | poesiadairene.com | buscamalvados.com)",
  path: "caminho da página (ex.: /1712)",
  country: "país, código ISO de 2 letras (ex.: FR)",
  ref: "fonte: hostname do referrer (ex.: google.com) ou '(direto)'",
  status: "status HTTP da resposta (ex.: 200)",
  cache: "cf-cache-status quando disponível",
  browser: "navegador derivado do user agent (Chrome, Safari, Bot…)",
  os: "sistema operacional (macOS, iOS, Windows…)",
  device: "aparelho (desktop | mobile | tablet | bot)",
  asn: "rede do visitante, ASN + organização (ex.: 'AS15169 GOOGLE')",
  ip: "faixa de IP do visitante (/24 no v4, /48 no v6)",
  colo: "datacenter da Cloudflare que atendeu (ex.: GRU)",
};
const DIM_SCHEMA = Object.fromEntries(
  DIMENSOES.map((dim) => [
    dim,
    { type: "string", description: `Filtrar por ${DIM_DESC[dim]}` },
  ]),
);

export const tools: ToolDefinition[] = [
  {
    name: "LIST_BOOKMARKS",
    description:
      "List enriched public VibeGUI bookmarks without loading large Firecrawl content.",
    access: "public",
    inputSchema: objectSchema({
      limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
      offset: { type: "integer", minimum: 0, default: 0 },
      tag: { type: "string" },
      min_stars: { type: "integer", minimum: 1, maximum: 5 },
      sort: {
        type: "string",
        enum: ["recent", "rating", "title"],
        default: "recent",
      },
    }),
    execute: async (env, input) =>
      listBookmarks(env, {
        limit: optionalNumber(input, "limit"),
        offset: optionalNumber(input, "offset"),
        tags: [optionalString(input, "tag")].filter((tag): tag is string =>
          Boolean(tag),
        ),
        minStars: optionalNumber(input, "min_stars"),
        sort: optionalEnum(input, "sort", ["recent", "rating", "title"]),
        publicOnly: true,
      }),
  },
  {
    name: "SEARCH_BOOKMARKS",
    description:
      "Full-text search enriched public bookmarks across metadata, tags, research, insights, and a bounded page-content excerpt. Returns per-area match flags.",
    access: "public",
    inputSchema: objectSchema(
      {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
      },
      ["query"],
    ),
    execute: async (env, input) =>
      searchBookmarks(env, requiredString(input, "query"), {
        limit: optionalNumber(input, "limit"),
        publicOnly: true,
      }),
  },
  {
    name: "GET_BOOKMARK",
    description:
      "Get one enriched public bookmark by URL, including research, insights, and Firecrawl Markdown.",
    access: "public",
    inputSchema: objectSchema({ url: { type: "string", format: "uri" } }, [
      "url",
    ]),
    execute: async (env, input) => {
      const bookmark = await getPublicBookmark(
        env,
        requiredString(input, "url"),
      );
      if (!bookmark) throw new Error("Bookmark not found");
      return { bookmark };
    },
  },
  {
    name: "LIST_ALL_BOOKMARKS",
    description:
      "Open the private bookmark workspace and list all bookmarks, including pending enrichment.",
    access: "private",
    inputSchema: objectSchema({
      limit: { type: "integer", minimum: 1, maximum: 100, default: 100 },
      offset: { type: "integer", minimum: 0, default: 0 },
      tag: { type: "string" },
      min_stars: { type: "integer", minimum: 1, maximum: 5 },
      sort: {
        type: "string",
        enum: ["recent", "rating", "title"],
        default: "recent",
      },
    }),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) =>
      listBookmarks(env, {
        limit: optionalNumber(input, "limit") ?? 100,
        offset: optionalNumber(input, "offset"),
        tags: [optionalString(input, "tag")].filter((tag): tag is string =>
          Boolean(tag),
        ),
        minStars: optionalNumber(input, "min_stars"),
        sort: optionalEnum(input, "sort", ["recent", "rating", "title"]),
        publicOnly: false,
      }),
  },
  {
    name: "SEARCH_ALL_BOOKMARKS",
    description:
      "Search all private bookmarks, including items that have not been enriched yet.",
    access: "private",
    inputSchema: objectSchema(
      {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      ["query"],
    ),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) =>
      searchBookmarks(env, requiredString(input, "query"), {
        limit: optionalNumber(input, "limit") ?? 50,
        publicOnly: false,
      }),
  },
  {
    name: "GET_BOOKMARK_ADMIN",
    description:
      "Get the complete private bookmark record for editing and enrichment.",
    access: "private",
    inputSchema: objectSchema({ url: { type: "string", format: "uri" } }, [
      "url",
    ]),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) => {
      const bookmark = await getBookmark(
        env,
        requiredString(input, "url"),
        true,
      );
      if (!bookmark) throw new Error("Bookmark not found");
      return { bookmark };
    },
  },
  {
    name: "SAVE_BOOKMARK",
    description:
      "Save a link. Pass the URL and nothing else: the page's own title, description, icon, site name, language, and publication date are read from its head. Everything else is optional. Re-saving the same URL updates it rather than failing, so this is safe to repeat. Enrichment, when configured, is a separate step.",
    access: "private",
    inputSchema: objectSchema(
      {
        url: { type: "string", format: "uri" },
        notes: {
          type: "string",
          description: "Why this is worth keeping, in your words.",
        },
        stars: { type: "integer", minimum: 1, maximum: 5 },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            'Prefixed, e.g. "topic:ai", "persona:mcp_developer", "type:essay".',
        },
        enrich: {
          type: "boolean",
          description:
            "Also run research and classification. Requires MESH_GATEWAY_URL and MESH_API_KEY; without them the bookmark is still saved.",
        },
      },
      ["url"],
    ),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) => {
      const url = requiredString(input, "url");
      // Read the page first: a link with no title is a row nobody can find
      // again, and this needs no key, no model, and no credit balance.
      const page = await fetchPageMetadata(url).catch((error) => {
        console.warn("bookmark metadata unavailable", String(error));
        return null;
      });

      const bookmark = await createBookmark(env, {
        // The URL after redirects is the one worth keeping — trackers and
        // shorteners otherwise become the identity of the bookmark.
        url: page?.url ?? url,
        title: page?.title ?? null,
        description: page?.description ?? null,
        icon: page?.icon ?? null,
        language: page?.language ?? null,
        published_at: page?.publishedAt ?? null,
        notes: optionalString(input, "notes") ?? null,
        stars: optionalNumber(input, "stars") ?? null,
        tags: Array.isArray(input.tags)
          ? (input.tags as unknown[]).filter(
              (tag): tag is string => typeof tag === "string",
            )
          : undefined,
      });

      if (input.enrich !== true) {
        return { bookmark, metadata_read: Boolean(page) };
      }
      // Enrichment is best-effort on purpose: losing the link because a
      // downstream service is unavailable is the worse outcome.
      const enriched = await enrichBookmark(env, bookmark.url as string).catch(
        (error) => ({ error: String(error) }),
      );
      return { bookmark, metadata_read: Boolean(page), enriched };
    },
  },
  {
    name: "CREATE_BOOKMARK",
    description:
      "Create a private bookmark. URL is the unique natural key; Firecrawl Markdown is stored in R2.",
    access: "private",
    inputSchema: objectSchema(BOOKMARK_PROPERTIES, ["url"]),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) => ({
      bookmark: await createBookmark(env, parseBookmarkInput(input)),
    }),
  },
  {
    name: "UPDATE_BOOKMARK",
    description:
      "Partially update an existing private bookmark identified by its URL.",
    access: "private",
    inputSchema: objectSchema(BOOKMARK_PROPERTIES, ["url"]),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) => ({
      bookmark: await updateBookmark(env, parseBookmarkInput(input)),
    }),
  },
  {
    name: "DELETE_BOOKMARK",
    description:
      "Delete a private bookmark, its tags, FTS entry, and stored R2 content.",
    access: "private",
    inputSchema: objectSchema({ url: { type: "string", format: "uri" } }, [
      "url",
    ]),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) =>
      deleteBookmark(env, requiredString(input, "url")),
  },
  {
    name: "IMPORT_BOOKMARKS",
    description:
      "Upsert a migration batch of up to 100 bookmarks, preserving timestamps, tags, research, insights, and Firecrawl content.",
    access: "private",
    inputSchema: objectSchema(
      {
        bookmarks: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: objectSchema(BOOKMARK_PROPERTIES, ["url"]),
        },
        source_sha256: { type: "string" },
      },
      ["bookmarks"],
    ),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) => {
      if (!Array.isArray(input.bookmarks)) {
        throw new Error("bookmarks must be an array");
      }
      const result = await batchUpsertBookmarks(
        env,
        input.bookmarks.map((bookmark) => parseBookmarkInput(bookmark)),
      );
      return {
        ...result,
        source_sha256: optionalString(input, "source_sha256") ?? null,
        destination: await getBookmarkStats(env, false),
      };
    },
  },
  {
    name: "ENRICH_BOOKMARK",
    description:
      "Server-side bookmark enrichment using Mesh Perplexity research, Firecrawl Markdown, and OpenRouter Gemini 2.5 Flash classification. Secrets never reach the browser.",
    access: "private",
    inputSchema: objectSchema(
      {
        url: { type: "string", format: "uri" },
        run_research: { type: "boolean", default: true },
        run_content: { type: "boolean", default: true },
        run_analysis: { type: "boolean", default: true },
      },
      ["url"],
    ),
    _meta: { ui: { resourceUri: BOOKMARKS_RESOURCE } },
    execute: async (env, input) => ({
      bookmark: await enrichBookmark(env, requiredString(input, "url"), {
        runResearch: optionalBoolean(input, "run_research"),
        runContent: optionalBoolean(input, "run_content"),
        runAnalysis: optionalBoolean(input, "run_analysis"),
      }),
    }),
  },
  {
    name: "SITES_OVERVIEW",
    description:
      "Dashboard de analytics dos três sites (vibegui.com, poesiadairene.com, buscamalvados.com): pageviews e visitantes únicos por site, série diária e rankings por página, fonte, país, status, cache, navegador, sistema, aparelho, ASN, faixa de IP e colo. Qualquer dimensão também serve de filtro (cross-filter: cada lista ignora o próprio filtro). Fonte: eventos first-party gravados pelo middleware do Pages.",
    access: "private",
    inputSchema: objectSchema({
      days: {
        type: "number",
        description: "Janela em dias (1–90, padrão 7)",
      },
      name: {
        type: "string",
        description:
          "Nome do evento (padrão pageview; 'blocked' = varredura barrada pelo middleware)",
      },
      ...DIM_SCHEMA,
    }),
    _meta: { ui: { resourceUri: ANALYTICS_RESOURCE } },
    execute: async (env, input) =>
      sitesOverview(env, {
        days: optionalNumber(input, "days"),
        name: optionalString(input, "name"),
        ...Object.fromEntries(
          DIMENSOES.map((dim) => [dim, optionalString(input, dim)]),
        ),
      }),
  },
  {
    name: "SITE_METRICS",
    description:
      "Consulta flexível dos eventos de analytics: agrupa por day, site, path, country, ref ou name, com filtros opcionais de site e nome do evento. Retorna events, value e visitantes únicos por grupo.",
    access: "private",
    inputSchema: objectSchema({
      days: { type: "number", description: "Janela em dias (1–90, padrão 7)" },
      group_by: {
        type: "string",
        enum: ["day", "site", "path", "country", "ref", "name"],
        description: "Dimensão de agrupamento (padrão: day)",
      },
      site: {
        type: "string",
        description:
          "Filtrar por site (vibegui.com | poesiadairene.com | buscamalvados.com)",
      },
      name: {
        type: "string",
        description: "Filtrar por nome do evento (ex.: pageview)",
      },
      limit: { type: "number", description: "Máximo de linhas (padrão 20)" },
    }),
    execute: async (env, input) =>
      metricsQuery(env, {
        days: optionalNumber(input, "days"),
        groupBy: optionalEnum(input, "group_by", [
          "day",
          "site",
          "path",
          "country",
          "ref",
          "name",
        ] as const) as MetricsGroup | undefined,
        site: optionalString(input, "site"),
        name: optionalString(input, "name"),
        limit: optionalNumber(input, "limit"),
      }),
  },
  {
    name: "LIST_PUBLIC_WRITING",
    description:
      "List published articles, newest first. Public, and never returns drafts or private state. Pass a locale to get one language; omit it and you get every language in one list, which is rarely what a reader wants.",
    access: "public",
    inputSchema: objectSchema({
      locale: {
        type: "string",
        description: 'Manifest locale, e.g. "en" or "pt-BR".',
      },
    }),
    execute: async (env, input) => ({
      writing: await listPublicWriting(env, optionalString(input, "locale")),
    }),
  },
  {
    name: "GET_PUBLIC_WRITING",
    description:
      "Get one published VibeGui article by slug, including its Markdown body.",
    access: "public",
    inputSchema: objectSchema(
      { slug: { type: "string", description: "Published article slug" } },
      ["slug"],
    ),
    execute: async (env, input) =>
      getPublicWriting(env, requiredString(input, "slug")),
  },
  {
    name: "SEARCH_PUBLIC_WRITING",
    description:
      "Search published VibeGui article metadata by title, description, and tags.",
    access: "public",
    inputSchema: objectSchema(
      {
        query: { type: "string" },
        limit: { type: "number", default: 10, minimum: 1, maximum: 50 },
      },
      ["query"],
    ),
    execute: async (env, input) => {
      const query = requiredString(input, "query");
      const limit = optionalNumber(input, "limit") ?? 10;
      const citations = await searchWritingCorpus(env, query, limit);
      if (citations.length > 0) {
        const writing = await listPublicWriting(env);
        return {
          mode: "semantic",
          writing: mergeSemanticWriting(citations, writing, limit),
        };
      }
      return {
        mode: "lexical",
        writing: await searchPublicWriting(env, query, limit),
      };
    },
  },
  {
    name: "GET_DECLARATION",
    description:
      "What my life is about, what game I am playing, and whether I am playing it well: the declared future, the strategic results with their progress, the conditions of satisfaction, and the two scores. Public — the gap between what was declared and what is measured is meant to be checkable by someone other than its author.",
    access: "public",
    inputSchema: objectSchema({
      locale: {
        type: "string",
        enum: ["pt-BR", "en"],
        default: "pt-BR",
        description:
          "Which language to answer in. Defaults to Portuguese, the language the declaration is written and edited in.",
      },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input, access) => {
      const locale = localeOf(input);
      const dashboard = await getDeclarationDashboard(env, locale);

      return {
        locale,
        what_my_life_is_about: {
          declared_future: t(env.worldview.declaredFuture, locale),
          source: "worldview.json",
        },
        what_game_i_am_playing: {
          conditions_of_satisfaction: tAll(
            env.worldview.conditionsOfSatisfaction,
            locale,
          ),
          strategic_results: dashboard.strategic_results,
        },
        am_i_playing_it_well: dashboard.scores,
        // The targets are already public — they ship inside every strategic
        // result. The *readings* are not: a target is something declared, a
        // reading is where I actually am, and publishing that is a separate
        // decision from publishing the declaration. So a stranger sees the bar
        // and not the fill. Opening this later is one line; un-publishing a
        // number that has been cached and indexed is not.
        scorecard:
          access === "private"
            ? dashboard.scorecard
            : dashboard.scorecard.map(({ current, note, updated_at, ...rest }) => {
                void current;
                void note;
                void updated_at;
                return { ...rest, current: null };
              }),
        // Readings taken against an earlier declaration. Working detail, and
        // they name results that no longer exist, so they stay private.
        ...(access === "private" ? { diagnostics: dashboard.diagnostics } : {}),
      };
    },
  },
  {
    name: "SET_STRATEGIC_RESULT_PROGRESS",
    description:
      "Update a declaration-level strategic result progress percentage and evidence-based note.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: { type: "string" },
        progress_percent: {
          type: "number",
          minimum: 0,
          maximum: 100,
        },
        progress_note: { type: "string" },
      },
      ["id", "progress_percent"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      setStrategicResultProgress(
        env,
        requiredString(input, "id"),
        requiredNumber(input, "progress_percent"),
        optionalString(input, "progress_note") ?? "",
      ),
  },
  {
    name: "UPDATE_SCORECARD_ITEM",
    description:
      "Update the current numeric value or yes/no state of a declaration scorecard item.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: { type: "string" },
        current_value: { type: ["number", "null"] },
        boolean_value: { type: ["boolean", "null"] },
        note: { type: "string" },
      },
      ["id"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      updateScorecardItem(env, {
        id: requiredString(input, "id"),
        current_value: optionalNullableNumber(input, "current_value"),
        boolean_value: optionalNullableBoolean(input, "boolean_value"),
        note: optionalString(input, "note"),
      }),
  },
  {
    name: "GET_PORTFOLIO",
    description:
      "The project map: what is being worked on, which declared strategic result each one serves, and how far along it is. Publicly this returns only projects that opted in with `public: true`, and never their prose — a project file states positions about work other people own.",
    access: "public",
    inputSchema: objectSchema({
      locale: {
        type: "string",
        enum: ["pt-BR", "en"],
        default: "pt-BR",
        description:
          "Which language to answer in. Defaults to Portuguese, the language the declaration is written and edited in.",
      },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input, access) => {
      const portfolio = await getPortfolio(
        env,
        access !== "private",
        localeOf(input),
      );
      if (access === "private") return portfolio;
      // Unfiled captures are an inbox, and the daily brief is working notes.
      // Neither is a declaration.
      return { projects: portfolio.projects };
    },
  },
  {
    name: "SET_PROJECT_STATE",
    description:
      "Set the state of a project that is declared in the instance's git: lifecycle, review date, and deliberate order. It cannot create a project or change what a project is — name, declared outcome, success criteria, and which strategic results it serves live in projects/*.md, because changing intent is a commit.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: {
          type: "string",
          description: "Id of a project declared in projects/*.md",
        },
        lifecycle: { type: "string", enum: ["draft", "active", "archived"] },
        next_review: { type: ["string", "null"] },
        position: {
          type: ["number", "null"],
          description:
            "Deliberate order within the lifecycle group, lowest first. Not a priority label — it is the owner's chosen sequence. Omit to leave it untouched.",
        },
      },
      ["id"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      setProjectState(env, {
        id: requiredString(input, "id"),
        lifecycle: optionalEnum(input, "lifecycle", [
          "draft",
          "active",
          "archived",
        ]),
        next_review: optionalNullableString(input, "next_review"),
        position: optionalNullableNumber(input, "position"),
      }),
  },
  {
    name: "SET_PROJECT_PROGRESS",
    description:
      "Set a project's explicit progress percentage and optional evidence-based note. Never infer this from activity volume.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: { type: "string" },
        progress_percent: {
          type: "number",
          minimum: 0,
          maximum: 100,
        },
        progress_note: { type: "string" },
      },
      ["id", "progress_percent"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      setProjectProgress(
        env,
        requiredString(input, "id"),
        requiredNumber(input, "progress_percent"),
        optionalString(input, "progress_note") ?? "",
      ),
  },
  {
    name: "GET_PROJECT",
    description:
      "Get one private project with its goals, active memories, decisions, inbox, and recent activity.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: { type: "string", description: "Project id" },
        locale: { type: "string", enum: ["pt-BR", "en"], default: "pt-BR" },
      },
      ["id"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      getProject(env, requiredString(input, "id"), localeOf(input)),
  },
  {
    name: "GET_ATTENTION_MAP",
    description:
      "Summarize observed activity evidence by project. Evidence is explicitly not treated as hours or effort.",
    access: "private",
    inputSchema: objectSchema({
      days: { type: "number", default: 30, minimum: 1, maximum: 365 },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      getAttentionMap(env, optionalNumber(input, "days") ?? 30),
  },
  {
    name: "GET_STALE_PROJECTS",
    description:
      "List active projects with no recent activity evidence or state update.",
    access: "private",
    inputSchema: objectSchema({
      days: { type: "number", default: 14, minimum: 1, maximum: 365 },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      getStaleProjects(env, optionalNumber(input, "days") ?? 14),
  },
  {
    name: "LIST_GOALS",
    description:
      "List portfolio-wide or project-scoped goals from the private Worldview OS.",
    access: "private",
    inputSchema: objectSchema({
      project_id: { type: "string" },
      status: {
        type: "string",
        enum: ["active", "paused", "completed", "cancelled", "all"],
        default: "active",
      },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      listGoals(
        env,
        optionalString(input, "project_id"),
        optionalEnum(input, "status", [
          "active",
          "paused",
          "completed",
          "cancelled",
          "all",
        ]) ?? "active",
      ),
  },
  {
    name: "CREATE_GOAL",
    description:
      "Create a durable portfolio-wide or project-scoped goal with an outcome and success criteria.",
    access: "private",
    inputSchema: objectSchema(
      {
        project_id: { type: ["string", "null"] },
        parent_goal_id: { type: ["string", "null"] },
        title: { type: "string" },
        desired_outcome: { type: "string" },
        success_criteria: { type: "string" },
        horizon: { type: ["string", "null"] },
        current_assessment: { type: "string" },
        next_review: { type: ["string", "null"] },
      },
      ["title", "desired_outcome"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      createGoal(env, {
        project_id: optionalNullableString(input, "project_id"),
        parent_goal_id: optionalNullableString(input, "parent_goal_id"),
        title: requiredString(input, "title"),
        desired_outcome: requiredString(input, "desired_outcome"),
        success_criteria: optionalString(input, "success_criteria"),
        horizon: optionalNullableString(input, "horizon"),
        current_assessment: optionalString(input, "current_assessment"),
        next_review: optionalNullableString(input, "next_review"),
      }),
  },
  {
    name: "UPDATE_GOAL",
    description:
      "Update the assessment, outcome, status, or next review of a durable goal.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: { type: "string" },
        title: { type: "string" },
        desired_outcome: { type: "string" },
        success_criteria: { type: "string" },
        horizon: { type: ["string", "null"] },
        status: {
          type: "string",
          enum: ["active", "paused", "completed", "cancelled"],
        },
        current_assessment: { type: "string" },
        next_review: { type: ["string", "null"] },
      },
      ["id"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      updateGoal(env, {
        id: requiredString(input, "id"),
        title: optionalString(input, "title"),
        desired_outcome: optionalString(input, "desired_outcome"),
        success_criteria: optionalString(input, "success_criteria"),
        horizon: optionalNullableString(input, "horizon"),
        status: optionalEnum(input, "status", [
          "active",
          "paused",
          "completed",
          "cancelled",
        ]),
        current_assessment: optionalString(input, "current_assessment"),
        next_review: optionalNullableString(input, "next_review"),
      }),
  },
  {
    name: "COMPLETE_GOAL",
    description: "Mark a durable goal completed.",
    access: "private",
    inputSchema: objectSchema(
      {
        id: { type: "string" },
        current_assessment: {
          type: "string",
          description: "Final result or assessment",
        },
      },
      ["id"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      updateGoal(env, {
        id: requiredString(input, "id"),
        status: "completed",
        current_assessment: optionalString(input, "current_assessment"),
      }),
  },
  {
    name: "RECALL_MEMORY",
    description:
      "Recall active global memory plus optional project memory. Expired, superseded, and forgotten entries are excluded.",
    access: "private",
    inputSchema: objectSchema({
      project_id: { type: "string" },
      limit: { type: "number", default: 50, minimum: 1, maximum: 200 },
    }),
    execute: async (env, input) =>
      recallMemory(
        env,
        optionalString(input, "project_id"),
        optionalNumber(input, "limit") ?? 50,
      ),
  },
  {
    name: "REMEMBER",
    description:
      "Store a durable, source-backed memory. Do not use this for routine chat or unsupported inference.",
    access: "private",
    inputSchema: objectSchema(
      {
        project_id: { type: ["string", "null"] },
        kind: {
          type: "string",
          enum: ["fact", "observation", "preference", "lesson", "reflection"],
        },
        content: { type: "string" },
        source: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1, default: 1 },
        expires_at: { type: ["string", "null"] },
        supersedes_id: { type: ["string", "null"] },
      },
      ["kind", "content", "source"],
    ),
    execute: async (env, input) =>
      remember(env, {
        project_id: optionalNullableString(input, "project_id"),
        kind: requiredEnum(input, "kind", [
          "fact",
          "observation",
          "preference",
          "lesson",
          "reflection",
        ]),
        content: requiredString(input, "content"),
        source: requiredString(input, "source"),
        confidence: optionalNumber(input, "confidence"),
        expires_at: optionalNullableString(input, "expires_at"),
        supersedes_id: optionalNullableString(input, "supersedes_id"),
      }),
  },
  {
    name: "SUPERSEDE_MEMORY",
    description:
      "Replace an existing memory with a corrected or more current source-backed memory.",
    access: "private",
    inputSchema: objectSchema(
      {
        supersedes_id: { type: "string" },
        project_id: { type: ["string", "null"] },
        kind: {
          type: "string",
          enum: ["fact", "observation", "preference", "lesson", "reflection"],
        },
        content: { type: "string" },
        source: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1, default: 1 },
        expires_at: { type: ["string", "null"] },
      },
      ["supersedes_id", "kind", "content", "source"],
    ),
    execute: async (env, input) =>
      remember(env, {
        supersedes_id: requiredString(input, "supersedes_id"),
        project_id: optionalNullableString(input, "project_id"),
        kind: requiredEnum(input, "kind", [
          "fact",
          "observation",
          "preference",
          "lesson",
          "reflection",
        ]),
        content: requiredString(input, "content"),
        source: requiredString(input, "source"),
        confidence: optionalNumber(input, "confidence"),
        expires_at: optionalNullableString(input, "expires_at"),
      }),
  },
  {
    name: "FORGET_MEMORY",
    description:
      "Mark a private memory forgotten so it no longer participates in recall.",
    access: "private",
    inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
    execute: async (env, input) =>
      forgetMemory(env, requiredString(input, "id")),
  },
  {
    name: "LIST_DECISIONS",
    description: "List immutable portfolio-wide or project-scoped decisions.",
    access: "private",
    inputSchema: objectSchema({ project_id: { type: "string" } }),
    execute: async (env, input) =>
      listDecisions(env, optionalString(input, "project_id")),
  },
  {
    name: "RECORD_DECISION",
    description:
      "Record an immutable decision and its rationale in the private Worldview OS.",
    access: "private",
    inputSchema: objectSchema(
      {
        project_id: { type: ["string", "null"] },
        title: { type: "string" },
        decision: { type: "string" },
        rationale: { type: "string" },
        source: { type: "string", default: "studio" },
      },
      ["title", "decision"],
    ),
    execute: async (env, input) =>
      recordDecision(env, {
        project_id: optionalNullableString(input, "project_id"),
        title: requiredString(input, "title"),
        decision: requiredString(input, "decision"),
        rationale: optionalString(input, "rationale"),
        source: optionalString(input, "source"),
      }),
  },
  {
    name: "CAPTURE",
    description:
      "Capture a raw idea, distinction, project, task, source, or note into the private inbox with minimal friction.",
    access: "private",
    inputSchema: objectSchema(
      {
        project_id: { type: ["string", "null"] },
        kind: {
          type: "string",
          enum: ["idea", "distinction", "project", "task", "source", "note"],
          default: "idea",
        },
        content: { type: "string" },
        source: { type: "string", default: "studio" },
      },
      ["content"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      capture(env, {
        project_id: optionalNullableString(input, "project_id"),
        kind: optionalEnum(input, "kind", [
          "idea",
          "distinction",
          "project",
          "task",
          "source",
          "note",
        ]),
        content: requiredString(input, "content"),
        source: optionalString(input, "source"),
      }),
  },
  {
    name: "GET_INBOX",
    description: "List unresolved captures in the private inbox.",
    access: "private",
    inputSchema: objectSchema({
      limit: { type: "number", default: 100, minimum: 1, maximum: 500 },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      getInbox(env, optionalNumber(input, "limit") ?? 100),
  },
  {
    name: "GET_DAILY_BRIEF_INPUT",
    description:
      "Return the deterministic private state packet that local Claude should synthesize into today's daily brief.",
    access: "private",
    inputSchema: objectSchema({
      brief_date: { type: "string", description: "YYYY-MM-DD" },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      getDailyBriefInput(env, optionalString(input, "brief_date")),
  },
  {
    name: "SAVE_DAILY_BRIEF",
    description:
      "Persist a daily brief synthesized from GET_DAILY_BRIEF_INPUT.",
    access: "private",
    inputSchema: objectSchema(
      {
        brief_date: { type: "string", description: "YYYY-MM-DD" },
        content: { type: "string" },
        source_snapshot: { type: "object" },
      },
      ["content"],
    ),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      saveDailyBrief(env, {
        brief_date: optionalString(input, "brief_date"),
        content: requiredString(input, "content"),
        source_snapshot: input.source_snapshot,
      }),
  },
  {
    name: "GET_DAILY_BRIEF",
    description: "Get the latest private daily brief or one by date.",
    access: "private",
    inputSchema: objectSchema({
      brief_date: { type: "string", description: "YYYY-MM-DD" },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      getDailyBrief(env, optionalString(input, "brief_date")),
  },
  {
    name: "GET_CORPUS_STATUS",
    description:
      "Return the published Markdown mirror and AutoRAG indexing status. R2 is a derived retrieval corpus; Git Markdown remains canonical.",
    access: "private",
    inputSchema: objectSchema({}),
    execute: async (env) => getCorpusStatus(env),
  },
  {
    name: "REFRESH_GITHUB",
    description:
      "Refresh read-only GitHub issues, pull requests, and the owner's recent commits for all mapped repositories or one project.",
    access: "private",
    inputSchema: objectSchema({
      project_id: { type: "string" },
    }),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env, input) =>
      refreshGitHub(env, optionalString(input, "project_id")),
  },
  {
    name: "GET_STATUS",
    description:
      "Return private Worldview OS health and record counts without exposing secret values.",
    access: "private",
    inputSchema: objectSchema({}),
    _meta: { ui: { resourceUri: PERSONAL_AI_OS_RESOURCE } },
    execute: async (env) => getStatus(env),
  },
];

export const toolByName: Record<string, ToolDefinition> = Object.fromEntries(
  tools.map((tool) => [tool.name, tool]),
);

/**
 * Which module each tool belongs to. A tool with no entry is core and always
 * present; the rest exist only when the instance configured that module.
 *
 * Absent, not disabled: a tool that appears and then throws "not configured"
 * advertises a capability the deployment cannot honour, and every caller has to
 * learn that the hard way.
 */
const TOOL_MODULE: Record<string, "publicWriting" | "bookmarks" | "analytics"> =
  {
    LIST_PUBLIC_WRITING: "publicWriting",
    GET_PUBLIC_WRITING: "publicWriting",
    SEARCH_PUBLIC_WRITING: "publicWriting",
    GET_CORPUS_STATUS: "publicWriting",
    SITES_OVERVIEW: "analytics",
    SITE_METRICS: "analytics",
    LIST_BOOKMARKS: "bookmarks",
    SEARCH_BOOKMARKS: "bookmarks",
    GET_BOOKMARK: "bookmarks",
    LIST_ALL_BOOKMARKS: "bookmarks",
    SEARCH_ALL_BOOKMARKS: "bookmarks",
    GET_BOOKMARK_ADMIN: "bookmarks",
    CREATE_BOOKMARK: "bookmarks",
    UPDATE_BOOKMARK: "bookmarks",
    DELETE_BOOKMARK: "bookmarks",
    IMPORT_BOOKMARKS: "bookmarks",
    ENRICH_BOOKMARK: "bookmarks",
  };

export function toolsForAccess(
  env: Env,
  access: AccessLevel,
): ToolDefinition[] {
  // Publicly, the project map exists only if some project opted in. A tab that
  // is always empty is worse than no tab: it advertises something the visitor
  // cannot have, and the same "absent, not disabled" rule that governs modules
  // should govern this.
  const anyPublicProject = env.projects.some((project) => project.isPublic);

  return tools.filter((tool) => {
    if (tool.access !== "public" && access !== "private") return false;
    if (
      tool.name === "GET_PORTFOLIO" &&
      access !== "private" &&
      !anyPublicProject
    ) {
      return false;
    }
    const module = TOOL_MODULE[tool.name];
    return !module || Boolean(env[module]);
  });
}

export function mergeSemanticWriting<
  TCitation extends { slug: string; score?: number },
  TWriting extends { slug: string },
>(
  citations: TCitation[],
  writing: TWriting[],
  limit: number,
): Array<TWriting & TCitation> {
  const bySlug = new Map(writing.map((article) => [article.slug, article]));
  const bestBySlug = new Map<string, TCitation>();

  for (const citation of citations) {
    if (!bySlug.has(citation.slug)) continue;
    const current = bestBySlug.get(citation.slug);
    if (!current || (citation.score ?? 0) > (current.score ?? 0)) {
      bestBySlug.set(citation.slug, citation);
    }
  }

  return [...bestBySlug.values()].slice(0, limit).flatMap((citation) => {
    const article = bySlug.get(citation.slug);
    return article ? [{ ...article, ...citation }] : [];
  });
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

/** Which language the caller asked for. Anything unrecognised reads as default. */
function localeOf(input: Record<string, unknown>): Locale {
  const value = input.locale;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value.trim();
}

function optionalNullableString(
  input: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string or null`);
  }
  return value.trim();
}

function optionalNumber(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number`);
  }
  return value;
}

function requiredNumber(input: Record<string, unknown>, key: string): number {
  const value = optionalNumber(input, key);
  if (value === undefined) throw new Error(`${key} is required`);
  return value;
}

function optionalNullableNumber(
  input: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const value = input[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number or null`);
  }
  return value;
}

function optionalNullableBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean | null | undefined {
  const value = input[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean or null`);
  }
  return value;
}

function optionalBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function requiredEnum<const T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
): T[number] {
  const value = requiredString(input, key);
  if (!values.includes(value)) {
    throw new Error(`${key} must be one of: ${values.join(", ")}`);
  }
  return value as T[number];
}

function optionalEnum<const T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
): T[number] | undefined {
  const value = optionalString(input, key);
  if (value === undefined) return undefined;
  if (!values.includes(value)) {
    throw new Error(`${key} must be one of: ${values.join(", ")}`);
  }
  return value as T[number];
}
