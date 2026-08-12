/**
 * Everything `bun run dev` needs before it can show you anything.
 *
 * The ordering is not cosmetic: the worker imports `dist-mcp/index.html` as
 * text, that file is gitignored, and the seed has to land after the migrations
 * that create the tables. Getting it wrong fails in ways that look unrelated to
 * the step that was skipped, so it lives in one script rather than a chain of
 * `&&`.
 */

import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

async function run(command: string[]) {
  const label = command.join(" ");
  console.log(`\n\x1b[2m$ ${label}\x1b[0m`);
  const result = Bun.spawnSync(command, { cwd: root, stdio: ["inherit", "inherit", "inherit"] });
  if (result.exitCode !== 0) {
    console.error(`\n\x1b[31m${label} failed.\x1b[0m`);
    process.exit(result.exitCode ?? 1);
  }
}

const devVars = join(root, ".dev.vars");
if (existsSync(devVars)) {
  console.log("Keeping the .dev.vars you already have.");
} else {
  // Without a password the server falls back to the public tier and hides every
  // private tool, so the demo would render an empty shell and look broken.
  await copyFile(join(root, ".dev.vars.example"), devVars);
  console.log("Wrote .dev.vars from the example. Password: demo");
}

await run(["bunx", "wrangler", "d1", "migrations", "apply", "DB", "--local"]);
await run(["bun", "run", "build"]);
await run([
  "bunx",
  "wrangler",
  "d1",
  "execute",
  "DB",
  "--local",
  "--file=seeds/demo.sql",
]);

console.log(`
\x1b[32mDemo data loaded.\x1b[0m Starting the worker.

  Browser   http://localhost:8787   password: the value of WORLDVIEW_PASSWORD in .dev.vars
  MCP       http://localhost:8787/mcp   Authorization: Bearer <same value>

The declaration comes from worldview.json. Every measurement you are about to
see is invented — see the first entry under Memory. \x1b[2mbun run demo:reset\x1b[0m clears it.
`);
