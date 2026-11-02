// Run with: node --test scripts/*.test.mjs
//
// The Unigox Checkout guide and its link check. Release audit r11 (dev-ux-07, dev-ux-26) found the portal's
// "Integration guide" opening raw markdown, and the crypto payments guide linking a tutorials/crypto-checkout page that
// nothing published. The guide is now published from this repository; these checks keep the link, the page, its
// publishing and its release state together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { guides, renderGuide } from "./publish-memo-guides.mjs";
import { PAGE_NOTICE, headingSlug, leadOf, releaseProblems } from "./check-release.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SITE = "https://developers.unigox.com/";

// The checkout guide's six pages (unigox.com scripts/crypto-checkout-guide-sync.mjs writes them, and
// checkout-integration.md, the whole guide on one page, from the one guide).
const CHECKOUT_PAGES = ["checkout-quickstart.md", "checkout-embed.md", "checkout-confirm.md", "checkout-links.md", "checkout-reference.md", "checkout-testing.md"];

test("every developers.unigox.com page the crypto guides link to is one this repository publishes", () => {
  const published = new Set(guides.map((g) => g.path));
  // openapi/swagger.yaml too (docs review R1-docs-dev-1): it linked the reference by its former address, bridge-payments.
  for (const page of ["crypto-payments.md", "checkout-integration.md", "api-reference/payment-addresses.md", "openapi/swagger.yaml", ...CHECKOUT_PAGES]) {
    for (const [, path] of read(page).matchAll(/https:\/\/developers\.unigox\.com\/([a-z0-9/-]+)/g)) {
      assert.ok(published.has(path), `${page} links ${SITE}${path}, which publish-memo-guides.mjs does not publish`);
    }
  }
  const swagger = read("openapi/swagger.yaml");
  assert.doesNotMatch(swagger, /api-reference\/bridge-payments|Bridge payment API|Bridge memo/, "the API spec names the reference by its current address and title");
  assert.match(swagger, /\(https:\/\/developers\.unigox\.com\/api-reference\/payment-addresses\)/);
  const checkout = guides.find((g) => g.path === "tutorials/crypto-checkout");
  assert.ok(checkout, "the checkout guide is published at tutorials/crypto-checkout");
  assert.equal(checkout.source, "checkout-quickstart.md", "the guide's address opens on its Quickstart");
  for (const page of CHECKOUT_PAGES) {
    assert.ok(existsSync(new URL(`../${page}`, import.meta.url)), page);
    assert.ok(guides.some((g) => g.source === page), `${page} is not published`);
    assert.match(read(".github/workflows/publish-memo-guides.yml"), new RegExp(`- ${page.replace(".", "\\.")}\\n`), `a change to ${page} runs the publish job`);
  }
});

test("every link to a section of another developer page names a section that page has (docs review L61 / L96)", () => {
  // crypto-payments.md sent "Customer deposit addresses" to tutorials/crypto-checkout-server, which has no such section.
  const sources = new Map(guides.map((g) => [g.path, g.source]));
  const anchorsOf = (text) => {
    let fenced = false;
    const found = new Set();
    for (const line of text.split("\n")) {
      if (/^\s*```/.test(line)) fenced = !fenced;
      const h = !fenced && /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
      if (h) found.add(headingSlug(h[1]));
    }
    return found;
  };
  let checked = 0;
  for (const page of ["crypto-payments.md", "checkout-integration.md", "api-reference/payment-addresses.md", "changelog.md", ...CHECKOUT_PAGES]) {
    for (const [, path, anchor] of read(page).matchAll(/https:\/\/developers\.unigox\.com\/([a-z0-9/-]+)#([^)\s]+)/g)) {
      const source = sources.get(path);
      assert.ok(source, `${page}: ${path} is not a page publish-memo-guides.mjs publishes`);
      assert.ok(anchorsOf(read(source)).has(decodeURIComponent(anchor)), `${page}: ${SITE}${path}#${anchor} has no such section (in ${source})`);
      checked++;
    }
  }
  assert.ok(checked > 20, `only ${checked} section links checked`);
});

test("the six pages are the whole guide: each section once, and a bar that links every other page", () => {
  const sections = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const fromPages = CHECKOUT_PAGES.flatMap((p) => sections(read(p)));
  assert.deepEqual([...fromPages].sort(), [...sections(read("checkout-integration.md"))].sort());
  const pages = guides.filter((g) => CHECKOUT_PAGES.includes(g.source));
  for (const page of CHECKOUT_PAGES) {
    const text = read(page);
    assert.match(text, /^> \*\*Unigox Checkout guide:\*\* /m, `${page}: no page bar`);
    for (const g of pages) if (g.source !== page) assert.ok(text.includes(`(${SITE}${g.path})`), `${page}: no link to ${g.path}`);
  }
});

test("the checkout guide publishes as written: only absolute links, nothing for the publisher to rewrite", () => {
  for (const page of ["checkout-integration.md", ...CHECKOUT_PAGES]) {
    const guide = read(page);
    assert.equal(renderGuide(guide), guide, page);
    assert.doesNotMatch(guide, /\]\((?!https?:|#)[^)]*\.md/, `${page}: a repository-relative link would not resolve on the site`);
  }
});

test("the changelog announces the checkout guide and its link check, which is not a Bridge endpoint", () => {
  const changelog = read("changelog.md");
  assert.match(changelog, /\]\(\.\/checkout-integration\.md\)/);
  // In plain words: the endpoint's path stays in the guide, and the changelog speaks of no internal name.
  assert.match(changelog, /\[Link check\]\(\.\/checkout-links\.md\): an endpoint that confirms an address belongs to your link/);
  // Docs review L25 / L60 / L96: six pages, the server links page among them, and deposits and the link check on it.
  const unreleased = changelog.slice(changelog.indexOf("## Unreleased"), changelog.indexOf("\n## ", changelog.indexOf("## Unreleased") + 5));
  assert.match(unreleased, /On the developer site it is six pages: /);
  for (const page of CHECKOUT_PAGES) assert.ok(unreleased.includes(`](./${page})`), `the Unreleased entry does not list ${page}`);
  assert.doesNotMatch(unreleased, /checkout-server\.md|\bfive pages\b/);
  assert.match(unreleased, /section "Customer deposit addresses" of \[Links and deposit pages from your server\]\(\.\/checkout-links\.md\)/);
  // No internal service names in what partners read (L104); the reference's new address is named instead.
  assert.doesNotMatch(unreleased, /\bBridge\b|\brelay|public fingerprint/);
  assert.match(unreleased, /`api-reference\/payment-addresses`/);
  const cryptoEntries = changelog.slice(0, changelog.indexOf("## 2026-10-26"));
  assert.ok(cryptoEntries.includes("credited to your Unigox balance"));
  assert.doesNotMatch(cryptoEntries, /memo-locks\/\{lockId\}|memo v2|\bXAI\b|UNIGOX balance|collection address/);
  // The Bridge stays as on its main: its reference documents no lock read of its own.
  const bridge = read("api-reference/payment-addresses.md");
  assert.doesNotMatch(bridge, /## Public lock read|GET \/memo-locks\/\{lockId\}/);
  assert.doesNotMatch(changelog, /bridge-payments\.md#public-lock-read/);
});

test("while the checkout release is pending, every page and section it adds says so", async () => {
  // The release check finds nothing but the Unreleased heading itself: every page and section it links opens with
  // the notice. Once the entry is dated, it finds nothing at all (no page may still carry the notice).
  const problems = await releaseProblems(new URL("../changelog.md", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  assert.deepEqual(problems.filter((p) => !/describes changes that are not live yet/.test(p.message)), []);
  const pending = problems.length > 0;
  for (const [page, anchor] of [["checkout-integration.md", ""], ...CHECKOUT_PAGES.map((p) => [p, ""]), ["crypto-payments.md", "unigox-checkout-and-the-business-portal"]]) {
    assert.equal(leadOf(read(page), anchor).includes(PAGE_NOTICE), pending, `${page}#${anchor}`);
  }
});
