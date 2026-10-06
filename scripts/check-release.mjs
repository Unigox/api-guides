// Refuses to publish while changelog.md holds an "Unreleased" entry.
//
// Why this exists: a push to main is what publishes developers.unigox.com. publish-openapi.yml and
// publish-changelog.yml run on every push that touches the spec or the changelog, so merging docs for
// a change whose services are not deployed yet would show partners endpoints that answer 404 and
// behaviour production does not have. Docs written ahead of their release keep their changelog entry
// under an "## Unreleased" heading; while one is there, both publish jobs stop here. Once every service
// in the release is live, replace the heading with the release date: that push publishes both.
//
// Usage: node scripts/check-release.mjs [path/to/changelog.md]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Any heading level, so a "### Unreleased" section inside a dated entry blocks too.
const UNRELEASED_HEADING = /^#{1,6}[ \t]+unreleased\b/i;

// unreleasedHeadings returns the changelog's "Unreleased" headings, each with its 1-based line number.
export function unreleasedHeadings(markdown) {
  const found = [];
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (UNRELEASED_HEADING.test(line)) found.push({ line: index + 1, text: line.trim() });
  });
  return found;
}

async function main() {
  const path = process.argv[2] ?? fileURLToPath(new URL("../changelog.md", import.meta.url));
  const headings = unreleasedHeadings(await readFile(path, "utf8"));
  if (headings.length === 0) {
    console.log("changelog.md has no Unreleased entry; publishing may proceed.");
    return;
  }
  for (const heading of headings) {
    console.error(
      `::error file=changelog.md,line=${heading.line}::"${heading.text}" describes changes that are not live yet. ` +
        "Nothing is published until it carries the release date (see README, Releasing documentation ahead of the code).",
    );
  }
  process.exit(1);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  await main();
}
