/**
 * This repository's own deployment — the library eating its own cooking.
 *
 * It is an instance like any other: it supplies a declaration and picks its
 * modules, and gets all its behaviour from `createWorldview`. The difference is
 * only that its declaration happens to live in the same repo.
 *
 * This is what `bun run dev` and `bun run demo` serve, and it is the reference
 * for what an instance's `src/index.ts` looks like.
 */

import declaration from "../worldview.json" with { type: "json" };
import { createWorldview } from "./index.ts";

// One import per project: there is no glob import in a Worker, and a build step
// that generated this would put a pipeline back into what should be config.
import atlas from "../projects/atlas.md";
import files from "../projects/files.md";
import library from "../projects/library.md";
import newsletter from "../projects/newsletter.md";
import worldviewOs from "../projects/worldview-os.md";

export default createWorldview({
  declaration,
  projects: [worldviewOs, atlas, library, newsletter, files],

  // Every module on, so the demo exercises the whole surface and the seed data
  // has somewhere to render. An instance that wants none of this omits all three
  // keys and gets declaration, projects, learning, and the two scores.
  site: {
    title: "Worldview",
    description:
      "What your life is about, what game you are playing, and whether you are playing it well.",
  },

  // The masthead a visitor reads first. Content, so an instance owns it.
  hero: {
    eyebrow: "Ada Lovelace \u00b7 London",
    title: "Ideas I wish I had earlier.",
    intro:
      "I build software and companies, currently as co-founder of [an example](https://example.com). This is where I work through the distinctions that shape how I lead, build, and imagine possible futures.",
    links: [
      { label: "LinkedIn", href: "https://example.com/in" },
      { label: "GitHub", href: "https://example.com/gh" },
    ],
  },

  publicWriting: {
    siteOrigin: "https://vibegui.com",
    manifestPath: "/content/manifest.json",
  },
  bookmarks: { publicRoutes: true },
  analytics: { sites: ["worldview.example", "notes.example"] },
});
