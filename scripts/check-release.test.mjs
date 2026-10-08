// Run with: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAGE_NOTICE,
  leadOf,
  localLinks,
  releaseProblems,
  unreleasedHeadings,
  unreleasedSections,
} from "./check-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = join(root, "scripts", "check-release.mjs");

test("an Unreleased heading is found, with its line, in CRLF and LF files", () => {
  for (const eol of ["\n", "\r\n"]) {
    const markdown = ["# Changelog", "", "## Unreleased", "", "- new", "", "## 2026-09-23", ""].join(eol);
    assert.deepEqual(unreleasedHeadings(markdown), [{ line: 3, text: "## Unreleased" }]);
  }
});

test("any heading level and any case counts; the word in running text does not", () => {
  const markdown = [
    "## 2026-10-01",
    "### unreleased: the T+1 part",
    "The unreleased endpoints are listed below.",
    "#### UNRELEASED",
  ].join("\n");
  assert.deepEqual(
    unreleasedHeadings(markdown).map((heading) => heading.line),
    [2, 4],
  );
});

test("a fully dated changelog has nothing unreleased", () => {
  assert.deepEqual(unreleasedHeadings("# Changelog\n\n## 2026-10-12\n\n- shipped\n"), []);
});

// docsTree writes files (path -> text) into a fresh directory and returns it.
function docsTree(files) {
  const dir = mkdtempSync(join(tmpdir(), "check-release-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function runCheckIn(dir) {
  try {
    execFileSync(process.execPath, [script, join(dir, "changelog.md")], { stdio: "pipe" });
    return { code: 0, stderr: "" };
  } catch (error) {
    return { code: error.status, stderr: String(error.stderr) };
  }
}

// withTree runs fn on a fresh docs tree and removes the tree afterwards.
async function withTree(files, fn) {
  const dir = docsTree(files);
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCheck(markdown) {
  return withTree({ "changelog.md": markdown }, runCheckIn);
}

test("the command fails on an Unreleased entry and passes a dated one", async () => {
  const refused = await runCheck("# Changelog\r\n\r\n## Unreleased\r\n\r\n- new\r\n");
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /::error file=changelog\.md,line=3::/);

  assert.equal((await runCheck("# Changelog\n\n## 2026-10-12\n")).code, 0);
});

test("the lead of a page, or of the section an anchor names, is what a reader meets first", () => {
  const page = [
    "# Guide",
    "",
    `> ${PAGE_NOTICE} Soon.`,
    "",
    "```md",
    "## not a heading",
    "```",
    "## Step 4: sign the release",
    "Body.",
    "### Inner",
    "More.",
  ].join("\r\n");
  assert.match(leadOf(page), /Not available yet/);
  assert.match(leadOf(page), /not a heading/);
  assert.equal(leadOf(page, "step-4-sign-the-release"), "Body.");
  assert.equal(leadOf(page, "no-such-section"), null);
});

test("the pages an Unreleased entry links to are found, with their anchors", () => {
  const changelog = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "- See the [guide](./api-reference/guide.md) and [a section](./api-reference/other.md#when-a-payout-is-delayed),",
    "  not [the site](https://example.com/page.md) or [this page](#unreleased).",
    "### A part of it",
    "- And [the index](./api-reference/README.md).",
    "",
    "## 2026-09-23",
    "",
    "- Live: [old](./api-reference/old.md).",
  ].join("\n");
  const sections = unreleasedSections(changelog);
  assert.equal(sections.length, 1);
  assert.deepEqual(localLinks(sections[0]), [
    { path: "./api-reference/guide.md", anchor: "" },
    { path: "./api-reference/other.md", anchor: "when-a-payout-is-delayed" },
    { path: "./api-reference/README.md", anchor: "" },
  ]);
});

const unreleasedChangelog = [
  "# Changelog",
  "",
  "## Unreleased",
  "",
  "- The [guide](./api-reference/guide.md) and [a section](./api-reference/other.md#when-a-payout-is-delayed).",
  "",
].join("\n");

test("while an entry is Unreleased, every page or section it links to opens with the notice", async () => {
  const marked = {
    "changelog.md": unreleasedChangelog,
    "api-reference/guide.md": `# Guide\r\n\r\n> ${PAGE_NOTICE} Soon.\r\n\r\n## Body\r\n`,
    "api-reference/other.md": `# Other\n\nLive.\n\n## When a payout is delayed\n\n> ${PAGE_NOTICE} Soon.\n\nText.\n`,
  };
  const files = (problems) => problems.map((problem) => problem.file);
  await withTree(marked, async (dir) => {
    assert.deepEqual(files(await releaseProblems(join(dir, "changelog.md"))), ["changelog.md"]);
  });

  const unmarked = {
    "changelog.md": unreleasedChangelog,
    // The notice further down the page is not what a reader meets first.
    "api-reference/guide.md": `# Guide\n\nText.\n\n## Body\n\n> ${PAGE_NOTICE} Too late.\n`,
    // The notice on the page is not on the section the entry links to.
    "api-reference/other.md": `# Other\n\n> ${PAGE_NOTICE} Elsewhere.\n\n## When a payout is delayed\n\nText.\n`,
  };
  await withTree(unmarked, async (dir) => {
    const problems = await releaseProblems(join(dir, "changelog.md"));
    assert.deepEqual(files(problems), ["changelog.md", "api-reference/guide.md", "api-reference/other.md"]);
    assert.match(problems[2].message, /other\.md#when-a-payout-is-delayed/);
  });

  await withTree({ "changelog.md": unreleasedChangelog, "api-reference/guide.md": `# Guide\n\n> ${PAGE_NOTICE}\n` }, async (dir) => {
    const problems = await releaseProblems(join(dir, "changelog.md"));
    assert.match(problems.at(-1).message, /api-reference\/other\.md, which does not exist/);
  });
});

test("while an entry is Unreleased, an index entry listing a page that is not live carries the notice", async () => {
  const pages = {
    "changelog.md": unreleasedChangelog,
    "api-reference/guide.md": `# Guide\n\n> ${PAGE_NOTICE} Soon.\n`,
    "api-reference/other.md": `# Other\n\nLive.\n\n## When a payout is delayed\n\n> ${PAGE_NOTICE} Soon.\n`,
  };
  const indexProblems = async (index) =>
    withTree({ ...pages, ...index }, async (dir) =>
      (await releaseProblems(join(dir, "changelog.md"))).filter((problem) => problem.file !== "changelog.md"),
    );

  // other.md is linked by a section only, so it stays listed as a live page.
  const marked = [
    "# API Reference",
    "",
    "- [Other](./other.md)",
    `- [Guide](./guide.md) — ${PAGE_NOTICE}`,
    "",
  ].join("\r\n");
  assert.deepEqual(await indexProblems({ "api-reference/README.md": marked }), []);

  const unmarked = ["# API Reference", "", "- [Other](./other.md)", "* [Guide](guide.md#body)", ""].join("\n");
  const problems = await indexProblems({ "api-reference/README.md": unmarked });
  assert.deepEqual(
    problems.map((problem) => `${problem.file}:${problem.line}`),
    ["api-reference/README.md:4"],
  );
  assert.match(problems[0].message, /api-reference\/guide\.md/);

  // A table of contents counts as an index; running text and fenced examples do not.
  const summary = [
    "# Summary",
    "",
    "1. [Guide](api-reference/guide.md)",
    "See the [guide](api-reference/guide.md).",
    "```md",
    "- [Guide](api-reference/guide.md)",
    "```",
  ].join("\n");
  assert.deepEqual(
    (await indexProblems({ "SUMMARY.md": summary })).map((problem) => `${problem.file}:${problem.line}`),
    ["SUMMARY.md:3"],
  );
});

test("once the entry is dated, the command fails while any page still says it is not live", async () => {
  const dated = "# Changelog\n\n## 2026-10-12\n\n- Shipped.\n";
  const leftover = {
    "changelog.md": dated,
    // The maintainers' README describes the notice; it is not a page.
    "README.md": `Pages written ahead of a release open with \`> ${PAGE_NOTICE}\`.\n`,
    "api-reference/guide.md": `# Guide\r\n\r\n> ${PAGE_NOTICE} Soon.\r\n`,
    "api-reference/README.md": `- [Guide](./guide.md) ${PAGE_NOTICE}\n`,
  };
  await withTree(leftover, async (dir) => {
    const refused = runCheckIn(dir);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /::error file=api-reference\/guide\.md,line=3::/);
    assert.match(refused.stderr, /::error file=api-reference\/README\.md,line=1::/);
    assert.doesNotMatch(refused.stderr, /file=README\.md/);
  });

  const leftoverInChangelog = { "changelog.md": `${dated}\n${PAGE_NOTICE} Everything here goes live later.\n` };
  await withTree(leftoverInChangelog, async (dir) => {
    assert.match(runCheckIn(dir).stderr, /::error file=changelog\.md,line=7::/);
  });

  await withTree({ "changelog.md": dated, "api-reference/guide.md": "# Guide\n\nLive.\n" }, async (dir) => {
    assert.equal(runCheckIn(dir).code, 0);
  });
});

// Git-synced pages publish on merge, whatever the CI jobs do: the repository itself must be consistent.
test("the repository's pages carry the notices its Unreleased entry needs, and none once it is dated", async () => {
  const problems = await releaseProblems(join(root, "changelog.md"));
  const pending = unreleasedHeadings(readFileSync(join(root, "changelog.md"), "utf8")).length;
  assert.deepEqual(
    problems.slice(pending).map((problem) => `${problem.file}:${problem.line}: ${problem.message}`),
    [],
  );
});

// The script only protects the live site if both publish jobs run it before they publish.
test("both publish workflows run the check before publishing", () => {
  const workflows = [
    [".github/workflows/publish-openapi.yml", "gitbook openapi publish"],
    [".github/workflows/publish-changelog.yml", "node scripts/publish-changelog.mjs"],
  ];
  for (const [file, publishCommand] of workflows) {
    const text = readFileSync(join(root, file), "utf8");
    const check = text.indexOf("node scripts/check-release.mjs");
    assert.notEqual(check, -1, `${file} does not run scripts/check-release.mjs`);
    // lastIndexOf: the publish command also appears in the header comment of publish-openapi.yml.
    assert.ok(check < text.lastIndexOf(publishCommand), `${file} publishes before it checks`);
  }
});

// The tests guard the docs only if a pull request cannot merge while they fail.
test("pull requests and pushes to main run every test in scripts", () => {
  const text = readFileSync(join(root, ".github/workflows/test.yml"), "utf8");
  const triggers = /^on:[ \t]*\r?\n((?:[ \t]+.*\r?\n)+)/m.exec(text)?.[1] ?? "";
  assert.match(triggers, /^[ \t]+pull_request:/m, "test.yml does not run on pull requests");
  assert.match(triggers, /^[ \t]+push:[ \t]*\r?\n[ \t]+branches:[ \t]*\[[ \t]*main[ \t]*\]/m, "test.yml does not run on main");
  assert.match(text, /run:[ \t]*node --test scripts\/\*\.test\.mjs[ \t]*\r?$/m, "test.yml does not run scripts/*.test.mjs");
});

// Dating the Unreleased heading is a changelog-only push; it must publish the spec it was holding back.
test("a changelog push also republishes the spec", () => {
  const text = readFileSync(join(root, ".github/workflows/publish-openapi.yml"), "utf8");
  assert.match(text, /paths:\s*\r?\n(\s*- "[^"]+"\s*\r?\n)*\s*- "changelog\.md"/);
});
