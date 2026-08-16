import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { parseProjects } from "./src/core/projects.ts";

/** Where the declaration and projects live. This repo, unless told otherwise. */
const instanceDir = path.resolve(
  process.env.WORLDVIEW_DIR ?? import.meta.dirname,
);
const workerOrigin = process.env.WORLDVIEW_ORIGIN ?? "http://localhost:8787";

/** Everything the worker normally injects when it serves the built bundle. */
function declarationScript(): string {
  const declaration = JSON.parse(
    readFileSync(path.join(instanceDir, "worldview.json"), "utf8"),
  );
  // The worker owns `/`, so in dev there is no login page here. Cookies are
  // scoped by host and ignore the port, so signing in once on the worker origin
  // authenticates this one too.
  return `window.__STANDALONE__=true;window.__LOGIN_URL__=${JSON.stringify(
    `${workerOrigin}/login`,
  )};window.__WORLDVIEW__=${JSON.stringify({
    name: declaration.name,
    results: Object.fromEntries(
      (declaration.strategicResults ?? []).map(
        (result: { id: string; title: string }) => [result.id, result.title],
      ),
    ),
  })};`;
}

/**
 * Dev only. In production the worker injects this when it serves the built
 * bundle; in dev there is no worker in front of the page, so vite stands in —
 * reading the same file the worker would.
 */
function worldviewDevServer(): Plugin {
  return {
    name: "worldview-dev-server",
    apply: "serve",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head><script>${declarationScript()}</script>`),
    configureServer(server) {
      // Content lives on the worker side, so vite's module graph knows nothing
      // about it. Editing a declaration or a project should still land without
      // touching the browser — wrangler reloads the worker, this reloads the page.
      const watched = [
        path.join(instanceDir, "worldview.json"),
        path.join(instanceDir, "declared-future.md"),
        path.join(instanceDir, "projects"),
      ];
      server.watcher.add(watched);
      server.watcher.on("change", (file) => {
        if (!file.startsWith(instanceDir)) return;
        if (!/worldview\.json$|\.md$/.test(file)) return;
        server.ws.send({ type: "full-reload" });
        server.config.logger.info(
          `  content changed: ${path.relative(instanceDir, file)}`,
        );
      });

      // Fail loudly here rather than rendering an empty portfolio: a serves id
      // that names nothing is the one mistake this format invites.
      const projectsDir = path.join(instanceDir, "projects");
      try {
        const projects = parseProjects(
          readdirSync(projectsDir)
            .filter((file) => file.endsWith(".md") && file !== "README.md")
            .map((file) => readFileSync(path.join(projectsDir, file), "utf8")),
        );
        server.config.logger.info(
          `  worldview  ${path.relative(process.cwd(), instanceDir) || "."} · ${projects.length} projects · api ${workerOrigin}`,
        );
      } catch {
        server.config.logger.warn(`  no projects/ under ${instanceDir}`);
      }
    },
  };
}

// The MCP App UI. One self-contained HTML (CSS + JS inlined) that the Worker
// imports and serves from every ui://<instance>/* resource and from `/`.
export default defineConfig({
  plugins: [react(), viteSingleFile(), worldviewDevServer()],
  root: "mcp-app",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-mcp"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Everything with a consequence goes to the real worker: same endpoint, same
    // tools, same session cookie. The browser sees one origin, so the cookie set
    // by /login comes back on /mcp without any rewriting.
    //
    // Anchored regexes, not the usual prefixes: a bare "/mcp" also matches
    // "/mcp.tsx", and "/bookmarks" matches "/bookmarks/BookmarksView.tsx", so
    // the app's own source gets proxied to the worker and 404s.
    proxy: Object.fromEntries(
      [
        "^/mcp$",
        "^/login$",
        "^/logout$",
        "^/e$",
        "^/popular$",
        "^/bookmarks(/(search|facets|content))?$",
      ].map((route) => [route, { target: workerOrigin, changeOrigin: false }]),
    ),
  },
});
