-- The missing edge: which declared strategic result a project pursues.
--
-- Until now projects and strategic results were two unrelated tables. The only
-- link was prose inside success_criteria, which meant alignment — "share of
-- active work traceable to a declared outcome" — could not be derived and was
-- typed in by hand. A score nobody can open is exactly what the objects domain
-- of integrity says should not exist.
--
-- No foreign key on purpose. The declaration lives in git, so a declared result
-- may legitimately have no row in strategic_results yet (it reads 0% until one
-- exists). Validation happens on write against worldview.json, the same rule
-- that makes SET_STRATEGIC_RESULT_PROGRESS reject an undeclared id.
--
-- NULL is a meaningful value, not missing data: a project serving nothing
-- declared is the alignment score working.

ALTER TABLE projects ADD COLUMN serves TEXT;

CREATE INDEX IF NOT EXISTS projects_serves_idx
  ON projects(serves, lifecycle);
