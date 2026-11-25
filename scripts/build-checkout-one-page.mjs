// Writes checkout-integration.md, the whole crypto processing guide on one page (for search and AI tools), from its
// six pages. Run after editing a page: node scripts/build-checkout-one-page.mjs. scripts/checkout-guide.test.mjs
// fails while the one page differs from the six.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PAGES = ["checkout-quickstart.md", "checkout-embed.md", "checkout-confirm.md", "checkout-links.md", "checkout-testing.md", "checkout-reference.md"];

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** A page without its title, its release notice and its page bar: what is left starts at its lead. */
function bodyOf(text) {
  const lines = text.split("\n");
  let i = 1;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].startsWith("> **Not available yet.**") || lines[i].startsWith("> **Crypto processing guide:**"))) i++;
  return lines.slice(i).join("\n").trim();
}

/** The one page: the first page's notice, then each page under a heading of its own name, its sections as they are. */
export function onePage() {
  const first = read(PAGES[0]);
  const notice = first.split("\n").find((line) => line.startsWith("> **Not available yet.**"));
  const parts = PAGES.map((file, n) => {
    const text = read(file);
    const title = text.split("\n")[0].replace(/^# (Crypto processing: )?/, "");
    const name = title.charAt(0).toUpperCase() + title.slice(1);
    // The first page's lead opens the guide; every other page's lead stands under its name.
    return n === 0 ? bodyOf(text) : `<!-- ${file} -->\n\n**${name}**\n\n${bodyOf(text)}`;
  });
  return `# Crypto processing: the whole guide\n\n${notice ? `${notice}\n\n` : ""}${parts.join("\n\n")}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeFileSync(fileURLToPath(new URL("../checkout-integration.md", import.meta.url)), onePage());
  console.log("checkout-integration.md written");
}
