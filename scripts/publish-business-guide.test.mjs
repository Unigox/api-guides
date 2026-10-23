import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publishBusinessGuide, verifyArticle, TITLE, PAGE_PATH, LEGACY_PATH } from "./publish-business-guide.mjs";

const markdown = `# ${TITLE}\n\nApproved introduction.\n\n<figure><img src="./assets/unigox-business-guide-cover.png" alt="Cover"><figcaption></figcaption></figure>\n\n## Payments\n\n[Payments API](https://www.unigox.com/payments-api) keeps your wallets.\n\n[Book a call](https://calendly.com/hazem-unigox/30min)\n`;
const tree = { pages: [{ id: "home", path: "introduction", title: "Introduction" }, { id: "business", path: "integration-guide", pages: [
  { id: "original", path: "integration-guide/introduction", title: "Introduction" },
  { id: "partner", path: "integration-guide/partner-integration-instructions", title: "Partner Integration Instructions" },
  { id: "api", path: "integration-guide/api", title: "API" },
] }] };
const options = { dryRun: true, commit: "a".repeat(40), markdown, coverHash: "unused" };

test("dry-run resolves the root destination without writing", async () => {
  const calls = [];
  const result = await publishBusinessGuide(async (method, path) => {
    calls.push(method);
    return path.endsWith("/content") ? tree : { urls: { published: "https://guide.unigox.com/" } };
  }, options);
  assert.deepEqual(calls, ["GET", "GET", "GET"]);
  assert.equal(result.path, PAGE_PATH);
  assert.equal(result.parent, null);
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

test("list verification accepts GitBook formatting but rejects a missing benefit", () => {
  const source = "## Payments API\n\n- **Deposits:** local payments.\n- **Your wallets:** keep your provider.\n\n[Product](https://www.unigox.com/payments-api)";
  const imported = source.replace(/^- /gm, "* ").replace("\n* **Your", "\n\n* **Your");
  verifyArticle(imported, source);
  assert.throws(() => verifyArticle(imported.replace("* **Your wallets:** keep your provider.", ""), source), /content missing/);
});

for (const mode of ["create", "move", "refresh"]) test(`publishing ${mode}: root business page, technical Introduction removed, other pages preserved`, async t => {
  const liveTree = structuredClone(tree);
  const article = { id: "new", path: PAGE_PATH, title: TITLE, icon: "briefcase" };
  if (mode === "move") liveTree.pages[1].pages.splice(1, 0, { ...article, path: LEGACY_PATH });
  if (mode === "refresh") {
    liveTree.pages[1].pages.shift();
    liveTree.pages.splice(1, 0, article);
  }
  const cover = Buffer.from("original image bytes");
  t.mock.method(globalThis, "fetch", async () => new Response(cover));
  let merged = false;
  let redirectsStaged = false;
  let redirectsPublished = false;
  const api = async (method, path, body) => {
    if (method === "GET" && !path.includes("/content")) return { urls: { public: "https://guide.unigox.com/", published: "https://guide.unigox.com/" } };
    if (method === "POST" && path.endsWith("/change-requests")) return { id: "cr", revision: "rev" };
    if (method === "POST" && path.includes("/content?")) {
      assert.equal(body.expectedRevision, "rev");
      assert.deepEqual(body.changes.map(change => change.operation), ["insert_files", mode === "create" ? "insert_page" : "update_page", ...(mode === "refresh" ? [] : ["delete_page"])]);
      const articleChange = body.changes[1];
      assert.equal(articleChange.into, mode === "create" ? undefined : null);
      assert.equal(articleChange.at, 1);
      assert.equal(articleChange.icon, "briefcase");
      assert.equal(articleChange.slug, "unigox-for-business");
      if (mode !== "create") assert.equal(articleChange.page, "new");
      if (mode !== "refresh") assert.deepEqual(body.changes[2], { operation: "delete_page", page: "original" });
      assert.equal(body.changes[0].files[0].url.includes(options.commit), true);
      return { insertedFiles: [{ id: "cover-id", name: "unigox-business-guide-cover.png", downloadURL: "https://example.org/cover-id.png" }] };
    }
    if (path.includes("/content/page/home?")) return { id: "home", markdown: "Main Introduction untouched" };
    if (path.includes("unigox-for-business?")) return { id: "new", markdown: markdown.replace("./assets/unigox-business-guide-cover.png", "https://example.org/cover-id.png") };
    if (method === "GET" && path.endsWith("/content")) {
      if (!path.includes("change-requests")) return liveTree;
      const draft = structuredClone(tree);
      draft.pages[1].pages.shift();
      draft.pages.splice(1, 0, article);
      return draft;
    }
    if (method === "PUT" && path.endsWith("/redirects")) {
      assert.deepEqual(body.redirects.map(item => item.source), [`/${LEGACY_PATH}`, `/${LEGACY_PATH}.md`]);
      if (body.redirects[0].intent === "draft") {
        assert.equal(merged, false);
        assert.deepEqual(body.redirects.map(item => item.destination.url), [`https://guide.unigox.com/${PAGE_PATH}`, `https://guide.unigox.com/${PAGE_PATH}.md`]);
        redirectsStaged = true;
        return { results: body.redirects.map(item => ({ source: item.source, status: "created" })) };
      }
      assert.equal(merged, true);
      assert(body.redirects.every(item => item.intent === "publish"));
      redirectsPublished = true;
      return { results: body.redirects.map(item => ({ source: item.source, status: "published" })) };
    }
    if (path.endsWith("/merge")) {
      assert.equal(redirectsStaged, true);
      merged = true;
      return { result: "merge", revision: "published" };
    }
    throw new Error(`Unexpected call: ${method} ${path}`);
  };
  const receipt = await publishBusinessGuide(api, { ...options, dryRun: false, coverHash: createHash("sha256").update(cover).digest("hex") });
  assert.equal(merged, true);
  assert.equal(redirectsPublished, true);
  assert.equal(receipt.pageId, "new");
});
