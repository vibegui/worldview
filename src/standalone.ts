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

export default createWorldview({
  declaration,

  // Every module on, so the demo exercises the whole surface and the seed data
  // has somewhere to render. An instance that wants none of this omits all three
  // keys and gets declaration, projects, learning, and the two scores.
  publicWriting: {
    siteOrigin: "https://example.com",
    manifestPath: "/content/manifest.json",
  },
  bookmarks: { publicRoutes: true },
  analytics: { sites: ["worldview.example", "notes.example"] },
});
