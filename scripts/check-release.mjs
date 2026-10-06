// Refuses to publish while the docs describe a release that is not live, or still say a live one is not.
//
// Why this exists: a push to main is what publishes developers.unigox.com. publish-openapi.yml and
// publish-changelog.yml run on every push that touches the spec or the changelog, so merging docs for
// a change whose services are not deployed yet would show partners endpoints that answer 404 and
// behaviour production does not have. Docs written ahead of their release keep their changelog entry
// under an "## Unreleased" heading; while one is there, both publish jobs stop here. It stops these two
// jobs and nothing else (the raw spec URL serves main as soon as it merges), so it is a backstop for a
// mistaken merge, not leave to merge early. Once every service in the release is live, replace the
// heading with the release date: that push publishes both.
//
// THE MARKDOWN PAGES ARE NOT PUBLISHED BY EITHER JOB, and a page on main can reach the site on its own
// (GitBook Git Sync). So a page, or a section of one, written ahead of its release opens with a
// "> **Not available yet.**" notice, and the Unreleased entry links to it. This check holds both ends:
// while an entry is Unreleased, every page or section it links to must open with the notice; once no
// entry is, no page may still carry one, so the push that dates the entry also removes them.
//
// Usage: node scripts/check-release.mjs [path/to/changelog.md]
// The pages are the markdown files under the changelog's directory, except its README.md.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Any heading level, so a "### Unreleased" section inside a dated entry blocks too.
const UNRELEASED_HEADING = /^#{1,6}[ \t]+unreleased\b/i;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const FENCE = /^[ \t]*(```|~~~)/;

// PAGE_NOTICE is what a page or section written ahead of its release opens with.
export const PAGE_NOTICE = "**Not available yet.**";

// unreleasedHeadings returns the changelog's "Unreleased" headings, each with its 1-based line number.
export function unreleasedHeadings(markdown) {
  const found = [];
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (UNRELEASED_HEADING.test(line)) found.push({ line: index + 1, text: line.trim() });
  });
  return found;
}

// headings returns the markdown headings outside fenced code: level, text and 0-based line index.
function headings(lines) {
  const found = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    const match = fenced ? null : HEADING.exec(line);
    if (match) found.push({ level: match[1].length, text: match[2], index });
  });
  return found;
}

// unreleasedSections returns the body of each Unreleased entry: the lines under its heading up to the
// next heading of the same or a higher level.
export function unreleasedSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const all = headings(lines);
  return all
    .filter((heading) => UNRELEASED_HEADING.test(lines[heading.index]))
    .map((heading) => {
      const next = all.find((other) => other.index > heading.index && other.level <= heading.level);
      return lines.slice(heading.index + 1, next ? next.index : lines.length).join("\n");
    });
}

// localLinks returns the links in text that point to a markdown file of this repository, with the
// anchor they name ("" for none). Links to other sites and same-page anchors are left out.
export function localLinks(text) {
  const links = [];
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    const [path, anchor = ""] = target.split("#");
    if (path.toLowerCase().endsWith(".md")) links.push({ path, anchor });
  }
  return links;
}

// headingSlug is the anchor GitHub and GitBook give a heading.
export function headingSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

// leadOf returns the lines a reader meets first: under the heading the anchor names, or under the
// page's first heading when there is no anchor, up to the next heading of any level. null when the
// anchor names no heading.
export function leadOf(markdown, anchor = "") {
  const lines = markdown.split(/\r?\n/);
  const all = headings(lines);
  const start = anchor ? all.find((heading) => headingSlug(heading.text) === anchor) : all[0];
  if (anchor && !start) return null;
  const from = start ? start.index + 1 : 0;
  const next = all.find((heading) => heading.index >= from);
  return lines.slice(from, next ? next.index : lines.length).join("\n");
}

// noticeLines returns the 1-based lines that carry PAGE_NOTICE.
export function noticeLines(markdown) {
  const found = [];
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(PAGE_NOTICE)) found.push(index + 1);
  });
  return found;
}

// docsPages returns every markdown file under root, relative to it, except root's README.md (the
// maintainers' notes, which describe the notice) and hidden or dependency folders.
async function docsPages(root, dir = root) {
  const pages = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") pages.push(...(await docsPages(root, path)));
    } else if (entry.name.toLowerCase().endsWith(".md") && relative(root, path).toLowerCase() !== "readme.md") {
      pages.push(relative(root, path));
    }
  }
  return pages;
}

const posixPath = (path) => path.split(sep).join("/");

// releaseProblems returns what stops a publish, each as { file, line, message }, with file relative to
// the changelog's directory. An empty list means the changelog and the pages agree that nothing in them
// is waiting for a release.
export async function releaseProblems(changelogPath) {
  const root = dirname(changelogPath);
  const changelogFile = posixPath(relative(root, changelogPath));
  const changelog = await readFile(changelogPath, "utf8");
  const problems = [];

  const entries = unreleasedHeadings(changelog);
  for (const heading of entries) {
    problems.push({
      file: changelogFile,
      line: heading.line,
      message:
        `"${heading.text}" describes changes that are not live yet. This job publishes nothing until it ` +
        "carries the release date (see README, Releasing documentation ahead of the code).",
    });
  }

  if (entries.length > 0) {
    for (const section of unreleasedSections(changelog)) {
      for (const link of localLinks(section)) {
        const file = posixPath(relative(root, join(root, link.path)));
        const where = link.anchor ? `${file}#${link.anchor}` : file;
        let page;
        try {
          page = await readFile(join(root, link.path), "utf8");
        } catch {
          problems.push({ file: changelogFile, line: 1, message: `The Unreleased entry links to ${file}, which does not exist.` });
          continue;
        }
        const lead = leadOf(page, link.anchor);
        if (lead === null) {
          problems.push({ file, line: 1, message: `The Unreleased entry links to ${where}, and no heading there has that anchor.` });
        } else if (!lead.includes(PAGE_NOTICE)) {
          problems.push({
            file,
            line: 1,
            message:
              `The Unreleased entry links to ${where}, which does not open with a "> ${PAGE_NOTICE}" notice. ` +
              "A page on main can reach the site without this job, so it must say it is not live yet.",
          });
        }
      }
    }
    return problems;
  }

  for (const page of await docsPages(root)) {
    const file = posixPath(page);
    for (const line of noticeLines(await readFile(join(root, page), "utf8"))) {
      problems.push({
        file,
        line,
        message:
          `Still says "${PAGE_NOTICE}" although changelog.md has no Unreleased entry. ` +
          "Remove the notice in the push that dates the entry.",
      });
    }
  }
  return problems;
}

async function main() {
  const path = process.argv[2] ?? fileURLToPath(new URL("../changelog.md", import.meta.url));
  const problems = await releaseProblems(path);
  if (problems.length === 0) {
    console.log("The changelog has no Unreleased entry and no page says it is not live; publishing may proceed.");
    return;
  }
  for (const problem of problems) {
    console.error(`::error file=${problem.file},line=${problem.line}::${problem.message}`);
  }
  process.exit(1);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  await main();
}
