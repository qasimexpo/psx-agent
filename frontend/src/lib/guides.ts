import "server-only";

import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

/**
 * Evergreen guides, written as Markdown in `content/guides/` so they can be
 * edited without touching a component. The tools and data pages answer
 * questions from people who already know the site; these answer the ones
 * people type before they do, such as how to tell whether a PSX stock is
 * halal, which is where a search engine first sends a reader here.
 *
 * Frontmatter keys: title, description, date, updated, keywords (list),
 * image (path under /public), imageAlt, related (list of slugs).
 */

export type Guide = {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated: string;
  keywords: string[];
  image: string | null;
  imageAlt: string;
  related: string[];
  html: string;
  wordCount: number;
  readingMinutes: number;
  /** h2 headings, for the table of contents. */
  sections: { id: string; text: string }[];
};

const GUIDES_DIR = path.join(process.cwd(), "content", "guides");

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : value instanceof Date ? value.toISOString().slice(0, 10) : fallback;

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];

/** GitHub-style heading ids, so the table of contents can link to them. */
function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function render(markdown: string): { html: string; sections: Guide["sections"] } {
  const sections: Guide["sections"] = [];
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = headingId(text);
    if (depth === 2) sections.push({ id, text: text.replace(/<[^>]+>/g, "") });
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  const html = marked.parse(markdown, { renderer, gfm: true, async: false }) as string;
  return { html, sections };
}

async function readGuide(file: string): Promise<Guide | null> {
  if (!file.endsWith(".md")) return null;
  const raw = await fs.readFile(path.join(GUIDES_DIR, file), "utf8");
  const { data, content } = matter(raw);
  const { html, sections } = render(content);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const date = asString(data.date);
  return {
    slug: file.replace(/\.md$/, ""),
    title: asString(data.title, file),
    description: asString(data.description),
    date,
    updated: asString(data.updated, date),
    keywords: asList(data.keywords),
    image: asString(data.image) || null,
    imageAlt: asString(data.imageAlt),
    related: asList(data.related),
    html,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / 220)),
    sections,
  };
}

export async function listGuides(): Promise<Guide[]> {
  let files: string[];
  try {
    files = await fs.readdir(GUIDES_DIR);
  } catch {
    return [];
  }
  const guides = (await Promise.all(files.sort().map(readGuide))).filter(
    (guide): guide is Guide => guide !== null,
  );
  return guides.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return await readGuide(`${slug}.md`);
  } catch {
    return null;
  }
}
