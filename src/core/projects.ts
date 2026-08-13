/**
 * A project's structure lives in the instance's git, one markdown file each.
 *
 * The split is the same one the strategic results use, a level down. What a
 * project *is* — its name, the outcome it declares, what would count as success,
 * and which strategic results it serves — is intent, so changing it is a commit.
 * What is *true of it this week* — lifecycle, order, progress, evidence — lives
 * in D1 because it changes constantly and is derived from what happened.
 *
 * The library parses; the instance passes raw markdown. Parsing is an `if`, and
 * an instance is not supposed to contain any — otherwise every instance grows
 * its own frontmatter parser and they drift.
 */

export interface DeclaredProject {
  id: string;
  name: string;
  /** GitHub `owner/repo`, when the project has one. */
  repo?: string;
  /**
   * Strategic results this project pursues, primary first. Many-to-many on
   * purpose: real work usually serves more than one result, and forcing a single
   * choice would make the alignment score lie by omission.
   */
  serves: string[];
  /** One line: why this exists at all. */
  spirit: string;
  /** First paragraph of `## Declared outcome`: what being done looks like. */
  outcome: string;
  /** The whole section, reasoning included. */
  outcomeDetail: string;
  /** The `## Success criteria` section, one entry per line. */
  successCriteria: string[];
  /** Prose, everything after the frontmatter. */
  body: string;
  /**
   * Initial lifecycle and review date, used only until D1 has a row for this
   * project. After that D1 is authoritative, because those are the fields you
   * flip in conversation rather than in a commit.
   */
  initialLifecycle?: string;
  initialNextReview?: string;
}

/**
 * Just enough YAML for the frontmatter this format uses: `key: value` and
 * `key: [a, b]`. Not a YAML parser, and deliberately not a dependency — the
 * shape is fixed by `projects/README.md`, and anything more expressive would be
 * structure hiding in a config file.
 */
function parseFrontmatter(block: string): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const line of block.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key || key.startsWith("#")) continue;

    let value = line.slice(separator + 1).trim();
    const comment = value.indexOf(" #");
    if (comment >= 0) value = value.slice(0, comment).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      fields[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      fields[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return fields;
}

/** The prose under one `## Heading`, up to the next heading. */
function section(body: string, heading: string): string {
  // The terminator has to be "next heading, or the true end of the string".
  // `\Z` is not JavaScript — it matches a literal Z, which silently returns
  // nothing for the last section in the file.
  const pattern = new RegExp(
    `^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
    "im",
  );
  return body.match(pattern)?.[1]?.trim() ?? "";
}

function firstParagraph(section: string): string {
  return (section.split(/\n\s*\n/)[0] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * A markdown list, one entry per item rather than per line.
 *
 * Splitting on newlines looks right until a criterion wraps, and then one
 * commitment silently becomes two — with the second half reading as its own
 * half-sentence promise.
 */
function listItems(section: string): string[] {
  const items: string[] = [];
  for (const line of section.split("\n")) {
    const marker = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (marker) {
      items.push(marker[1]!.trim());
    } else if (line.trim() && items.length) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }
  const cleaned = items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Written as prose rather than a list. Returning nothing would delete what the
  // author wrote, and an empty criteria list reads as "none declared" — the
  // opposite of what the section says.
  if (!cleaned.length && section.trim()) {
    return section
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  return cleaned;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseProject(markdown: string): DeclaredProject | null {
  const match = markdown.match(FRONTMATTER);
  if (!match) return null;

  const fields = parseFrontmatter(match[1]!);
  const body = markdown.slice(match[0].length).trim();
  const one = (key: string): string =>
    typeof fields[key] === "string" ? (fields[key] as string) : "";
  const many = (key: string): string[] => {
    const value = fields[key];
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  };

  const id = one("id");
  if (!id) return null;

  return {
    id,
    name: one("name") || id,
    repo: one("repo") || undefined,
    serves: many("serves"),
    // `**Spirit:** one line` is the convention in projects/README.md.
    spirit: body.match(/\*\*Spirit:\*\*\s*(.+)/)?.[1]?.trim() ?? "",
    // The first paragraph is the outcome; the rest of the section is the
    // argument for it. Real files run to twenty lines of reasoning, and a card
    // that shows the whole thing shows nothing.
    outcome: firstParagraph(section(body, "Declared outcome")),
    outcomeDetail: section(body, "Declared outcome"),
    successCriteria: listItems(section(body, "Success criteria")),
    body,
    initialLifecycle: one("lifecycle") || undefined,
    initialNextReview: one("next_review") || undefined,
  };
}

export function parseProjects(sources: string[] = []): DeclaredProject[] {
  return sources
    .map(parseProject)
    .filter((project): project is DeclaredProject => project !== null);
}

/** Everything wrong with the declared projects. Empty means valid. */
export function projectErrors(
  projects: DeclaredProject[],
  declaredResultIds: string[],
): string[] {
  const errors: string[] = [];
  const known = new Set(declaredResultIds);
  const seen = new Set<string>();

  for (const project of projects) {
    const at = `projects/${project.id}`;
    if (!/^[a-z0-9-]+$/.test(project.id)) {
      errors.push(`${at}: id must be a lowercase slug`);
    }
    if (seen.has(project.id)) errors.push(`${at}: duplicate id`);
    seen.add(project.id);

    for (const result of project.serves) {
      if (!known.has(result)) {
        errors.push(
          `${at}: serves "${result}", which is not a declared strategic result`,
        );
      }
    }
  }
  return errors;
}
