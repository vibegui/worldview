import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The MCP App UI. One self-contained HTML (CSS + JS inlined) that the Worker
// imports as text (see wrangler.jsonc rules) and serves from every
// ui://vibegui/* resource. deco studio renders it in a sandboxed iframe.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: "mcp-app",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-mcp"),
    emptyOutDir: true,
  },
});
