// Publish the two memo guides into the existing Tutorials and API Reference
// groups. Other pages and their ordering/content are never replaced.
// GITBOOK_TOKEN and GITBOOK_SPACE reuse the existing page-publishing settings.
// --dry-run resolves the live parents/pages without creating a change request.
// API contract: https://api.gitbook.com/openapi.json (insert_page/update_page).
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const guides = [
  { source: "crypto-payments.md", path: "tutorials/crypto-payments", sibling: "tutorials/fiat-accounts", title: "Accept crypto payments on EVM, TON, Solana and Tron" },
  { source: "api-reference/bridge-payments.md", path: "api-reference/bridge-payments", sibling: "api-reference/user-management", title: "Bridge payment addresses and credited webhooks" },
];

// New User Management operations introduced by this release's swagger.yaml.
export const partnerOperations = [
  ["post", "/api/v1/partner/users/{user_uuid}/wallet/challenge"],
  ["post", "/api/v1/partner/users/{user_uuid}/wallet"],
  ["get", "/api/v1/partner/users/{user_uuid}/wallet"],
  ["get", "/api/v1/partner/users/{user_uuid}/deposit-addresses"],
  ["post", "/api/v1/partner/users/{user_uuid}/deposit-addresses/{chainType}/allocate"],
];

/**
 * Publish just the configured memo pages in one GitBook change request.
 * @param {Function} api Authenticated GitBook transport; method/path/body -> JSON.
 * @param {string} space Existing GitBook space ID from repository configuration.
 * @param {boolean} dryRun When true, only read the live tree and local Markdown.
 * @param {string} spec Existing OpenAPI spec slug from repository configuration.
 * @returns {Promise<string[]>} Published page paths, or planned paths for dry-run.
 * Reads repository files/API; writes and merges only when dryRun is false.
 * Throws before merging if parents, imported content, or page identity differ.
 */
export async function publishMemoGuides(api, space, dryRun, spec) {
  const base = `/spaces/${encodeURIComponent(space)}`;
  const tree = await api("GET", `${base}/content`);
  const plan = [];
  for (const guide of guides) {
    const sibling = locatePage(tree.pages, guide.sibling);
    if (!sibling?.parent) throw new Error(`Cannot resolve existing parent for ${guide.path}`);
    const existing = locatePage(tree.pages, guide.path);
    if (existing && existing.parent !== sibling.parent) throw new Error(`Unexpected parent for ${guide.path}`);
    const source = await readFile(new URL(`../${guide.source}`, import.meta.url), "utf8");
    const markdown = renderGuide(source);
    if (!markdown.trim()) throw new Error(`Empty source: ${guide.source}`);
    plan.push({ ...guide, parent: sibling.parent, id: existing?.page.id, markdown });
    console.log(`${existing ? "Update" : "Create"} ${guide.path} under existing parent ${sibling.parent}`);
  }
  const reference = await api("GET", `${base}/content/path/api-reference%2Fuser-management?format=document`);
  const referenceChange = addPartnerOperations(reference, spec);
  console.log(`Add ${referenceChange.added} missing wallet/deposit operation blocks`);
  if (dryRun) return guides.map(pagePath);

  const cr = await api("POST", `${base}/change-requests`, { subject: "Publish memo payment guides from api-guides" });
  if (!cr.id || !cr.revision) throw new Error("Change request has no ID/revision");
  const target = `${base}/change-requests/${encodeURIComponent(cr.id)}`;
  console.log(`Prepared GitBook change request ${cr.id}`);
  const changes = [];
  for (const page of plan) {
    changes.push(page.id
      ? { operation: "update_page", page: page.id, document: { markdown: page.markdown } }
      : { operation: "insert_page", into: page.parent, slug: page.path.split("/").at(-1), title: page.title, document: { markdown: page.markdown } });
  }
  if (referenceChange.added) changes.push({ operation: "update_page", page: reference.id, document: { document: referenceChange.document } });
  await api("POST", `${target}/content`, { expectedRevision: cr.revision, changes });
  for (const page of plan) {
    const persisted = await api("GET", `${target}/content/path/${encodeURIComponent(page.path)}?format=markdown`);
    if (page.id && persisted.id !== page.id) throw new Error(`Page identity changed: ${page.path}`);
    verifyImportedGuide(persisted.markdown, page.markdown, page.path);
  }
  const importedReference = await api("GET", `${target}/content/path/api-reference%2Fuser-management?format=document`);
  if (importedReference.id !== reference.id || addPartnerOperations(importedReference, spec).added !== 0) {
    throw new Error("User Management operation blocks did not persist");
  }
  const result = await api("POST", `${target}/merge`, {});
  if (result.result !== "merge") throw new Error(`GitBook merge did not report a clean merge: ${result.result}`);
  console.log(`Published memo guides through change request ${cr.id}`);
  return guides.map(pagePath);
}

/**
 * Append only absent release operations, retaining existing JSON blocks unchanged.
 * @param {object} page Authenticated GitBook page containing its JSON document.
 * @param {string} spec Expected existing spec slug from GITBOOK_SPEC.
 * @returns {{document:object,added:number}} Cloned document (without content token),
 * and count of new blocks. No IO/mutation; throws for an unknown reference format.
 */
export function addPartnerOperations(page, spec) {
  if (!page.id || !Array.isArray(page.document?.nodes) || !spec) throw new Error("Missing User Management JSON document/spec");
  const document = structuredClone(page.document);
  delete document.meta;
  const existing = operationKeys(document.nodes, spec);
  if (!existing.size) throw new Error("User Management has no blocks for the configured spec");
  let added = 0;
  for (const [method, path] of partnerOperations) {
    if (existing.has(`${method} ${path}`)) continue;
    document.nodes.push({ object: "block", type: "openapi-operation", data: { method, path, ref: { kind: "openapi", spec } }, isVoid: true });
    added++;
  }
  return { document, added };
}

/** @param {object[]} nodes GitBook JSON nodes. @param {string} spec Expected spec slug.
 * @returns {Set<string>} Existing method/path pairs for that spec; no IO or mutation. */
function operationKeys(nodes, spec) {
  const keys = new Set();
  for (const node of nodes) {
    if (node.type === "openapi-operation" && node.data?.ref?.spec === spec) keys.add(`${node.data.method} ${node.data.path}`);
    if (Array.isArray(node.nodes)) for (const key of operationKeys(node.nodes, spec)) keys.add(key);
  }
  return keys;
}

/** @param {{path:string}} page Guide definition. @returns {string} Public page path; no effects. */
function pagePath(page) { return page.path; }

/**
 * Find one page and its containing group, without changing the tree.
 * @param {object[]} pages GitBook revision's recursive page list.
 * @param {string} path Full GitBook page path to match.
 * @param {string|null} parent Containing page/group ID; null denotes root.
 * @returns {{page:object,parent:string|null}|undefined} Match, or undefined.
 */
export function locatePage(pages, path, parent = null) {
  for (const page of pages ?? []) {
    if (page.path === path) return { page, parent };
    const nested = locatePage(page.pages, path, page.id);
    if (nested) return nested;
  }
}

/**
 * Convert the two repository-relative links to their published destinations.
 * @param {string} markdown Repository guide Markdown, including fragments.
 * @returns {string} Markdown with absolute public links; no IO or content changes.
 */
export function renderGuide(markdown) {
  return markdown
    .replace(/\]\(api-reference\/bridge-payments\.md(?=[#)])/g, "](https://developers.unigox.com/api-reference/bridge-payments")
    .replace(/\]\(\.\.\/crypto-payments\.md(?=[#)])/g, "](https://developers.unigox.com/tutorials/crypto-payments");
}

/**
 * Refuse a merge if the importer drops sections or converts links to plain text.
 * @param {string|undefined} actual Persisted GitBook Markdown.
 * @param {string} expected Source after link conversion.
 * @param {string} path Page path for diagnostics.
 * @returns {void} Throws on missing content; performs no external writes.
 */
export function verifyImportedGuide(actual, expected, path) {
  if (typeof actual !== "string") throw new Error(`Missing imported Markdown: ${path}`);
  for (const heading of expected.match(/^## .+$/gm) ?? []) {
    if (!actual.includes(heading)) throw new Error(`Imported section missing in ${path}: ${heading}`);
  }
  for (const link of expected.match(/https:\/\/developers\.unigox\.com\/[^)\s]+/g) ?? []) {
    if (!actual.includes(link)) throw new Error(`Imported link missing in ${path}: ${link}`);
  }
}

/**
 * Load required existing publishing credentials and invoke the scoped flow.
 * @returns {Promise<void>} Reads env/files and calls GitBook; --dry-run never writes.
 * Missing configuration or HTTP failures throw without exposing response bodies/tokens.
 */
async function main() {
  const token = process.env.GITBOOK_TOKEN;
  const space = process.env.GITBOOK_SPACE;
  const spec = process.env.GITBOOK_SPEC;
  if (!token || !space || !spec) throw new Error("Missing GITBOOK_TOKEN, GITBOOK_SPACE or GITBOOK_SPEC");
  /** @param {string} method HTTP method. @param {string} path GitBook API-relative path.
   * @param {object|undefined} body Optional JSON payload. @returns {Promise<object>} JSON response.
   * Calls official GitBook API; throws status only on failure to keep credentials private. */
  async function api(method, path, body) {
    const response = await fetch(`https://api.gitbook.com/v1${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`GitBook ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  await publishMemoGuides(api, space, process.argv.includes("--dry-run"), spec);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
