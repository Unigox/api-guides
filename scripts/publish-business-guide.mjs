// Creates the approved business article in the existing guide.unigox.com space.
// The old integration-guide/introduction page is never edited. --dry-run is read-only.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { locatePage } from "./publish-memo-guides.mjs";

export const SPACE = "R5WxtczoTRZuTKmBWr2I";
export const PAGE_PATH = "integration-guide/unigox-for-business";
export const TITLE = "How Unigox works for your business";
const SOURCE = "business/unigox-for-business.md";
const COVER = "business/assets/unigox-business-guide-cover.png";

function childrenOf(pages, parent) {
  for (const page of pages ?? []) {
    if (page.id === parent) return page.pages ?? [];
    const children = childrenOf(page.pages, parent);
    if (children) return children;
  }
}

// GitBook normalizes Markdown escaping, whitespace and list markers. Check every
// paragraph, list item, section and external link.
export function verifyArticle(actual, expected) {
  if (typeof actual !== "string") throw new Error("GitBook did not return imported Markdown");
  const normalize = value => value.replace(/^\s*[-+*] /gm, "").replace(/\\([*_\[\]()])/g, "$1").replace(/\s+/g, " ").trim();
  const text = normalize(actual);
  for (const block of expected.split(/\n\s*\n|\n(?=\s*[-+*] )/)) {
    if (block.startsWith("<figure>")) {
      const alt = block.match(/alt="([^"]+)"/)?.[1];
      if (alt && !actual.includes(`alt="${alt}"`)) throw new Error("Imported cover alt text missing");
      continue; // Uploaded image URL and original bytes are checked separately.
    }
    if (block.startsWith("![")) continue;
    if (!text.includes(normalize(block))) throw new Error(`Imported content missing: ${block.slice(0, 100)}`);
  }
}

export async function publishBusinessGuide(api, { dryRun, commit, markdown, coverHash }) {
  const base = `/spaces/${SPACE}`;
  const space = await api("GET", base);
  if (![space.urls?.published, space.urls?.public].some(url => url && new URL(url).hostname === "guide.unigox.com")) {
    throw new Error("Refusing to publish outside guide.unigox.com");
  }
  const tree = await api("GET", `${base}/content`);
  const introduction = locatePage(tree.pages, "integration-guide/introduction");
  if (!introduction?.parent) throw new Error("Existing Business section could not be resolved");
  const existing = locatePage(tree.pages, PAGE_PATH);
  if (existing && (existing.parent !== introduction.parent || existing.page.id === introduction.page.id)) {
    throw new Error("Unexpected page identity or Business parent");
  }
  if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("A pinned GitHub commit is required");
  const coverUrl = `https://raw.githubusercontent.com/Unigox/api-guides/${commit}/${COVER}`;
  console.log(`${existing ? "Refresh" : "Create"} ${PAGE_PATH}; leave integration-guide/introduction unchanged.`);
  if (dryRun) return { dryRun: true, path: PAGE_PATH, parent: introduction.parent, coverUrl };

  const cr = await api("POST", `${base}/change-requests`, { subject: "Publish Unigox for business as a new article" });
  if (!cr.id || !cr.revision) throw new Error("GitBook change request has no ID/revision");
  const target = `${base}/change-requests/${cr.id}`;
  console.log(`Prepared GitBook change request ${cr.id}`);
  const before = await api("GET", `${target}/content/path/integration-guide%2Fintroduction?format=markdown`);
  const result = await api("POST", `${target}/content?compat=false`, {
    expectedRevision: cr.revision,
    changes: [
      { operation: "insert_files", files: [{ ref: "assets/unigox-business-guide-cover.png", name: "unigox-business-guide-cover.png", contentType: "image/png", url: coverUrl }] },
      {
        ...(existing ? { operation: "update_page", page: existing.page.id } : { operation: "insert_page", slug: "unigox-for-business" }),
        into: introduction.parent,
        at: 0,
        icon: "briefcase",
        title: TITLE,
        linkTitle: "Unigox for business",
        description: "Business products, use cases and ways to get started.",
        document: { markdown },
      },
    ],
  });
  const file = result.insertedFiles?.find(item => item.name === "unigox-business-guide-cover.png");
  if (!file?.id || !file.downloadURL) throw new Error("Cover upload missing; change request left unmerged");
  const bytes = await fetch(file.downloadURL);
  if (!bytes.ok || createHash("sha256").update(Buffer.from(await bytes.arrayBuffer())).digest("hex") !== coverHash) {
    throw new Error("Uploaded cover differs from the approved original");
  }
  const imported = await api("GET", `${target}/content/path/${encodeURIComponent(PAGE_PATH)}?format=markdown`);
  verifyArticle(imported.markdown, markdown);
  if (!imported.markdown.includes(file.id) && !imported.markdown.includes(file.downloadURL)) {
    throw new Error("Imported article does not reference the uploaded cover");
  }
  const unchanged = await api("GET", `${target}/content/path/integration-guide%2Fintroduction?format=markdown`);
  if (unchanged.id !== before.id || unchanged.markdown !== before.markdown) throw new Error("Existing Introduction changed");
  const draftTree = await api("GET", `${target}/content`);
  const page = locatePage(draftTree.pages, PAGE_PATH);
  if (!page || page.parent !== introduction.parent || page.page.title !== TITLE) throw new Error("Published page metadata mismatch");
  if (existing && page.page.id !== existing.page.id) throw new Error("Duplicate page created");
  const expectedOrder = [page.page.id, ...childrenOf(tree.pages, introduction.parent).filter(item => item.id !== page.page.id).map(item => item.id)];
  const actualOrder = childrenOf(draftTree.pages, introduction.parent).map(item => item.id);
  if (page.page.icon !== "briefcase" || JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error("Business article must appear first with a briefcase icon; other pages retain their order");
  }
  const merge = await api("POST", `${target}/merge`, {});
  if (merge.result !== "merge") throw new Error(`GitBook did not merge cleanly: ${merge.result}`);
  return { url: `https://guide.unigox.com/${PAGE_PATH}`, pageId: page.page.id, changeRequest: cr.id, revision: merge.revision, commit, coverHash, coverUrl: file.downloadURL };
}

async function main() {
  const token = process.env.GITBOOK_TOKEN;
  if (!token) throw new Error("Missing GitBook publishing credential");
  const markdown = await readFile(new URL(`../${SOURCE}`, import.meta.url), "utf8");
  const cover = await readFile(new URL(`../${COVER}`, import.meta.url));
  if (!markdown.startsWith(`# ${TITLE}\n`) || !markdown.includes("https://calendly.com/hazem-unigox/30min")) throw new Error("Unexpected article source");
  const api = async (method, path, body) => {
    const response = await fetch(`https://api.gitbook.com/v1${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`GitBook ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const receipt = await publishBusinessGuide(api, {
    dryRun: process.argv.includes("--dry-run"), commit: process.env.GITHUB_SHA, markdown,
    coverHash: createHash("sha256").update(cover).digest("hex"),
  });
  await mkdir("publication", { recursive: true });
  await writeFile("publication/business-guide.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
