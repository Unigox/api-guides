import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publishBusinessGuide, verifyArticle, TITLE, PAGE_PATH } from "./publish-business-guide.mjs";

const markdown = `# ${TITLE}\n\nApproved introduction.\n\n<figure><img src="./assets/unigox-business-guide-cover.png" alt="Cover"><figcaption></figcaption></figure>\n\n## Payments\n\n[Payments API](https://www.unigox.com/payments-api) keeps your wallets.\n\n[Book a call](https://calendly.com/hazem-unigox/30min)\n`;
const tree = { pages: [{ id: "business", path: "integration-guide", pages: [{ id: "original", path: "integration-guide/introduction", title: "Introduction" }] }] };
const options = { dryRun: true, commit: "a".repeat(40), markdown, coverHash: "unused" };

test("dry-run resolves the existing Business group without writing", async () => {
  const calls = [];
  const result = await publishBusinessGuide(async (method, path) => {
    calls.push(method);
    return path.endsWith("/content") ? tree : { urls: { published: "https://guide.unigox.com/" } };
  }, options);
  assert.deepEqual(calls, ["GET", "GET"]);
  assert.equal(result.path, PAGE_PATH);
  assert.equal(result.parent, "business");
});

test("a different GitBook site is rejected before any mutation", async () => {
  await assert.rejects(publishBusinessGuide(async method => {
    assert.equal(method, "GET");
    return { urls: { published: "https://developers.unigox.com/" } };
  }, options), /outside guide/);
});

test("import verification rejects a missing paragraph or external link", () => {
  verifyArticle(markdown, markdown);
  assert.throws(() => verifyArticle(markdown.replace("keeps your wallets.", ""), markdown), /content missing/);
  assert.throws(() => verifyArticle(markdown.replace("https://www.unigox.com/payments-api", "https://www.unigox.com"), markdown), /content missing/);
  assert.throws(() => verifyArticle(markdown.replace('alt="Cover"', 'alt=""'), markdown), /alt text missing/);
});

test("publishing inserts a new page, checks the cover and preserves Introduction", async t => {
  const cover = Buffer.from("original image bytes");
  t.mock.method(globalThis, "fetch", async () => new Response(cover));
  let merged = false;
  const api = async (method, path, body) => {
    if (method === "GET" && !path.includes("/content")) return { urls: { public: "https://guide.unigox.com/" } };
    if (method === "POST" && path.endsWith("/change-requests")) return { id: "cr", revision: "rev" };
    if (method === "POST" && path.includes("/content?")) {
      assert.equal(body.expectedRevision, "rev");
      assert.deepEqual(body.changes.map(change => change.operation), ["insert_files", "insert_page"]);
      assert.equal(body.changes[1].into, "business");
      assert.equal(body.changes[1].slug, "unigox-for-business");
      assert.equal(body.changes[0].files[0].url.includes(options.commit), true);
      return { insertedFiles: [{ id: "cover-id", name: "unigox-business-guide-cover.png", downloadURL: "https://example.org/cover-id.png" }] };
    }
    if (path.includes("introduction?")) return { id: "original", markdown: "Original untouched page" };
    if (path.includes("unigox-for-business?")) return { id: "new", markdown: markdown.replace("./assets/unigox-business-guide-cover.png", "https://example.org/cover-id.png") };
    if (method === "GET" && path.endsWith("/content")) {
      if (!path.includes("change-requests")) return tree;
      const draft = structuredClone(tree);
      draft.pages[0].pages.push({ id: "new", path: PAGE_PATH, title: TITLE });
      return draft;
    }
    if (path.endsWith("/merge")) { merged = true; return { result: "merge", revision: "published" }; }
    throw new Error(`Unexpected call: ${method} ${path}`);
  };
  const receipt = await publishBusinessGuide(api, { ...options, dryRun: false, coverHash: createHash("sha256").update(cover).digest("hex") });
  assert.equal(merged, true);
  assert.equal(receipt.pageId, "new");
});
