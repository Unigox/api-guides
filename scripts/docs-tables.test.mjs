// Run with: node --test scripts/*.test.mjs
//
// A markdown table ends at the first line that is not a row, so a paragraph pasted between two rows
// leaves every row after it as raw pipe text. That is how the estimate's exclude_delayed_settlement
// option dropped out of its table in the delayed settlement guide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function markdownFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(dir, entry.name));
}

// orphanRows returns the table rows that belong to no table: neither under another row nor a header
// followed by its delimiter line. Fenced code is skipped.
export function orphanRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const orphans = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced;
      return;
    }
    if (fenced || !line.startsWith("|")) return;
    const previous = lines[index - 1] ?? "";
    const next = lines[index + 1] ?? "";
    if (previous.startsWith("|") || /^\|\s*:?-{3,}/.test(next)) return;
    orphans.push(index + 1);
  });
  return orphans;
}

test("a row after a paragraph inside a table is an orphan", () => {
  const markdown = ["| Field | Effect |", "| --- | --- |", "| a | x |", "", "A paragraph.", "| b | y |"].join("\n");
  assert.deepEqual(orphanRows(markdown), [6]);
  assert.deepEqual(orphanRows(["| Field | Effect |", "| --- | --- |", "| a | x |", "| b | y |"].join("\r\n")), []);
});

test("no table row in the guides stands outside its table", () => {
  for (const file of [...markdownFiles("."), ...markdownFiles("api-reference")]) {
    assert.deepEqual(orphanRows(readFileSync(join(root, file), "utf8")), [], `${file}: rows outside any table`);
  }
});
