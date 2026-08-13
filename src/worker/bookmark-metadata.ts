/**
 * What a page says about itself.
 *
 * Saving a link should cost one URL and nothing else. Everything here comes
 * from the page's own `<head>` — no API key, no model, no external service —
 * so a bookmark is always savable even when the enrichment pipeline is not
 * configured, offline, or out of credit.
 *
 * Parsed with HTMLRewriter because it is native to Workers and streams: the
 * body is abandoned as soon as `</head>` closes, so a long article costs a few
 * kilobytes rather than the whole document, and there is no parser dependency
 * to keep current.
 */

export interface PageMetadata {
  url: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  siteName: string | null;
  language: string | null;
  publishedAt: string | null;
}

/** Absolute URL, or null — a relative icon is worse than none. */
function absolute(href: string | null, base: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function cleaned(value: string | null): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 500) : null;
}

export async function fetchPageMetadata(url: string): Promise<PageMetadata> {
  const found: Record<string, string> = {};
  let icon: string | null = null;
  let titleText = "";

  const response = await fetch(url, {
    headers: {
      // Some publishers serve a consent wall or a bare shell to unknown
      // clients. Asking as a browser gets the same HTML a reader would see.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en,pt-BR;q=0.9",
    },
    redirect: "follow",
    cf: { cacheTtl: 300, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`Could not read ${url} (${response.status})`);
  }
  const finalUrl = response.url || url;

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(element) {
        const lang = element.getAttribute("lang");
        if (lang) found.language = lang.split("-")[0]!;
      },
    })
    .on("title", {
      text(chunk) {
        titleText += chunk.text;
      },
    })
    .on("meta", {
      element(element) {
        const key =
          element.getAttribute("property") ?? element.getAttribute("name");
        const content = element.getAttribute("content");
        if (!key || !content) return;
        const wanted = [
          "og:title",
          "og:description",
          "og:site_name",
          "og:image",
          "description",
          "twitter:title",
          "twitter:description",
          "twitter:image",
          "article:published_time",
        ];
        if (wanted.includes(key) && !found[key]) found[key] = content;
      },
    })
    .on("link", {
      element(element) {
        const rel = element.getAttribute("rel")?.toLowerCase() ?? "";
        if (!icon && /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) {
          icon = element.getAttribute("href");
        }
      },
    });

  // Consume the transformed stream so the handlers actually run, then stop:
  // everything wanted is in <head>, and streaming a whole article to /dev/null
  // is bandwidth nobody asked for.
  const transformed = rewriter.transform(response);
  const reader = transformed.body?.getReader();
  if (reader) {
    let seen = 0;
    while (seen < 512_000) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value?.byteLength ?? 0;
    }
    await reader.cancel().catch(() => {});
  }

  return {
    url: finalUrl,
    title: cleaned(found["og:title"] ?? found["twitter:title"] ?? titleText),
    description: cleaned(
      found["og:description"] ??
        found.description ??
        found["twitter:description"] ??
        null,
    ),
    icon:
      absolute(icon, finalUrl) ??
      absolute(found["og:image"] ?? found["twitter:image"] ?? null, finalUrl),
    siteName: cleaned(found["og:site_name"] ?? new URL(finalUrl).hostname),
    language: found.language ?? null,
    publishedAt: found["article:published_time"] ?? null,
  };
}
