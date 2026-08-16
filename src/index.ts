/**
 * The deployment: one person's Worldview, served at worldview.vibegui.com.
 *
 * Everything above this line is configuration and content — the declaration in
 * `worldview.json`, the projects in `projects/*.md`, the bindings in
 * `wrangler.jsonc`. Everything below it is behaviour, in `src/worker/`.
 *
 * This is deliberately not a library with an instance somewhere else. There is
 * one instance, it lives here, and a factory for a single caller is a layer that
 * only ever costs a hop.
 */

import { parseProjects } from "./core/projects.ts";
import { resolveWorldview } from "./core/worldview.ts";
import declaration from "../worldview.json" with { type: "json" };
import { createWorker } from "./worker/index.ts";

// One import per project: there is no glob import in a Worker, and a build step
// that generated this would put a pipeline back into what should be config.
import anjoChat from "../projects/anjo-chat.md";
import holocard from "../projects/holocard.md";
import decoStudio from "../projects/deco-studio.md";
import mangabeiraChat from "../projects/mangabeira-chat.md";
import personalCrm from "../projects/personal-crm.md";
import personalFiles from "../projects/personal-files.md";
import tama from "../projects/tama.md";
import vibegui from "../projects/vibegui.md";
import worldview from "../projects/worldview.md";

// Note what is *not* here: a throw when the declaration is malformed. This runs
// at module scope in a Worker, so throwing would 500 every route rather than the
// one view that depends on the bad field. `worldviewErrors()` runs in `test`,
// where loud is free.
export default createWorker({
  worldview: resolveWorldview({ declaration }),
  projects: parseProjects([
    vibegui,
    worldview,
    decoStudio,
    holocard,
    tama,
    mangabeiraChat,
    personalCrm,
    personalFiles,
    anjoChat,
  ]),

  site: {
    title: "vibegui ⋅ Worldview",
    author: "Guilherme Rodrigues",
    description:
      "Declaração 2030 — o que a minha vida é sobre, que jogo eu estou jogando, e se estou jogando bem.",
  },

  // Reading the blog, not being it. vibegui.com is a Pages deployment that owns
  // its own rendering; these three tools let an agent search what has already
  // been published before writing something that repeats it.
  publicWriting: {
    siteOrigin: "https://vibegui.com",
    manifestPath: "/content/manifest.json",
    repoRawOrigin: "https://raw.githubusercontent.com/vibegui/vibegui.com/main",
  },

  // `publicRoutes` serves `/bookmarks*` as a CORS JSON API — the blog's library
  // page reads it, so turning it off breaks a page that is already deployed.
  bookmarks: { publicRoutes: true },

  analytics: {
    sites: ["vibegui.com", "poesiadairene.com", "buscamalvados.com"],
  },
});
