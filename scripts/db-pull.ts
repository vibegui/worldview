#!/usr/bin/env bun
/**
 * Mirror a deployed Worldview's D1 into the local one, so you can iterate on the
 * real thing without touching it.
 *
 * Run it from an instance directory, where wrangler.jsonc names the database:
 *
 *     bunx worldview-db-pull
 *
 * Schema comes from the migrations, data comes from production. That split is
 * not incidental — `d1 export` refuses to dump a database containing FTS5
 * virtual tables ("cannot export databases with Virtual Tables"), so a whole-
 * database snapshot is impossible. Taking the schema from migrations is better
 * anyway: migrations are the source of truth, so the local schema is what the
 * next deploy will produce rather than what the last one happened to leave.
 *
 * Strictly one-way. Nothing here writes to the remote database.
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const instanceDir = process.cwd();
const migrationsDir = join(instanceDir, "migrations");
const snapshot = join(instanceDir, ".snapshot.sql");

function run(args: string[], quiet = false): string {
  const result = Bun.spawnSync(["bunx", "wrangler", ...args], {
    cwd: instanceDir,
    stdio: quiet ? ["inherit", "pipe", "pipe"] : ["inherit", "inherit", "inherit"],
  });
  if (result.exitCode !== 0) {
    if (quiet) console.error(result.stderr?.toString() ?? "");
    console.error(`\nwrangler ${args.join(" ")} failed.`);
    process.exit(result.exitCode ?? 1);
  }
  return result.stdout?.toString() ?? "";
}

/** The database name, from the instance's own wrangler config. */
function databaseName(): string {
  for (const file of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    let text: string;
    try {
      text = readFileSync(join(instanceDir, file), "utf8");
    } catch {
      continue;
    }
    const match = text.match(/database_name"?\s*[:=]\s*"([^"]+)"/);
    if (match) return match[1]!;
  }
  console.error("No database_name found in wrangler config. Run this from an instance directory.");
  process.exit(1);
}

/**
 * Real tables, read out of the migrations rather than listed by hand.
 * `sqlite_master` is not queryable through the D1 API, and a hardcoded list goes
 * stale the first time a migration adds a table.
 */
function tablesFromMigrations(): string[] {
  const tables = new Set<string>();
  for (const file of readdirSync(migrationsDir).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const [, name] of sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi,
    )) {
      tables.add(name);
    }
    // Virtual tables and their shadow tables cannot be exported, and do not need
    // to be: the index is derived and gets rebuilt below.
    for (const [, name] of sql.matchAll(
      /CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi,
    )) {
      tables.delete(name);
    }
    for (const [, name] of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/gi)) {
      tables.delete(name);
    }
  }
  return [...tables].sort();
}

const database = databaseName();
const tables = tablesFromMigrations();

console.log(`Mirroring ${database} into the local database.`);
console.log(`  tables: ${tables.join(", ")}\n`);

// Schema first, from migrations. This also recreates the FTS5 virtual table and
// its triggers, which the export cannot carry.
console.log("1/4 fresh local database from migrations");
rmSync(join(instanceDir, ".wrangler/state"), { recursive: true, force: true });
run(["d1", "migrations", "apply", database, "--local"]);

// `--no-schema`: the tables already exist. d1_migrations is deliberately absent
// from the list, since step 1 already wrote its rows.
console.log("\n2/4 export production data (read-only)");
run([
  "d1",
  "export",
  database,
  "--remote",
  "--no-schema",
  "--output",
  snapshot,
  "-y",
  ...tables.flatMap((table) => ["--table", table]),
]);

const size = Bun.file(snapshot).size;
console.log(`\n3/4 load ${(size / 1024 / 1024).toFixed(1)}MB locally`);
run(["d1", "execute", database, "--local", "--file", snapshot, "-y"]);

// The FTS5 index is derived from bookmarks, and its content arrived by plain
// INSERT rather than through the triggers, so it has to be built once.
console.log("\n4/4 rebuild the search index");
run([
  "d1",
  "execute",
  database,
  "--local",
  "-y",
  "--command",
  "INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')",
]);

console.log(`
Local database now mirrors ${database}.

  bun run dev    then open the URL it prints and log in

${snapshot} holds real personal data. It is gitignored; delete it when done.
`);
