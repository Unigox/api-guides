// Publishes changelog.md to the GitBook "Changelog" page.
//
// Why this exists (mirrors publish-openapi.yml): the GitBook space is NOT git-synced,
// so a markdown file in this repo is not automatically a page. This repo stays the
// source of truth for the changelog; this script pushes the current changelog.md into
// the existing GitBook Changelog page through a change request (create -> update -> merge),
// so the live page always equals changelog.md. Appending an entry to changelog.md and
// pushing is all that's needed — CI runs this and the page updates.
//
// The whole page is replaced on each run (repo is canonical), so don't hand-edit the
// GitBook Changelog page — edit changelog.md instead.
//
// Env:
//   GITBOOK_TOKEN   GitBook API token WITH content edit scope (not just openapi publish)
//   GITBOOK_SPACE   GitBook space id — the <id> in app.gitbook.com/o/<org>/s/<id>/...
//   CHANGELOG_PAGE  page path/slug in the space (default "changelog")
//   GITBOOK_DRY_RUN when "1", only resolves the page (read-only) and exits — no writes
//
// Usage: node scripts/publish-changelog.mjs

import { readFile } from "node:fs/promises";

const API = "https://api.gitbook.com/v1";
const token = process.env.GITBOOK_TOKEN;
const space = process.env.GITBOOK_SPACE;
const pagePath = process.env.CHANGELOG_PAGE || "changelog";
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

const markdown = await readFile(new URL("../changelog.md", import.meta.url), "utf8");
if (!markdown.trim()) throw new Error("changelog.md is empty — refusing to publish");

// 1. Resolve the Changelog page id from its path/slug (read-only preflight).
const node = await api("GET", `/spaces/${space}/content/path/${encodeURIComponent(pagePath)}`);
const pageId = node?.page?.id || node?.id;
if (!pageId) {
  throw new Error(
    `Could not resolve a page id at path "${pagePath}". Create the "Changelog" page in GitBook first ` +
      `(or set CHANGELOG_PAGE to its slug). Response: ${JSON.stringify(node).slice(0, 400)}`,
  );
}
console.log(`Resolved Changelog page: ${pageId} (path "${pagePath}"), ${markdown.length} bytes to publish.`);

if (dryRun) {
  console.log("GITBOOK_DRY_RUN=1 — read-only preflight OK, no change request created.");
  process.exit(0);
}

// 2. Open a change request.
const cr = await api("POST", `/spaces/${space}/change-requests`, { subject: "Update changelog" });
const crId = cr?.id;
if (!crId) throw new Error(`Change request creation returned no id: ${JSON.stringify(cr).slice(0, 300)}`);

// 3. Replace the page document with changelog.md (markdown import).
await api("POST", `/spaces/${space}/change-requests/${crId}/content`, {
  operation: "update_page",
  page: pageId,
  document: { markdown },
});

// 4. Merge the change request so the page goes live.
await api("POST", `/spaces/${space}/change-requests/${crId}/merge`, {});

console.log(`Published changelog.md to GitBook page ${pageId} via change request ${crId}.`);
