import assert from "node:assert/strict";
import { test } from "node:test";
import { addPartnerOperations, locatePage, renderGuide, verifyImportedGuide, publishMemoGuides, partnerOperations } from "./publish-memo-guides.mjs";

/** Returns an isolated existing reference with prose and a generated operation; no IO. */
function referenceFixture() {
  return { id: "reference", document: { object: "document", data: {}, meta: { token: "fixture-secret" }, nodes: [
    { object: "block", type: "paragraph", data: {}, nodes: [] },
    { object: "block", type: "openapi-operation", data: { method: "get", path: "/api/v1/partner/users", ref: { kind: "openapi", spec: "test-spec" } }, isVoid: true },
  ] } };
}

/** Proves retries do not duplicate operations or replace existing prose/reference blocks. */
test("append operations once and preserve existing blocks", () => {
  const before = referenceFixture();
  const result = addPartnerOperations(before, "test-spec");
  assert.equal(result.added, partnerOperations.length);
  assert.deepEqual(result.document.nodes.slice(0, before.document.nodes.length), before.document.nodes);
  assert.equal(before.document.meta.token, "fixture-secret");
  assert.equal(result.document.meta, undefined);
  assert.equal(addPartnerOperations({ id: before.id, document: result.document }, "test-spec").added, 0);
  assert.throws(() => addPartnerOperations(before, "wrong-spec"), /no blocks/);
});

/** Proves GitBook URLs and fragments replace repository paths without altering other text. */
test("cross-page URLs retain anchors", () => {
  const source = "[Read](api-reference/bridge-payments.md#network-readiness) [Guide](../crypto-payments.md) [Local](#same)";
  const rendered = renderGuide(source);
  assert.equal(rendered, "[Read](https://developers.unigox.com/api-reference/bridge-payments#network-readiness) [Guide](https://developers.unigox.com/tutorials/crypto-payments) [Local](#same)");
  verifyImportedGuide("## Section\n" + rendered, "## Section\n" + rendered, "test");
  assert.throws(() => verifyImportedGuide("## Section", "## Section\n" + rendered, "test"), /link missing/);
  assert.throws(() => verifyImportedGuide(rendered, "## Section\n" + rendered, "test"), /section missing/);
});

/** Proves parent lookup does not confuse identical slugs in different groups. */
test("find exact paths and their parent", () => {
  const pages = [{ id: "tutorials", pages: [{ id: "guide", path: "tutorials/crypto-payments" }] }];
  assert.equal(locatePage(pages, "tutorials/crypto-payments").parent, "tutorials");
  assert.equal(locatePage(pages, "elsewhere/crypto-payments"), undefined);
});

/** Proves dry-run cannot write and a missing parent fails before creating a change request. */
test("dry-run only reads; unknown parent stops publication", async () => {
  const calls = [];
  const tree = { pages: [
    { id: "tutorials", pages: [{ id: "fiat", path: "tutorials/fiat-accounts" }] },
    { id: "reference-group", pages: [{ id: "reference", path: "api-reference/user-management" }] },
  ] };
  /** Records requested HTTP methods; returns only fixture tree/reference data without IO. */
  async function api(method, path) {
    calls.push(method);
    return path.endsWith("/content") ? tree : referenceFixture();
  }
  await publishMemoGuides(api, "test-space", true, "test-spec");
  assert.ok(calls.every(isGet));
  tree.pages = [];
  await assert.rejects(publishMemoGuides(api, "test-space", false, "test-spec"), /Cannot resolve existing parent/);
  assert.ok(calls.every(isGet));
});

/** @param {string} method Recorded method. @returns {boolean} Whether no write was requested. */
function isGet(method) { return method === "GET"; }
