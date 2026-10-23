# Business article publication

`unigox-for-business.md` is the approved single-page business article. Its cover
is the original PNG in `assets/`, preserved without resizing or recompression.

The **Publish business article to GitBook** workflow publishes to:

https://guide.unigox.com/integration-guide/unigox-for-business

The guide uses short product descriptions and bullet lists of use cases and
capabilities. Keep the non-custodial compatibility, integration options and
partner earnings clear when editing. Product links lead to the live landings.

This is a separate page, first in the Integration Guide group with a briefcase
icon. The existing
`integration-guide/introduction` page is not updated or replaced. Other guide
pages and the developer API reference are outside this workflow's scope.

Pull requests run a read-only GitBook preflight. After merging to `main`, the
workflow uploads the cover from the pinned commit, inserts the new page (or
refreshes that same page on later runs), checks imported paragraphs, list items, links,
the original Introduction and cover bytes, then merges the GitBook change.
It uses the existing `GITBOOK_TOKEN` secret and an explicit user-guide space ID;
the repository's `GITBOOK_SPACE` variable targets the separate developer site.

Run `node --test scripts/*.test.mjs` before publication. The workflow receipt
records the GitBook page, change request, revision and cover hash. Check the
public page after the workflow completes; a repository merge alone is not proof
that the article is live.
