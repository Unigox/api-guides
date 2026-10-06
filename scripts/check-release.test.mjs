// Run with: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { unreleasedHeadings } from "./check-release.mjs";

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

function runCheck(markdown) {
  const path = join(mkdtempSync(join(tmpdir(), "check-release-")), "changelog.md");
  writeFileSync(path, markdown);
  try {
    execFileSync(process.execPath, [script, path], { stdio: "pipe" });
    return { code: 0, stderr: "" };
  } catch (error) {
    return { code: error.status, stderr: String(error.stderr) };
  }
}

test("the command fails on an Unreleased entry and passes a dated one", () => {
  const refused = runCheck("# Changelog\r\n\r\n## Unreleased\r\n\r\n- new\r\n");
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /::error file=changelog\.md,line=3::/);

  assert.equal(runCheck("# Changelog\n\n## 2026-10-12\n").code, 0);
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

// Dating the Unreleased heading is a changelog-only push; it must publish the spec it was holding back.
test("a changelog push also republishes the spec", () => {
  const text = readFileSync(join(root, ".github/workflows/publish-openapi.yml"), "utf8");
  assert.match(text, /paths:\s*\r?\n(\s*- "[^"]+"\s*\r?\n)*\s*- "changelog\.md"/);
});
