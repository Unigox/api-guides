// Publishes one markdown file from this repo to one existing GitBook page.
//
// Why this exists (mirrors publish-openapi.yml): the GitBook space is NOT git-synced,
// so a markdown file in this repo is not automatically a page. This repo stays the
// source of truth; this script pushes the file into the existing GitBook page through a
// change request (create -> update -> merge), so the live page always equals the file.
// Editing the file and pushing is all that's needed — CI runs this and the page updates.
//
// The whole page is replaced on each run (repo is canonical), so don't hand-edit a
// published page in GitBook — edit its file here instead. A page edited by hand in GitBook
// drifts silently: tutorials/fiat-accounts kept documenting the removed identity routes
// for weeks after fiat-accounts.md here had been rewritten.
//
// Env:
//   GITBOOK_TOKEN   GitBook API token WITH content edit scope (not just openapi publish)
//   GITBOOK_SPACE   GitBook space id — the <id> in app.gitbook.com/o/<org>/s/<id>/...
//   SOURCE_FILE     repo-relative markdown file to publish (default "changelog.md")
//   PAGE_PATH       page path/slug in the space (default: CHANGELOG_PAGE, else "changelog")
//   GITBOOK_DRY_RUN when "1", only resolves the page (read-only) and exits — no writes
//
// Usage: SOURCE_FILE=fiat-accounts.md PAGE_PATH=tutorials/fiat-accounts node scripts/publish-page.mjs

import { readFile } from "node:fs/promises";

const API = "https://api.gitbook.com/v1";
const token = process.env.GITBOOK_TOKEN;
const space = process.env.GITBOOK_SPACE;
const sourceFile = process.env.SOURCE_FILE || "changelog.md";
const pagePath = process.env.PAGE_PATH || process.env.CHANGELOG_PAGE || "changelog";
const dryRun = process.env.GITBOOK_DRY_RUN === "1";

if (!token || !space) {
  console.error("::error::Missing GITBOOK_TOKEN (content scope) or GITBOOK_SPACE. See the header of this script.");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Never echo the token; surface status + response body (truncated) for debugging.
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : {};
}

const markdown = await readFile(new URL(`../${sourceFile}`, import.meta.url), "utf8");
if (!markdown.trim()) throw new Error(`${sourceFile} is empty — refusing to publish`);

// 1. Resolve the page id from its path/slug (read-only preflight).
const node = await api("GET", `/spaces/${space}/content/path/${encodeURIComponent(pagePath)}`);
const pageId = node?.page?.id || node?.id;
if (!pageId) {
  throw new Error(
    `Could not resolve a page id at path "${pagePath}". Create the page in GitBook first ` +
      `(or set PAGE_PATH to its slug). Response: ${JSON.stringify(node).slice(0, 400)}`,
  );
}
console.log(`Resolved page: ${pageId} (path "${pagePath}"), ${markdown.length} bytes of ${sourceFile} to publish.`);

if (dryRun) {
  console.log("GITBOOK_DRY_RUN=1 — read-only preflight OK, no change request created.");
  process.exit(0);
}

// 2. Open a change request.
const cr = await api("POST", `/spaces/${space}/change-requests`, { subject: `Update ${pagePath} from ${sourceFile}` });
const crId = cr?.id;
if (!crId) throw new Error(`Change request creation returned no id: ${JSON.stringify(cr).slice(0, 300)}`);

// 3. Replace the page document with the file (markdown import). The content
// endpoint takes a `changes` array of operations, applied in order.
await api("POST", `/spaces/${space}/change-requests/${crId}/content`, {
  changes: [{ operation: "update_page", page: pageId, document: { markdown } }],
});

// 4. Merge the change request so the page goes live.
await api("POST", `/spaces/${space}/change-requests/${crId}/merge`, {});

console.log(`Published ${sourceFile} to GitBook page ${pageId} via change request ${crId}.`);
