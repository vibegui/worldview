import { type ReactNode, useEffect, useRef, useState } from "react";
import { BookmarksView, isBookmarkTool } from "./bookmarks/BookmarksView";
import { useMcp } from "./mcp";

const globals = (typeof window !== "undefined" ? window : {}) as {
  __STANDALONE__?: boolean;
  __WORLDVIEW__?: {
    name?: string;
    results?: Record<string, string>;
    hero?: Hero | null;
  };
};

const STANDALONE = globals.__STANDALONE__ === true;

/**
 * The instance's declaration, injected by the worker when it serves this bundle.
 *
 * It cannot be imported: this file is built once, into the library, while the
 * declaration belongs to whichever instance is serving it. Baking it in at
 * library build time would ship one person's worldview to everyone.
 */
const declaration = globals.__WORLDVIEW__ ?? {};
const resultTitles: Record<string, string> = declaration.results ?? {};

type JsonRecord = Record<string, unknown>;

interface Hero {
  eyebrow?: string;
  title: string;
  intro?: string;
  links?: Array<{ label: string; href: string }>;
  avatar?: string;
}

// The loop, in order: declare a future, run the projects that pursue it, see how
// they are performing, keep what you learned, and accumulate what you learned
// from. Goals and Inbox are gone as destinations — a goal belongs to the project
// it serves, and an unfiled capture surfaces at the top of Projects.
//
// Each tab names the tool it opens, and a tab only renders when the server says
// this caller may call it. So a stranger sees the declaration and the library;
// the owner sees the same page with more of it. One boundary, already enforced
// twice on the server, deciding the navigation too — rather than a second
// public frontend that drifts from this one.
const NAV_ITEMS = [
  { label: "Writing", tool: "LIST_PUBLIC_WRITING" },
  { label: "Declaration", tool: "GET_DECLARATION" },
  { label: "Projects", tool: "GET_PORTFOLIO" },
  { label: "Analytics", tool: "SITES_OVERVIEW" },
  { label: "Learning", tool: "RECALL_MEMORY" },
  { label: "Bookmarks", tool: "LIST_ALL_BOOKMARKS", publicTool: "LIST_BOOKMARKS" },
] as const;

export function App() {
  const {
    connected,
    loading,
    toolName,
    toolResult,
    error,
    callTool,
    available,
    signedIn,
  } = useMcp();
  const initialized = useRef(false);
  const bookmarksActive = isBookmarkTool(toolName);

  // Inside an MCP host the tool list is not fetched, so nothing is filtered out.
  const nav = STANDALONE
    ? NAV_ITEMS.map((item) => ({
        ...item,
        tool:
          "publicTool" in item && !available.includes(item.tool)
            ? item.publicTool
            : item.tool,
      })).filter((item) => available.includes(item.tool))
    : NAV_ITEMS.map((item) => ({ ...item, tool: item.tool as string }));

  useEffect(() => {
    if (!connected || initialized.current) return;
    if (STANDALONE && !nav.length) return;
    initialized.current = true;
    const bootFlag = (window as { __BOOT_TOOL__?: string }).__BOOT_TOOL__;
    void callTool(bootFlag ?? toolName ?? nav[0]?.tool ?? "GET_DECLARATION");
  }, [callTool, connected, nav, toolName]);

  return (
    <main className={`shell ${bookmarksActive ? "bookmarks-shell" : ""}`}>
      {/* The header is full-bleed with its rule spanning the viewport, and only
          its contents are constrained — same as vibegui.com, where a centered
          box for everything would put the rule in the wrong place. */}
      <header className="topbar">
        <div className="container topbar-inner">
        <p className="os-label">{declaration.name ?? "Worldview"}</p>

        <nav className="nav" aria-label="Worldview views">
          {nav.map((item) => (
            <button
              type="button"
              key={item.tool}
              className={
                toolName === item.tool ||
                (item.tool === "LIST_ALL_BOOKMARKS" && bookmarksActive)
                  ? "active"
                  : ""
              }
              onClick={() => void callTool(item.tool)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {STANDALONE && <ThemeToggle />}

        {STANDALONE ? (
          signedIn && (
            <form method="post" action="/logout">
              <button type="submit" className="signout">
                Sign out
              </button>
            </form>
          )
        ) : (
          <span className={`connection ${connected ? "online" : ""}`}>
            {connected ? "Private Studio" : "Connecting"}
          </span>
        )}
        </div>
      </header>

      <section className="container content" aria-live="polite">
        <ResultView
          toolName={toolName}
          result={asRecord(toolResult)}
          callTool={callTool}
          loading={loading}
          error={error}
        />
      </section>
    </main>
  );
}

/**
 * Light and dark, remembered. The same control and the same storage key as
 * vibegui.com, so a reader who set a preference on one keeps it on the other.
 * Hidden inside an MCP host, where the host owns the theme.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function ResultView({
  toolName,
  result,
  callTool,
  loading,
  error,
}: {
  toolName?: string;
  result: JsonRecord;
  callTool: <T>(name: string, args?: Record<string, unknown>) => Promise<T>;
  loading: boolean;
  error?: string;
}) {
  if (isBookmarkTool(toolName) || Array.isArray(result.bookmarks)) {
    return (
      <BookmarksView
        activeTool={toolName}
        result={result}
        loading={loading}
        error={error}
        callTool={callTool}
      />
    );
  }
  if (loading) return <Loading />;
  if (error) return <div className="error">{error}</div>;
  if (toolName === "LIST_PUBLIC_WRITING" || Array.isArray(result.writing)) {
    return (
      <WritingView
        articles={asRecords(result.writing)}
        hero={declaration.hero ?? null}
      />
    );
  }
  if (toolName === "SITES_OVERVIEW" || Array.isArray(result.sites)) {
    return <AnalyticsView result={result} callTool={callTool} />;
  }
  if (toolName === "GET_PORTFOLIO" || Array.isArray(result.projects)) {
    return (
      <PortfolioView
        result={result}
        openProject={(id) => void callTool("GET_PROJECT", { id })}
        prepareBrief={() => void callTool("GET_DAILY_BRIEF_INPUT")}
      />
    );
  }
  if ("project" in result) {
    return (
      <ProjectView
        result={result}
        back={() => void callTool("GET_PORTFOLIO")}
      />
    );
  }
  if (toolName === "LIST_GOALS" || Array.isArray(result.goals)) {
    return <GoalsView goals={asRecords(result.goals)} />;
  }
  if (toolName === "GET_INBOX" || Array.isArray(result.captures)) {
    return <InboxView captures={asRecords(result.captures)} />;
  }
  if (toolName === "RECALL_MEMORY" || Array.isArray(result.memories)) {
    return <MemoryView memories={asRecords(result.memories)} />;
  }
  if (toolName === "GET_DAILY_BRIEF" || "brief" in result) {
    return (
      <BriefView
        brief={asNullableRecord(result.brief)}
        prepare={() => void callTool("GET_DAILY_BRIEF_INPUT")}
      />
    );
  }
  if (toolName === "GET_DAILY_BRIEF_INPUT") {
    return <BriefInputView result={result} />;
  }
  if (
    toolName === "GET_DECLARATION" ||
    "what_my_life_is_about" in result ||
    "markdown" in result
  ) {
    // GET_DECLARATION answers three questions; the long-form charter markdown
    // still comes from DECLARATION.md in git, nested under the first one.
    const about = asNullableRecord(result.what_my_life_is_about);
    const game = asNullableRecord(result.what_game_i_am_playing);
    const longForm = asNullableRecord(about?.long_form);
    const scores = asNullableRecord(result.am_i_playing_it_well);
    return (
      <DeclarationView
        declaredFuture={text(about?.declared_future)}
        markdown={text(longForm?.markdown ?? result.markdown)}
        source={text(longForm?.source ?? result.source)}
        conditions={asStrings(game?.conditions_of_satisfaction)}
        strategicResults={asRecords(
          game?.strategic_results ?? result.strategic_results,
        )}
        scores={scores}
        diagnostics={asRecords(result.diagnostics ?? result.scorecard)}
      />
    );
  }
  if (Object.keys(result).length === 0) {
    return <Empty message="Choose a view to begin." />;
  }
  return <JsonFallback value={result} />;
}

/**
 * The essays, newest first — the same list vibegui.com opens on.
 *
 * Titles link out to the site rather than rendering here: the article pages are
 * prerendered there with their own metadata, and re-rendering them in a client
 * app would trade real URLs for a worse copy.
 */
function WritingView({
  articles,
  hero,
}: {
  articles: JsonRecord[];
  hero: Hero | null;
}) {
  if (!articles.length && !hero) {
    return <Empty message="No published writing yet." />;
  }
  return (
    <>
      {hero && <HeroBlock hero={hero} />}
      <div className="writing-list">
      {articles.map((article) => (
        <article className="writing-item" key={text(article.slug)}>
          <p className="writing-date">{longDate(article.date)}</p>
          <h2>
            <a href={text(article.url)} target="_blank" rel="noreferrer">
              {text(article.title)}
            </a>
          </h2>
          {text(article.description) && <p>{text(article.description)}</p>}
          <a
            className="writing-more"
            href={text(article.url)}
            target="_blank"
            rel="noreferrer"
          >
            Read essay <span aria-hidden="true">→</span>
          </a>
        </article>
      ))}
      </div>
    </>
  );
}

/**
 * The masthead: who this is, before anything they made.
 *
 * Every field is optional except the title, because an instance is a person and
 * not all of them have a photo or a second link.
 */
function HeroBlock({ hero }: { hero: Hero }) {
  return (
    <header className="hero">
      <div className="hero-copy">
        {hero.eyebrow && <p className="hero-eyebrow">{hero.eyebrow}</p>}
        <h1>{hero.title}</h1>
        {hero.intro && <p className="hero-intro">{inlineLinks(hero.intro)}</p>}
        {hero.links && hero.links.length > 0 && (
          <p className="hero-links">
            {hero.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            ))}
          </p>
        )}
      </div>
      {hero.avatar && <img className="hero-avatar" src={hero.avatar} alt="" />}
    </header>
  );
}

/**
 * `[text](href)` and nothing else.
 *
 * The intro needs one link — "co-founder of deco" — and a markdown renderer for
 * that is a dependency and an injection surface. Anything not matching stays
 * literal text, so an unclosed bracket renders as an unclosed bracket rather
 * than eating the rest of the sentence.
 */
function inlineLinks(source: string) {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > last) parts.push(source.slice(last, match.index));
    parts.push(
      <a key={`${match.index}`} href={match[2]} target="_blank" rel="noreferrer">
        {match[1]}
      </a>,
    );
    last = match.index + match[0].length;
    match = pattern.exec(source);
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}

function longDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw.length <= 10 ? `${raw}T12:00:00Z` : raw);
  return Number.isNaN(parsed.valueOf())
    ? raw
    : parsed.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function PortfolioView({
  result,
  openProject,
  prepareBrief,
}: {
  result: JsonRecord;
  openProject: (id: string) => void;
  prepareBrief: () => void;
}) {
  const projects = asRecords(result.projects);
  const unfiled = asRecords(result.unfiled);
  // The brief is working notes, so the public payload omits the key entirely.
  // Its empty state still says "prepare the current evidence", which is an
  // instruction to an owner who is not here.
  const operational = "daily_brief" in result;

  return (
    <>
      {operational && (
        <DailyBriefHomeCard
          brief={asNullableRecord(result.daily_brief)}
          prepare={prepareBrief}
        />
      )}

      {/* Captures that belong to no project yet. Everything else is reachable
          through the project it is filed under; this is the only home these
          have, and an inbox nobody sees is an inbox nobody empties. */}
      {unfiled.length > 0 && (
        <section className="unfiled">
          <p className="eyebrow">
            Unfiled · {unfiled.length}
          </p>
          <ul>
            {unfiled.map((capture) => (
              <li key={text(capture.id)}>
                <span className="unfiled-kind">{text(capture.kind)}</span>
                {text(capture.content)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="section-heading">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>{projects.length} projects</h2>
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty message="Your map is empty. Ask the agent to add your first project." />
      ) : (
        <div className="project-list">
          {projects.map((project) => (
            // GET_PROJECT is private, so publicly a card is a card, not a link
            // into a detail view that would answer with "Unknown tool".
            <button
              type="button"
              className={`project-card ${operational ? "" : "static"}`}
              key={text(project.id)}
              disabled={!operational}
              onClick={
                operational ? () => openProject(text(project.id)) : undefined
              }
            >
              <div className="project-identity">
                <div className="project-title">
                  <span className={`lifecycle ${text(project.lifecycle)}`}>
                    {text(project.lifecycle)}
                  </span>
                  <h3>{text(project.name)}</h3>
                </div>
                {/* The declared result this project pursues. Saying so when
                    there is none is the point — that project is why alignment
                    is not 100%. */}
                <p
                  className={`serves ${asStrings(project.serves).length ? "" : "none"}`}
                >
                  {asStrings(project.serves).length
                    ? `Serves · ${asStrings(project.serves)
                        .map((id) => resultTitles[id] ?? id)
                        .join(" · ")}`
                    : "Serves nothing declared"}
                </p>
                <p className="spirit">
                  {text(project.spirit) || text(project.description)}
                </p>
                {operational && (
                  <footer>
                    <span>{number(project.active_goal_count)} active goals</span>
                    <span>
                      {number(project.open_work_item_count)} open items
                    </span>
                    <span>{relativeTime(project.last_activity_at)}</span>
                  </footer>
                )}
              </div>
              <div className="project-outcome">
                <span className="project-label">Current outcome</span>
                <p>{text(project.current_outcome) || "Outcome not declared"}</p>
              </div>
              <ProjectProgress project={project} />
              <span className="project-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function DailyBriefHomeCard({
  brief,
  prepare,
}: {
  brief: JsonRecord | null;
  prepare: () => void;
}) {
  return (
    <section className="daily-brief-card">
      <header>
        <div>
          <p className="eyebrow">Daily brief</p>
          <h2>{brief ? text(brief.brief_date) : "Start the day oriented"}</h2>
        </div>
        <button type="button" onClick={prepare}>
          {brief ? "Refresh evidence" : "Prepare brief"}
        </button>
      </header>
      {brief ? (
        <p className="daily-brief-copy">{text(brief.content)}</p>
      ) : (
        <p className="daily-brief-empty">
          No brief has been saved yet. Prepare the current evidence, then ask
          your Studio agent to synthesize and save today’s brief.
        </p>
      )}
    </section>
  );
}

function ProjectProgress({ project }: { project: JsonRecord }) {
  const rawProgress = project.progress_percent;
  const assessed =
    typeof rawProgress === "number" ||
    (typeof rawProgress === "string" && rawProgress !== "");
  const progress = assessed
    ? Math.min(100, Math.max(0, number(rawProgress)))
    : 0;

  return (
    <div className="project-progress">
      <div className="progress-heading">
        <span className="project-label">Progress</span>
        <strong>{assessed ? `${progress}%` : "Unscored"}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${text(project.name)} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={assessed ? progress : undefined}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>{text(project.progress_note) || "Set an honest assessment"}</p>
    </div>
  );
}

function ProjectView({
  result,
  back,
}: {
  result: JsonRecord;
  back: () => void;
}) {
  const project = asRecord(result.project);
  const goals = asRecords(result.goals);
  const memories = asRecords(result.memories);
  const decisions = asRecords(result.decisions);
  const workItems = asRecords(result.work_items);
  const activity = asRecords(result.activity);

  return (
    <>
      <button type="button" className="back" onClick={back}>
        ← All projects
      </button>
      <section className="hero-card">
        <span className={`lifecycle ${text(project.lifecycle)}`}>
          {text(project.lifecycle)}
        </span>
        <h2>{text(project.name)}</h2>
        <p>{text(project.spirit) || text(project.description)}</p>
        <div className="declared-outcome">
          <strong>Current outcome</strong>
          <span>{text(project.current_outcome) || "Not declared"}</span>
        </div>
        <ProjectProgress project={project} />
      </section>
      <section className="project-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Where you are</p>
            <h2>Current state</h2>
          </div>
        </div>
        <div className="current-state-grid">
          <article className="panel">
            <p className="project-label">Current outcome</p>
            <strong>{text(project.current_outcome) || "Not declared"}</strong>
          </article>
          <article className="panel">
            <p className="project-label">Latest activity</p>
            <strong>
              {activity.length > 0
                ? relativeTime(activity[0]?.occurred_at)
                : "No activity yet"}
            </strong>
          </article>
          <article className="panel">
            <p className="project-label">Next review</p>
            <strong>{text(project.next_review) || "Not scheduled"}</strong>
          </article>
        </div>
      </section>

      <section className="project-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Overall project plan</p>
            <h2>Next steps</h2>
          </div>
        </div>
        {goals.length > 0 ? (
          <GoalsView goals={goals} />
        ) : (
          <Empty message="No project goals yet. Ask the agent to define the next concrete outcome." />
        )}
      </section>

      <section className="project-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GitHub</p>
            <h2>Open issues and pull requests</h2>
          </div>
          <span className="muted">{workItems.length} open</span>
        </div>
        <WorkItemsView items={workItems} />
      </section>

      <div className="columns project-context">
        <ListPanel
          title="Memory"
          items={memories}
          primary="content"
          secondary="source"
        />
        <ListPanel
          title="Decisions"
          items={decisions}
          primary="title"
          secondary="decision"
        />
      </div>
    </>
  );
}

function WorkItemsView({ items }: { items: JsonRecord[] }) {
  if (items.length === 0) {
    return <Empty message="No open GitHub issues or pull requests." />;
  }

  return (
    <div className="work-items">
      {items.map((item) => (
        <a
          href={text(item.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="work-item"
          key={text(item.id)}
        >
          <span className="mode maintain">
            {text(item.kind) === "pull_request" ? "PR" : "Issue"} #
            {number(item.number)}
          </span>
          <strong>{text(item.title)}</strong>
          <span className="work-item-author">
            {text(item.author) || "GitHub"} ↗
          </span>
        </a>
      ))}
    </div>
  );
}

export function AnalyticsView({
  result,
  callTool,
}: {
  result: JsonRecord;
  callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
}) {
  const days = number(result.days) || 7;
  const filters = (result.filters ?? {}) as JsonRecord;
  const filtro = (dim: string) => text(filters[dim]) || null;
  const siteFilter = filtro("site") || text(result.site) || null;
  const sites = asRecords(result.sites);
  const series = asRecords(result.series);
  const dimensions = (result.dimensions ?? {}) as JsonRecord;
  const evento = text(result.name) || "pageview";
  const [metric, setMetric] = useState<"visitors" | "pageviews">("visitors");

  const somaSites = (row: JsonRecord, key: "pageviews" | "visitors") =>
    Object.values(
      (row.sites ?? {}) as Record<string, Record<string, unknown>>,
    ).reduce((n, v) => n + (Number(v[key]) || 0), 0);
  const totalPageviews = series.reduce(
    (n, r) => n + somaSites(r, "pageviews"),
    0,
  );
  const totalVisitors = series.reduce(
    (n, r) => n + somaSites(r, "visitors"),
    0,
  );
  const perVisitor = totalVisitors
    ? (totalPageviews / totalVisitors).toFixed(1)
    : "—";

  const ativos: Record<string, string> = {};
  for (const dim of FILTER_DIMS) {
    const valor = dim === "site" ? siteFilter : filtro(dim);
    if (valor) ativos[dim] = valor;
  }

  const reload = (args: Record<string, unknown>) => {
    const merged: Record<string, unknown> = {
      days,
      name: evento,
      ...ativos,
      ...args,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === null || v === "") delete merged[k];
    }
    void callTool("SITES_OVERVIEW", merged);
  };

  // clicar de novo na mesma linha remove o filtro daquela dimensão
  const toggle = (patch: Record<string, string>) => {
    const igual = Object.entries(patch).every(([k, v]) => ativos[k] === v);
    reload(
      Object.fromEntries(
        Object.keys(patch).map((k) => [k, igual ? undefined : patch[k]]),
      ),
    );
  };

  return (
    <div className="analytics">
      <div className="analytics-head">
        <div className="analytics-chips">
          <button
            type="button"
            className={siteFilter ? "" : "active"}
            onClick={() => reload({ site: undefined })}
          >
            Todos os sites
          </button>
          {sites.map((site) => (
            <button
              type="button"
              key={text(site.site)}
              className={siteFilter === text(site.site) ? "active" : ""}
              onClick={() => toggle({ site: text(site.site) })}
            >
              {text(site.site)}
            </button>
          ))}
        </div>
        <div className="analytics-range">
          {[
            { valor: "pageview", rotulo: "pageviews" },
            { valor: "blocked", rotulo: "barrados" },
          ].map(({ valor, rotulo }) => (
            <button
              type="button"
              key={valor}
              className={evento === valor ? "active" : ""}
              onClick={() => reload({ name: valor })}
              title={
                valor === "blocked"
                  ? "Rotas inexistentes barradas com 404 (varredura de scanner)"
                  : "Páginas servidas de verdade"
              }
            >
              {rotulo}
            </button>
          ))}
          {[7, 30, 90].map((option) => (
            <button
              type="button"
              key={option}
              className={days === option ? "active" : ""}
              onClick={() => reload({ days: option })}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {Object.keys(ativos).filter((dim) => dim !== "site").length > 0 && (
        <div className="analytics-filters">
          {Object.entries(ativos)
            .filter(([dim]) => dim !== "site")
            .map(([dim, valor]) => (
              <button
                type="button"
                key={dim}
                onClick={() => reload({ [dim]: undefined })}
                title={`Remover filtro ${FILTER_LABEL[dim]}`}
              >
                {FILTER_LABEL[dim]}:{" "}
                <strong>
                  {dim === "country" ? countryLabel(valor) : valor}
                </strong>{" "}
                ×
              </button>
            ))}
        </div>
      )}

      <div className="analytics-stats">
        <button
          type="button"
          className={`stat ${metric === "visitors" ? "active" : ""}`}
          onClick={() => setMetric("visitors")}
        >
          <strong>{totalVisitors.toLocaleString("pt-BR")}</strong>
          <span>visitantes</span>
        </button>
        <button
          type="button"
          className={`stat ${metric === "pageviews" ? "active" : ""}`}
          onClick={() => setMetric("pageviews")}
        >
          <strong>{totalPageviews.toLocaleString("pt-BR")}</strong>
          <span>pageviews</span>
        </button>
        <div className="stat static">
          <strong>{perVisitor}</strong>
          <span>páginas por visitante</span>
        </div>
      </div>

      <TimelineChart series={series} metric={metric} />

      <div className="analytics-panels">
        {PANEIS.map(({ dim, titulo }) => {
          const linhas = asRecords(dimensions[dim]);
          if (linhas.length === 0) return null;
          return (
            <AnalyticsPanel
              key={dim}
              title={titulo}
              rows={linhas.map((linha) => {
                const chave = text(linha.key);
                const site = text(linha.site);
                const patch =
                  dim === "path" && site
                    ? { site, path: chave }
                    : { [dim]: chave };
                return {
                  key: `${site}${chave}`,
                  label: dim === "country" ? countryLabel(chave) : chave || "—",
                  hint: dim === "path" && !siteFilter ? site : undefined,
                  value: number(linha.pageviews),
                  active: Object.entries(patch).every(
                    ([k, v]) => ativos[k] === v,
                  ),
                  onSelect: () => toggle(patch),
                };
              })}
            />
          );
        })}
      </div>
    </div>
  );
}

// mesma ordem dos painéis; espelha DIMENSOES no worker (mcp/src/analytics.ts)
const PANEIS = [
  { dim: "path", titulo: "Páginas" },
  { dim: "ref", titulo: "Fontes" },
  { dim: "country", titulo: "Países" },
  { dim: "browser", titulo: "Navegador" },
  { dim: "os", titulo: "Sistema" },
  { dim: "device", titulo: "Aparelho" },
  { dim: "status", titulo: "Status HTTP" },
  { dim: "cache", titulo: "Cache" },
  { dim: "asn", titulo: "Rede (ASN)" },
  { dim: "ip", titulo: "Faixa de IP" },
  { dim: "colo", titulo: "Colo" },
] as const;
const FILTER_DIMS = ["site", ...PANEIS.map((p) => p.dim)] as const;
const FILTER_LABEL: Record<string, string> = {
  site: "site",
  path: "página",
  country: "país",
  ref: "fonte",
  status: "status",
  cache: "cache",
  browser: "navegador",
  os: "sistema",
  device: "aparelho",
  asn: "rede",
  ip: "IP",
  colo: "colo",
};

const METRIC_LABEL = {
  visitors: "visitantes",
  pageviews: "pageviews",
} as const;

// identidade fixa por site (paleta categórica validada p/ CVD nos dois temas)
const SITE_ORDER = [
  "vibegui.com",
  "poesiadairene.com",
  "buscamalvados.com",
  "outros",
] as const;
const SITE_VAR: Record<string, string> = {
  "vibegui.com": "var(--serie-vibegui)",
  "poesiadairene.com": "var(--serie-irene)",
  "buscamalvados.com": "var(--serie-malvados)",
  outros: "var(--serie-outros)",
};

function siteSlot(site: string): (typeof SITE_ORDER)[number] {
  return (SITE_ORDER as readonly string[]).includes(site)
    ? (site as (typeof SITE_ORDER)[number])
    : "outros";
}

interface StackDay {
  day: string;
  total: number;
  segments: Array<{ site: string; value: number }>;
  pageviews: number;
  visitors: number;
}

function TimelineChart({
  series,
  metric,
}: {
  series: JsonRecord[];
  metric: "visitors" | "pageviews";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 190;
  const PAD_BOTTOM = 22;
  const PAD_TOP = 12;
  const plotH = H - PAD_BOTTOM - PAD_TOP;

  // agrega os hosts fora do trio canônico em "outros", na ordem fixa
  const stack: StackDay[] = series.map((row) => {
    const sites = (row.sites ?? {}) as Record<
      string,
      { pageviews?: number; visitors?: number }
    >;
    const bySlot = new Map<string, { pageviews: number; visitors: number }>();
    for (const [site, v] of Object.entries(sites)) {
      const slot = siteSlot(site);
      const cur = bySlot.get(slot) ?? { pageviews: 0, visitors: 0 };
      cur.pageviews += Number(v.pageviews) || 0;
      cur.visitors += Number(v.visitors) || 0;
      bySlot.set(slot, cur);
    }
    const segments = SITE_ORDER.filter((slot) => bySlot.has(slot)).map(
      (slot) => ({ site: slot, value: bySlot.get(slot)![metric] }),
    );
    return {
      day: text(row.day),
      total: segments.reduce((n, seg) => n + seg.value, 0),
      segments,
      pageviews: [...bySlot.values()].reduce((n, v) => n + v.pageviews, 0),
      visitors: [...bySlot.values()].reduce((n, v) => n + v.visitors, 0),
    };
  });

  const presentes = SITE_ORDER.filter((slot) =>
    stack.some((d) =>
      d.segments.some((seg) => seg.site === slot && seg.value > 0),
    ),
  );
  const max = Math.max(1, ...stack.map((d) => d.total));
  const n = Math.max(1, stack.length);
  const step = W / n;
  const barW = Math.max(3, Math.min(28, step - 2));
  const labelEvery = Math.ceil(n / 6);
  const GAP = 2;

  const dayLabel = (iso: string, long = false) => {
    const [, month, dayOfMonth] = iso.split("-");
    return long ? `${dayOfMonth}/${month}` : `${Number(dayOfMonth)}`;
  };

  const hovered = hover !== null ? stack[hover] : null;

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        {presentes.map((slot) => (
          <span key={slot}>
            <i style={{ background: SITE_VAR[slot] }} />
            {slot}
          </span>
        ))}
      </div>
      {hovered && (
        <div
          className="chart-tooltip"
          style={{ left: `${((hover! + 0.5) / n) * 100}%` }}
        >
          <strong>{dayLabel(hovered.day, true)}</strong>
          {hovered.segments
            .filter((seg) => seg.value > 0)
            .map((seg) => (
              <span key={seg.site}>
                <i style={{ background: SITE_VAR[seg.site] }} />
                {seg.site}: {seg.value.toLocaleString("pt-BR")}
              </span>
            ))}
          <em>
            {hovered.total.toLocaleString("pt-BR")} {METRIC_LABEL[metric]}
          </em>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={`${METRIC_LABEL[metric]} por dia, por site`}
        onMouseLeave={() => setHover(null)}
      >
        {[0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              className="chart-grid"
              x1={0}
              x2={W}
              y1={PAD_TOP + plotH * (1 - fraction)}
              y2={PAD_TOP + plotH * (1 - fraction)}
            />
            <text
              className="chart-axis"
              x={W - 4}
              y={PAD_TOP + plotH * (1 - fraction) - 4}
              textAnchor="end"
            >
              {Math.round(max * fraction).toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        <line
          className="chart-baseline"
          x1={0}
          x2={W}
          y1={PAD_TOP + plotH}
          y2={PAD_TOP + plotH}
        />
        {stack.map((diaData, index) => {
          const x = index * step + (step - barW) / 2;
          let yCursor = PAD_TOP + plotH;
          const visiveis = diaData.segments.filter((seg) => seg.value > 0);
          return (
            <g
              key={diaData.day}
              opacity={hover === null || hover === index ? 1 : 0.55}
            >
              {visiveis.map((seg, segIndex) => {
                const h = Math.max(
                  1.5,
                  (seg.value / max) * (plotH - 4) - (segIndex > 0 ? GAP : 0),
                );
                const isTop = segIndex === visiveis.length - 1;
                const y = yCursor - h - (segIndex > 0 ? GAP : 0);
                yCursor = y;
                const r = Math.min(4, barW / 2, h);
                const d = isTop
                  ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`
                  : `M${x},${y + h} V${y} H${x + barW} V${y + h} Z`;
                return <path key={seg.site} d={d} fill={SITE_VAR[seg.site]} />;
              })}
              {index % labelEvery === 0 && (
                <text
                  className="chart-axis"
                  x={index * step + step / 2}
                  y={H - 6}
                  textAnchor="middle"
                >
                  {dayLabel(diaData.day, n <= 14)}
                </text>
              )}
              <rect
                className="chart-hit"
                x={index * step}
                y={0}
                width={step}
                height={H}
                onMouseEnter={() => setHover(index)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AnalyticsPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    hint?: string;
    value: number;
    active?: boolean;
    onSelect?: () => void;
  }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="analytics-list">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="empty">Nada ainda.</p>}
      <ul>
        {rows.map((row) => {
          const conteudo = (
            <>
              <span
                className="analytics-fill"
                style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              />
              <span className="analytics-path">
                {row.hint && <em>{row.hint}</em>}
                {row.label}
              </span>
              <strong>{row.value.toLocaleString("pt-BR")}</strong>
            </>
          );
          return (
            <li key={row.key}>
              {row.onSelect ? (
                <button
                  type="button"
                  className="analytics-row"
                  aria-pressed={Boolean(row.active)}
                  onClick={row.onSelect}
                >
                  {conteudo}
                </button>
              ) : (
                <div className="analytics-row">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function countryLabel(code: string): string {
  if (!code || code === "?") return "Desconhecido";
  try {
    const name = new Intl.DisplayNames(["pt"], { type: "region" }).of(code);
    const flag = code
      .toUpperCase()
      .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
    return `${flag} ${name ?? code}`;
  } catch {
    return code;
  }
}

function GoalsView({ goals }: { goals: JsonRecord[] }) {
  if (goals.length === 0) {
    return <Empty message="No active goals. Ask the agent to declare one." />;
  }
  return (
    <div className="stack">
      {goals.map((goal) => (
        <article className="list-card" key={text(goal.id)}>
          <header>
            <span className="mode maintain">
              {text(goal.project_name) || "Portfolio"}
            </span>
            <span className="muted">
              {text(goal.next_review) || text(goal.horizon)}
            </span>
          </header>
          <h3>{text(goal.title)}</h3>
          <p>{text(goal.desired_outcome)}</p>
          {text(goal.current_assessment) && (
            <blockquote>{text(goal.current_assessment)}</blockquote>
          )}
        </article>
      ))}
    </div>
  );
}

function InboxView({ captures }: { captures: JsonRecord[] }) {
  if (captures.length === 0) {
    return <Empty message="Inbox zero. There is space to think." />;
  }
  return (
    <div className="stack">
      {captures.map((capture) => (
        <article className="list-card" key={text(capture.id)}>
          <header>
            <span className="mode incubate">{text(capture.kind)}</span>
            <span className="muted">{relativeTime(capture.created_at)}</span>
          </header>
          <p>{text(capture.content)}</p>
          <small>{text(capture.project_name) || "Unassigned"}</small>
        </article>
      ))}
    </div>
  );
}

function MemoryView({ memories }: { memories: JsonRecord[] }) {
  if (memories.length === 0) {
    return <Empty message="No durable memories yet." />;
  }
  return (
    <div className="stack">
      {memories.map((memory) => (
        <article className="list-card" key={text(memory.id)}>
          <header>
            <span className="mode maintain">{text(memory.kind)}</span>
            <span className="muted">
              {Math.round(number(memory.confidence) * 100)}% confidence
            </span>
          </header>
          <p>{text(memory.content)}</p>
          <small>Source: {text(memory.source)}</small>
        </article>
      ))}
    </div>
  );
}

function BriefView({
  brief,
  prepare,
}: {
  brief: JsonRecord | null;
  prepare: () => void;
}) {
  if (!brief) {
    return (
      <Empty
        message="No daily brief yet."
        action="Prepare today's evidence"
        onAction={prepare}
      />
    );
  }
  return (
    <article className="brief">
      <p className="eyebrow">{text(brief.brief_date)}</p>
      <div className="brief-copy">{text(brief.content)}</div>
    </article>
  );
}

function BriefInputView({ result }: { result: JsonRecord }) {
  return (
    <article className="brief">
      <p className="eyebrow">Evidence ready · {text(result.brief_date)}</p>
      <h2>Ask your agent to write today’s brief.</h2>
      <p>
        The state packet is now in model context: goals, attention evidence,
        stale projects, decisions, and inbox.
      </p>
    </article>
  );
}

function DeclarationView({
  declaredFuture,
  markdown,
  source,
  conditions,
  strategicResults,
  scores,
  diagnostics,
}: {
  declaredFuture: string;
  markdown: string;
  source: string;
  conditions: string[];
  strategicResults: JsonRecord[];
  scores: JsonRecord | null;
  diagnostics: JsonRecord[];
}) {
  const [charterExpanded, setCharterExpanded] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  if (!declaredFuture && !markdown && !conditions.length) {
    return <Empty message="The declaration could not be loaded." />;
  }
  const charter = extractDeclarationSection(
    markdown,
    "## Charter",
    "## Strategic Outcomes",
  );
  // The declaration is authoritative for both the statement and the conditions;
  // the long-form markdown is optional detail that most instances never publish.
  // Scraping it is only a fallback for a declaration written before the
  // conditions moved into worldview.json.
  const conditionItems = conditions.length
    ? conditions
    : extractDeclarationSection(
        markdown,
        "## Conditions of Satisfaction",
        "## December 2026 Scorecard",
      ).bullets;
  const statement = declaredFuture || charter.paragraphs[0] || "";
  const alignment = asNullableRecord(scores?.alignment);
  const integrity = asNullableRecord(scores?.integrity);

  return (
    <article className="declaration">
      {/* The two questions that matter share the first screen: what my life is
          about on the left, whether I am playing it well on the right. The
          scores used to sit below a full-width charter, which put the only
          numbers in the system under a fold. */}
      <div className="declaration-hero">
      <section className="charter-card">
        <p className="eyebrow">What my life is about</p>
        {statement.split("\n\n").map((paragraph) => (
          <p className="charter-statement" key={paragraph.slice(0, 40)}>
            {cleanMarkdown(paragraph)}
          </p>
        ))}
        {charter.bullets.length > 0 && (
          <>
            <button
              type="button"
              className="charter-toggle"
              aria-expanded={charterExpanded}
              onClick={() => setCharterExpanded((expanded) => !expanded)}
            >
              {charterExpanded
                ? "Hide the full charter"
                : "Read the full charter"}
              <span aria-hidden="true">{charterExpanded ? "↑" : "↓"}</span>
            </button>
            {charterExpanded && (
              <ul className="charter-details">
                {charter.bullets.map((item) => (
                  <li key={item}>{cleanMarkdown(item)}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="declaration-block scores-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Two scores, no others</p>
            <h2>Am I playing it well?</h2>
          </div>
        </div>
        <div className="scorecard-grid scores-grid">
          {alignment && <ScoreCard score={alignment} />}
          {integrity && <ScoreCard score={integrity} />}
        </div>
      </section>
      </div>

      <section className="declaration-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">What game I am playing</p>
            <h2>Strategic results</h2>
          </div>
        </div>
        <div className="strategic-results">
          {strategicResults.map((result) => (
            <StrategicResultCard key={text(result.id)} result={result} />
          ))}
        </div>
      </section>

      <section className="declaration-block conditions">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Regardless of circumstances</p>
            <h2>Conditions of satisfaction</h2>
          </div>
        </div>
        <ul>
          {conditionItems.map((item) => (
            <li key={item}>{cleanMarkdown(item)}</li>
          ))}
        </ul>
      </section>

      {diagnostics.length > 0 && (
        <section className="declaration-block">
          <button
            type="button"
            className="charter-toggle"
            aria-expanded={diagnosticsExpanded}
            onClick={() => setDiagnosticsExpanded((expanded) => !expanded)}
          >
            {diagnosticsExpanded ? "Hide diagnostics" : "Show diagnostics"}
            <span aria-hidden="true">{diagnosticsExpanded ? "↑" : "↓"}</span>
          </button>
          {diagnosticsExpanded && (
            <div className="scorecard-grid">
              {diagnostics.map((item) => (
                <ScorecardItem key={text(item.id)} item={item} />
              ))}
            </div>
          )}
        </section>
      )}

      {source && (
        <footer>
          <a href={source} target="_blank" rel="noopener noreferrer">
            View canonical declaration on GitHub ↗
          </a>
        </footer>
      )}
    </article>
  );
}

/**
 * Integrity deliberately gets no progress bar: it counts unacknowledged
 * commitments toward zero, and a percentage on it would be a category error.
 */
function ScoreCard({ score }: { score: JsonRecord }) {
  const countToZero = text(score.kind) === "count-to-zero";
  const raw = score.current_value;
  const measured = raw !== null && raw !== undefined;
  const domains = asNullableRecord(score.domains);

  return (
    <article className="scorecard-item score-card">
      <p>{text(score.label)}</p>
      {measured ? (
        <strong className={countToZero && number(raw) > 0 ? "not-yet" : "yes"}>
          {number(raw)}
          {!countToZero && <span> / 100</span>}
        </strong>
      ) : (
        <strong className="not-yet">Not yet measured</strong>
      )}
      <small>{text(score.question)}</small>
      <small>{text(score.measure)}</small>
      {/* Where the number came from. A score you cannot open is a rumor, so the
          working is part of the score, not a tooltip. */}
      {text(score.note) && <small className="score-note">{text(score.note)}</small>}
      {domains && (
        <ul className="charter-details">
          {["word", "systems", "objects"].map((key) => (
            <li key={key}>
              <strong>{key}</strong> — {text(domains[key])}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function StrategicResultCard({ result }: { result: JsonRecord }) {
  const progress = Math.min(100, Math.max(0, number(result.progress_percent)));
  const criteria = asStrings(result.acceptance_criteria);
  const metrics = asRecords(result.metrics);

  return (
    <article className="strategic-result">
      <header>
        <div>
          <p className="eyebrow">
            Result {String(number(result.position)).padStart(2, "0")}
            {" · "}
            {/* Declared progress next to how much active work actually points
                here. A result at 40% with no projects is the gap the whole
                system exists to show. */}
            <span
              className={
                number(result.active_project_count) === 0 ? "serves none" : ""
              }
            >
              {number(result.active_project_count) === 1
                ? "1 project"
                : `${number(result.active_project_count)} projects`}
            </span>
          </p>
          <h3>{text(result.title)}</h3>
        </div>
        <strong className="result-progress">{progress}%</strong>
      </header>
      <p className="result-narrative">{text(result.narrative)}</p>
      <div className="result-progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="result-progress-note">{text(result.progress_note)}</p>
      <div className="result-details">
        <div>
          <p className="project-label">Acceptance criteria</p>
          <ul>
            {criteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="project-label">Metrics</p>
          <div className="result-metrics">
            {metrics.map((metric) => {
              // Metrics are declared in git with a target only; nothing in D1
              // measures them yet. Rendering `0 / target` asserted a zero for
              // every one of them, which is a number nobody produced.
              const measured =
                metric.current !== null && metric.current !== undefined;
              return (
                <div key={text(metric.label)}>
                  <strong className={measured ? undefined : "unmeasured"}>
                    {measured
                      ? `${number(metric.current)} / ${number(metric.target)}`
                      : `target ${number(metric.target)}`}
                  </strong>
                  <span>
                    {text(metric.label)} · {text(metric.unit)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function ScorecardItem({ item }: { item: JsonRecord }) {
  const isBoolean = text(item.kind) === "boolean";
  const current = number(item.current_value);
  const target = number(item.target_value);
  const ratio =
    !isBoolean && target > 0
      ? Math.min(100, Math.max(0, (current / target) * 100))
      : 0;
  const yes = number(item.boolean_value) === 1;

  return (
    <article className={`scorecard-item ${isBoolean ? "boolean" : ""}`}>
      <p>{text(item.label)}</p>
      {isBoolean ? (
        <strong className={yes ? "yes" : "not-yet"}>
          {yes ? "Yes" : "Not yet"}
        </strong>
      ) : (
        <>
          <strong>
            {current} <span>/ {target}</span>
          </strong>
          <div className="scorecard-track">
            <span style={{ width: `${ratio}%` }} />
          </div>
          <small>{text(item.unit)}</small>
        </>
      )}
      {text(item.note) && <small>{text(item.note)}</small>}
    </article>
  );
}

function extractDeclarationSection(
  markdown: string,
  startHeading: string,
  endHeading: string,
): { paragraphs: string[]; bullets: string[] } {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  if (start < 0) return { paragraphs: [], bullets: [] };
  const body = markdown.slice(
    start + startHeading.length,
    end < 0 ? undefined : end,
  );
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  for (const sourceLine of body.split("\n")) {
    const line = sourceLine.trim();
    if (!line) continue;
    if (line.startsWith("- ")) bullets.push(line.slice(2));
    else if (!line.startsWith("#")) paragraphs.push(line);
  }
  return { paragraphs, bullets };
}

function cleanMarkdown(value: string): string {
  return value.replace(/\*\*/g, "").replace(/`/g, "");
}

function ListPanel({
  title,
  items,
  primary,
  secondary,
}: {
  title: string;
  items: JsonRecord[];
  primary: string;
  secondary: string;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">{title}</p>
      {items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        items.slice(0, 6).map((item) => (
          <div className="panel-item" key={text(item.id)}>
            <strong>{text(item[primary])}</strong>
            <span>{text(item[secondary])}</span>
          </div>
        ))
      )}
    </section>
  );
}

function Empty({
  message,
  action,
  onAction,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <p>{message}</p>
      {action && onAction && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="loading">
      <span />
      <span />
      <span />
    </div>
  );
}

function JsonFallback({ value }: { value: JsonRecord }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asNullableRecord(value: unknown): JsonRecord | null {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function relativeTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "No activity yet";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
