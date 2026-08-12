-- Local demo data. Applied only by `bun run demo` / `bun run demo:seed`, which
-- pass --local; there is deliberately no remote variant.
--
-- Measurement only. The declaration this measures against is worldview.json, so
-- the strategic_results ids below have to match it exactly — tests/demo.test.ts
-- fails in both directions if they drift.
--
-- Every row is greppable: ids start with 'demo-', bookmarks use id >= 9000,
-- analytics events use id >= 900000. Every timestamp is relative to now, so this
-- file never goes stale. Re-running it replaces the demo rows and nothing else.
--
-- Clear it with `bun run demo:reset`.

------------------------------------------------------------------- projects
-- Never DELETE a project: it cascades into decisions, whose immutability
-- trigger aborts the delete. Upsert instead.
-- `serves` names the declared strategic result each project pursues, and is what
-- the alignment score counts. demo-files deliberately serves nothing: a project
-- with no declared outcome is a real situation, and a demo where alignment is
-- 100% would be a demo of a score that never says anything.
INSERT INTO projects
  (id, name, description, spirit, repository, lifecycle,
   current_outcome, success_criteria, next_review,
   progress_percent, progress_note, position, serves, updated_at)
VALUES
  ('demo-worldview', 'Worldview OS',
   'The scorekeeper: declaration in git, measurement in D1, two scores.',
   'A scorekeeper with no hands.',
   'https://github.com/example/worldview', 'active',
   'One person who is not me runs their own deployment.',
   'A stranger reaches a useful first brief from the documentation alone.',
   date('now', '+3 days'), 55,
   'Standalone deployment and browser access work; nobody outside has deployed it yet.',
   1, 'agency', CURRENT_TIMESTAMP),
  ('demo-atlas', 'Atlas',
   'The distinction graph: essays, sources, and guided paths that actually land.',
   'A method nobody can copy is a hobby.',
   'https://github.com/example/atlas', 'active',
   'Twelve distinctions have an essay, a graph position, and a guided path.',
   'Readers complete real guided conversations.',
   date('now', '+9 days'), 20,
   'Corpus and retrieval exist. The graph does not. Four essays drafted, none placed.',
   2, 'understanding', CURRENT_TIMESTAMP),
  ('demo-library', 'Library',
   'Books and primary sources mapped to the concepts they actually changed.',
   'A pile of content is not a library.',
   NULL, 'active',
   'Twenty sources mapped with provenance.',
   'Conversation signals enter a private review pipeline.',
   NULL, 15,
   'Import works. Nothing is mapped to a concept yet.',
   3, 'compounding', datetime('now', '-41 days')),
  -- Active, real, and pointed at nothing declared. This is the row that keeps
  -- alignment honest, and the one worth a decision: declare a result for it,
  -- fold it into another project, or archive it.
  ('demo-newsletter', 'Newsletter',
   'A weekly letter that started as an experiment and never stopped.',
   'It grew without ever being declared.',
   NULL, 'active',
   'Ship an issue every Tuesday.',
   'Unclear. That is the finding.',
   date('now', '+1 days'), 60,
   'Running for months and serving no declared result. Either it earns one or it ends.',
   4, NULL, datetime('now', '-2 days')),
  ('demo-files', 'Files',
   'Mac, iCloud, and Drive searchable as one private map.',
   'Reversible or it does not ship.',
   NULL, 'draft',
   'Three storage sources indexed, every operation with a dry run.',
   '', date('now', '+24 days'), NULL, '',
   5, 'order', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  spirit = excluded.spirit,
  repository = excluded.repository,
  lifecycle = excluded.lifecycle,
  current_outcome = excluded.current_outcome,
  success_criteria = excluded.success_criteria,
  next_review = excluded.next_review,
  progress_percent = excluded.progress_percent,
  progress_note = excluded.progress_note,
  position = excluded.position,
  serves = excluded.serves,
  updated_at = excluded.updated_at;

------------------------------------------------------------------- goals
DELETE FROM goals WHERE id LIKE 'demo-%';
INSERT INTO goals
  (id, project_id, title, desired_outcome, success_criteria,
   horizon, status, current_assessment, next_review)
VALUES
  ('demo-goal-browser', 'demo-worldview', 'Reach it from anywhere with a password',
   'A person opens the deployment in a browser, types one password, and sees their declaration.',
   'Works on a phone, on a laptop, and inside an MCP host, from the same URL.',
   'this week', 'active',
   'Login and the standalone UI are in. Not yet deployed to a public hostname.',
   date('now', '+2 days')),
  ('demo-goal-firstuser', 'demo-worldview', 'One deployment that is not mine',
   'Someone else writes their own declaration and connects it.',
   'They get to a useful first daily brief from the documentation alone.',
   'this quarter', 'active',
   'The library boundary is drawn but not extracted. No external deployment exists.',
   date('now', '+16 days')),
  ('demo-goal-twelve', 'demo-atlas', 'Twelve distinctions placed in the graph',
   'Each distinction has an essay, a position, sources, and one guided path.',
   'A reader can walk a path and report what changed.',
   'this quarter', 'active',
   'Four essays drafted, zero placed. The graph schema is still a sketch.',
   date('now', '+12 days')),
  ('demo-goal-paths', 'demo-atlas', 'One guided path that repeatably lands',
   'A path that produces the same shift in more than one reader.',
   'Two readers independently report getting it.',
   'this quarter', 'active',
   'Not started. Blocked on the graph.',
   NULL),
  ('demo-goal-map', 'demo-library', 'Twenty sources mapped',
   'Books and primary sources connected to the concepts they changed.',
   'Every mapped source names the distinction it moved.',
   'this month', 'active',
   'Zero mapped. This is the promise that has slipped twice.',
   date('now', '-4 days')),
  ('demo-goal-review', 'demo-library', 'A review pipeline for conversation signals',
   'What was unclear in a conversation becomes a reviewable item, not a memory.',
   'No model output becomes public truth without review.',
   'this month', 'active',
   'Designed, not built.',
   date('now', '+7 days'));

------------------------------------------------------------------- memories
-- RECALL_MEMORY with no project returns only rows where project_id IS NULL, so
-- the Memory view needs global memories. The first one is the demo marker: it
-- shows up both in the UI and to any model that calls RECALL_MEMORY at session
-- start, which is how the agent learns it is looking at fake measurements.
DELETE FROM memories WHERE id LIKE 'demo-%';
INSERT INTO memories
  (id, project_id, kind, content, source, confidence, status, created_at)
VALUES
  ('demo-mem-marker', NULL, 'fact',
   'DEMO DATA. This database was seeded by `bun run demo`. The declaration in worldview.json is real; every measurement, project, goal, note, bookmark, and analytics event here is invented. Clear it with `bun run demo:reset`.',
   'seeds/demo.sql', 1, 'active', datetime('now', '-1 hours')),
  ('demo-mem-nopublish', NULL, 'preference',
   'Nothing publishes itself. A draft is not a commitment and a commitment is not a post.',
   'declaration', 1, 'active', datetime('now', '-26 days')),
  ('demo-mem-integrity', NULL, 'lesson',
   'A missed commitment is not the breach. Leaving it unacknowledged is. The cheap move is to say so, say what happens instead and by when, then clean up.',
   'declaration', 1, 'active', datetime('now', '-19 days')),
  ('demo-mem-evidence', NULL, 'preference',
   'Never invent numbers. If there is no query behind a claim, instrument first and conclude later.',
   'declaration', 1, 'active', datetime('now', '-33 days')),
  ('demo-mem-scope', 'demo-atlas', 'observation',
   'Every attempt to design the graph schema before writing four essays has failed. The essays are what reveal the edges.',
   'retro', 0.8, 'active', datetime('now', '-11 days')),
  ('demo-mem-slip', 'demo-library', 'observation',
   'The source-mapping goal has slipped twice, both times to Atlas work. That is a real priority, and pretending otherwise is the only mistake.',
   'retro', 0.9, 'active', datetime('now', '-6 days'));

------------------------------------------------------------------- decisions
-- Immutable: BEFORE UPDATE and BEFORE DELETE both abort. INSERT OR IGNORE is
-- the only idempotent operation available, and re-running leaves one row.
INSERT OR IGNORE INTO decisions
  (id, project_id, title, decision, rationale, source, decided_at)
VALUES
  ('demo-dec-nohands', 'demo-worldview', 'Worldview never executes',
   'No tool in this system takes an action with a consequence. Execution belongs to whatever factory connects to it.',
   'A scorekeeper with hands cannot be trusted to keep score, and it is what makes one deployment safe to connect to several factories at once.',
   'demo', datetime('now', '-28 days')),
  ('demo-dec-twoscores', 'demo-worldview', 'Two scores, never a third',
   'Alignment and integrity only. Everything else is a diagnostic beneath one of them.',
   'Eleven scorecard items were eleven ways to avoid answering the two questions that matter.',
   'demo', datetime('now', '-22 days')),
  ('demo-dec-standalone', 'demo-worldview', 'Own worker, own database',
   'Stop deploying over the instance worker. The library gets throwaway resources so it can be demoed freely.',
   'Two repositories claiming one D1 is not a configuration problem, it is a data-loss problem waiting for a deploy.',
   'demo', datetime('now', '-2 days')),
  ('demo-dec-essaysfirst', 'demo-atlas', 'Write four essays before designing the graph',
   'Draft the essays first and let the edges fall out of them.',
   'Three schema attempts died without an essay to test them against.',
   'demo', datetime('now', '-13 days'));

------------------------------------------------------------------- captures
DELETE FROM captures WHERE id LIKE 'demo-%';
INSERT INTO captures (id, project_id, kind, content, source, status, created_at)
VALUES
  ('demo-cap-1', 'demo-worldview', 'task',
   'The library extraction promise made to the instance repo is past its by-when and unacknowledged.',
   'demo', 'inbox', datetime('now', '-5 days')),
  ('demo-cap-2', 'demo-library', 'task',
   'Twenty mapped sources was promised for last week. Not done, not honored.',
   'demo', 'inbox', datetime('now', '-4 days')),
  ('demo-cap-3', 'demo-atlas', 'distinction',
   'Integrity as wholeness rather than morality. A wheel with every spoke, not a virtue.',
   'demo', 'inbox', datetime('now', '-2 days')),
  ('demo-cap-4', 'demo-worldview', 'idea',
   'Alignment could be computed rather than asserted: share of projects whose success_criteria names a declared result.',
   'demo', 'inbox', datetime('now', '-8 days')),
  ('demo-cap-5', NULL, 'source',
   'Reread the chapter on the created future before rewriting the declaration.',
   'demo', 'inbox', datetime('now', '-15 days')),
  ('demo-cap-6', NULL, 'note',
   'The daily rhythm still is not established. That is the actual bottleneck, not any feature.',
   'demo', 'inbox', datetime('now', '-1 days'));

------------------------------------------------------------------- activity
-- Evidence of attention, never measured hours. demo-library gets none on
-- purpose: it is the stale project GET_STALE_PROJECTS should surface.
DELETE FROM activity_events WHERE id LIKE 'demo-%';
INSERT INTO activity_events
  (id, project_id, source, kind, summary, url, confidence, occurred_at)
VALUES
  ('demo-act-1', 'demo-worldview', 'github', 'push', '4 commits to example/worldview',
   'https://github.com/example/worldview/commits/main', 1, datetime('now', '-1 days')),
  ('demo-act-2', 'demo-worldview', 'github', 'pull_request', 'Opened #12 browser session',
   'https://github.com/example/worldview/pull/12', 1, datetime('now', '-2 days')),
  ('demo-act-3', 'demo-worldview', 'github', 'issue', 'Closed #9 declaration fetch is load-bearing',
   'https://github.com/example/worldview/issues/9', 1, datetime('now', '-3 days')),
  ('demo-act-4', 'demo-worldview', 'github', 'push', '2 commits to example/worldview',
   'https://github.com/example/worldview/commits/main', 1, datetime('now', '-6 days')),
  ('demo-act-5', 'demo-atlas', 'github', 'push', '1 commit to example/atlas',
   'https://github.com/example/atlas/commits/main', 1, datetime('now', '-4 days')),
  ('demo-act-6', 'demo-atlas', 'notes', 'session', 'Drafted the fourth essay',
   NULL, 0.7, datetime('now', '-9 days')),
  ('demo-act-7', 'demo-worldview', 'github', 'issue', 'Opened #13 seed data leaks into forks',
   'https://github.com/example/worldview/issues/13', 1, datetime('now', '-5 days')),
  ('demo-act-8', 'demo-atlas', 'notes', 'session', 'Mapped three distinctions on paper',
   NULL, 0.6, datetime('now', '-16 days'));

------------------------------------------------------------------- work items
DELETE FROM work_items WHERE id LIKE 'demo-%';
INSERT INTO work_items
  (id, project_id, source, kind, number, title, state, url, author, labels,
   created_at, updated_at)
VALUES
  ('demo-wi-12', 'demo-worldview', 'github', 'pull_request', 12,
   'Browser session: password login and the standalone UI', 'open',
   'https://github.com/example/worldview/pull/12', 'demo-owner',
   '["standalone"]', datetime('now', '-2 days'), datetime('now', '-1 days')),
  ('demo-wi-13', 'demo-worldview', 'github', 'issue', 13,
   'Seed data leaks one instance''s declaration into every fresh database', 'open',
   'https://github.com/example/worldview/issues/13', 'demo-owner',
   '["bug","migrations"]', datetime('now', '-5 days'), datetime('now', '-2 days')),
  ('demo-wi-14', 'demo-worldview', 'issue', 'issue', 14,
   'Draw the library boundary so an instance is three files', 'open',
   'https://github.com/example/worldview/issues/14', 'demo-owner',
   '["library","promised"]', datetime('now', '-11 days'), datetime('now', '-5 days')),
  ('demo-wi-9', 'demo-worldview', 'github', 'issue', 9,
   'GET_DECLARATION fails when DECLARATION.md is absent', 'closed',
   'https://github.com/example/worldview/issues/9', 'demo-owner',
   '["bug"]', datetime('now', '-12 days'), datetime('now', '-3 days')),
  ('demo-wi-31', 'demo-atlas', 'github', 'issue', 31,
   'Graph schema: derive edges from the drafted essays', 'open',
   'https://github.com/example/atlas/issues/31', 'demo-owner',
   '["design"]', datetime('now', '-14 days'), datetime('now', '-4 days'));

------------------------------------------------------------------- daily brief
DELETE FROM daily_briefs WHERE id LIKE 'demo-%';
INSERT INTO daily_briefs (id, brief_date, content, source_snapshot) VALUES
  ('demo-brief-today', date('now'),
   'Integrity is 3, and all three are the same shape: something was said and then not said again. The library extraction promised to the instance repo (5 days past), twenty mapped sources (4 days past), and the daily rhythm that has been "starting next week" for a month. None of them is a failure yet — leaving them unacknowledged is what makes them one. The cheapest move available today is to honor one out loud: what happens instead, and by when.

Alignment is 62%. Three of the four projects on the map name a declared result in their success criteria; Files does not, and that is worth deciding rather than leaving implicit.

Worldview moved: #9 closed, #12 open on browser access. Atlas has one commit in nine days and its blocking issue is a decision, not work — the essays-first decision is already recorded, so the graph schema is waiting on nothing but writing.

Library has had no activity in 41 days and is the only stale active project. It is also where the slipped promise lives. Those two facts are the same fact.',
   '{"demo":true}');

------------------------------------------------------------------- measurement
-- Structure comes from worldview.json; only progress lives here. A declared
-- result with no row would read 0%, which is the correct default and needs no
-- migration — these rows exist so the demo shows a gap worth looking at.
DELETE FROM strategic_results;
INSERT INTO strategic_results
  (id, position, title, narrative, acceptance_criteria, metrics,
   progress_percent, progress_note)
VALUES
  ('agency', 1, '', '', '[]', '[]', 55,
   'The map, goals, memory, evidence, and briefing exist. The daily rhythm does not, which is the whole point of them.'),
  ('research', 2, '', '', '[]', '[]', 40,
   'Corpus search works and gets used before writing. It is not yet consulted before a branch.'),
  ('validation', 3, '', '', '[]', '[]', 15,
   'Two ideas were killed cheaply, both by accident rather than by a step that exists.'),
  ('software-factory', 4, '', '', '[]', '[]', 30,
   'One factory connects over MCP. The connection is real; the second one is untested.'),
  ('understanding', 5, '', '', '[]', '[]', 20,
   'Four essays drafted, none placed in a graph. No reader has walked a path.'),
  ('compounding', 6, '', '', '[]', '[]', 15,
   'Import works, nothing is mapped to a concept, and the review pipeline is a design.'),
  ('expression', 7, '', '', '[]', '[]', 5,
   'Not started beyond a sketch of what a consented artifact would contain.'),
  ('multiplication', 8, '', '', '[]', '[]', 25,
   'Standalone deployment and browser access work. No deployment exists that is not mine.'),
  ('relationships', 9, '', '', '[]', '[]', 0,
   'Not started.'),
  ('word', 10, '', '', '[]', '[]', 20,
   'Three commitments are past their by-when and unacknowledged. The ledger is captures, which is not the same as a ledger.'),
  ('order', 11, '', '', '[]', '[]', 0,
   'Not started.');

-- The two scores, and the diagnostics beneath them. Integrity is a count with a
-- target of zero and no unit that could be read as a percentage — a progress bar
-- on integrity is a category error.
-- Alignment is not seeded: GET_DECLARATION derives it from projects.serves, so
-- anything written here would be overwritten by the query. With this seed it
-- comes out as 3 of 4 active projects — demo-newsletter serves nothing.
UPDATE scorecard_items SET
  current_value = 3,
  note = 'Library extraction (5 days past), twenty mapped sources (4 days past), the daily rhythm (a month). None acknowledged.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'integrity';

DELETE FROM scorecard_items WHERE id LIKE 'demo-%';
INSERT INTO scorecard_items
  (id, position, label, kind, current_value, target_value, unit,
   boolean_value, note)
VALUES
  ('demo-diag-rhythm', 1, 'Daily briefs reviewed', 'metric', 1, 5, 'per week',
   NULL, 'Counted from briefs actually opened, not briefs generated.'),
  ('demo-diag-distinctions', 2, 'Distinctions placed in the graph', 'metric', 0, 12,
   'distinctions', NULL, 'Four essays exist; placement is the missing step.'),
  ('demo-diag-deployments', 3, 'Deployments that are not mine', 'metric', 0, 10,
   'deployments', NULL, ''),
  ('demo-diag-sources', 4, 'Sources mapped to a concept', 'metric', 0, 20, 'sources',
   NULL, 'The promise that has slipped twice.'),
  ('demo-diag-ledger', 5, 'A word ledger exists', 'boolean', NULL, NULL, '', 0,
   'Captures are a pile, not a ledger: nothing carries an owner and a by-when.'),
  ('demo-diag-privacy', 6, 'Zero private-data exposure incidents', 'boolean',
   NULL, NULL, '', 1, 'Permanent condition.');

------------------------------------------------------------------- bookmarks
-- DELETE fires the FTS5 'delete' trigger and cascades bookmark_tags, so the
-- index stays exact without a 'rebuild'. search_tags is set inline because the
-- insert trigger indexes that column, not the bookmark_tags rows.
DELETE FROM bookmarks WHERE id >= 9000;
INSERT INTO bookmarks
  (id, url, title, description, stars, language, reading_time_min,
   perplexity_research, insight_dev, insight_founder, insight_investor, notes,
   researched_at, classified_at, published_at,
   content_excerpt, search_tags, insights_search)
VALUES
  (9001, 'https://modelcontextprotocol.io/specification',
   'Model Context Protocol specification',
   'The wire format: tools, resources, prompts, and the app bridge.',
   5, 'en', 24,
   'MCP defines tools, resources, and prompts over JSON-RPC, with an extension for host-rendered apps.',
   'The capability boundary belongs at tools/list and again at tools/call. Filtering one is not filtering.',
   'One protocol means one integration instead of one per factory.',
   'Protocol adoption is the moat nobody can buy.',
   '', datetime('now', '-9 days'), datetime('now', '-8 days'), NULL,
   'Tools, resources, and prompts are advertised over JSON-RPC; clients call them by name.',
   'topic:mcp topic:protocol persona:mcp_developer',
   'Filter tools/list and re-check on call. One integration instead of one per factory.'),
  (9002, 'https://developers.cloudflare.com/d1/',
   'Cloudflare D1', 'SQLite at the edge, with migrations tracked by filename.',
   4, 'en', 11,
   'D1 applies migrations in filename order and records which names ran, not their contents.',
   'That is why editing an applied migration body is a no-op for existing databases.',
   NULL, NULL, 'The detail that made removing the seeded declaration safe.',
   datetime('now', '-16 days'), datetime('now', '-15 days'), NULL,
   'Migrations are recorded by name in d1_migrations; contents are not hashed.',
   'topic:cloudflare topic:d1 persona:mcp_developer',
   'Editing an applied migration body is a no-op for existing databases.'),
  (9003, 'https://www.sqlite.org/fts5.html',
   'SQLite FTS5', 'External-content full-text indexes and their triggers.',
   4, 'en', 19,
   'An external-content FTS5 table mirrors a base table through triggers; deletes must be fed the old row.',
   'Delete-then-insert keeps the index exact without a rebuild.',
   NULL, NULL, '',
   datetime('now', '-23 days'), datetime('now', '-22 days'), NULL,
   'External content tables store no copy of the text and rely on triggers to stay in sync.',
   'topic:sqlite topic:search persona:mcp_developer',
   'Delete-then-insert keeps the index exact without a rebuild.'),
  (9004, 'https://werner-erhard.com/',
   'Werner Erhard', 'Source material for the created future and integrity as wholeness.',
   5, 'en', NULL,
   'Integrity as a positive, measurable property of a system rather than a moral virtue.',
   NULL,
   'Integrity is workability. A missed promise costs less than an unacknowledged one.',
   NULL, 'The attribution in NOTICE points here.',
   datetime('now', '-31 days'), NULL, NULL,
   'Integrity is treated as wholeness and completeness, not as morality or ethics.',
   'topic:leadership topic:integrity', ''),
  (9005, 'https://example.com/notes/declared-future',
   'On keeping a declared future in git', NULL, NULL, 'en', NULL,
   'Argument for versioning intentions the way code is versioned.',
   NULL, NULL, NULL, '',
   datetime('now', '-38 days'), NULL, NULL,
   'If changing your future is a commit, then changing your future is reviewable.',
   'topic:worldview', ''),
  (9006, 'https://example.com/unread',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'Saved and never opened. This is what a bare bookmark looks like.',
   NULL, NULL, NULL, '', '', '');

INSERT INTO bookmark_tags (bookmark_id, tag) VALUES
  (9001, 'topic:mcp'), (9001, 'topic:protocol'), (9001, 'persona:mcp_developer'),
  (9002, 'topic:cloudflare'), (9002, 'topic:d1'), (9002, 'persona:mcp_developer'),
  (9003, 'topic:sqlite'), (9003, 'topic:search'), (9003, 'persona:mcp_developer'),
  (9004, 'topic:leadership'), (9004, 'topic:integrity'),
  (9005, 'topic:worldview');

------------------------------------------------------------------- analytics
-- 30 days across two sites on the reserved .example TLD. The deterministic gap
-- (`% 5 <> 0`) gives the timeline a shape instead of a flat line; visitor ids
-- rotate per day, matching how the real daily hash behaves.
DELETE FROM events WHERE id >= 900000;
INSERT INTO events (id, name, value, site, path, ref, visitor, country, dims, ts)
WITH RECURSIVE
  day(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM day WHERE n < 29),
  page(i, site, path) AS (VALUES
    (0, 'worldview.example', '/'),
    (1, 'worldview.example', '/docs/declaration'),
    (2, 'worldview.example', '/docs/two-scores'),
    (3, 'notes.example', '/on-integrity'),
    (4, 'notes.example', '/declared-future-in-git'),
    (5, 'notes.example', '/')),
  who(v, ua, country, ref) AS (VALUES
    (0, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', 'BR', 'https://news.ycombinator.com/'),
    (1, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'US', ''),
    (2, 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'PT', 'https://www.google.com/'),
    (3, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0', 'DE', 'https://lobste.rs/'))
SELECT
  900000 + n * 100 + i * 10 + v,
  'pageview', 1, site, path, ref,
  'demo-v' || v || '-' || n, country,
  json_object(
    'ua', ua,
    'status', '200',
    'cache', CASE WHEN (n + i) % 3 = 0 THEN 'MISS' ELSE 'HIT' END,
    'colo', CASE v WHEN 0 THEN 'GRU' WHEN 1 THEN 'IAD' WHEN 2 THEN 'LIS' ELSE 'FRA' END,
    'ip', '203.0.113.' || (10 + v),
    'asn', 64500 + v,
    'asOrg', 'Demo Networks'
  ),
  strftime('%s', 'now', '-' || n || ' days', '-' || (1 + (i * 3) % 9) || ' hours') * 1000
FROM day, page, who
WHERE (n * 7 + i * 13 + v * 29) % 5 <> 0;

-- A few blocked scans, so the analytics status breakdown is not single-valued.
INSERT INTO events (id, name, value, site, path, ref, visitor, country, dims, ts)
WITH RECURSIVE day(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM day WHERE n < 29)
SELECT
  990000 + n, 'blocked', 1, 'worldview.example', '/wp-login.php', '',
  'demo-scan-' || n, 'US',
  json_object('ua', 'python-requests/2.32', 'status', '404', 'cache', 'BYPASS',
              'colo', 'IAD', 'ip', '198.51.100.7', 'asn', 64510,
              'asOrg', 'Demo Scanners'),
  strftime('%s', 'now', '-' || n || ' days', '-2 hours') * 1000
FROM day WHERE n % 3 = 0;
