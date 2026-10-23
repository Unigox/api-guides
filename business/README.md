# Business article publication

`unigox-for-business.md` is the approved single-page business article. Its cover
is the original PNG in `assets/`, preserved without resizing or recompression.

The **Publish business article to GitBook** workflow publishes to:

https://guide.unigox.com/unigox-for-business

Organise the guide by business task, with product subsections. Short paragraphs
explain when a product helps; lists clarify flows, capabilities and terms. Keep
the non-custodial compatibility, integration options and partner earnings clear.
Product links lead to the live landings. Avoid turning every section into the
same audience-label-and-feature-list template.

The business guide is a root-level page with a briefcase icon, immediately after
the main Introduction. The redundant `integration-guide/introduction` page is
removed entirely. Integration Guide keeps its technical instructions and API.
The old business article URL and its Markdown URL redirect to the new address.
Other pages retain their content and order.

Pull requests run a read-only GitBook preflight. After merging to `main`, the
workflow uploads the cover from the pinned commit, inserts the new page (or
refreshes that same page on later runs), checks imported paragraphs, list items, links,
the main Introduction, navigation and cover bytes, then merges the GitBook change.
It stages the legacy URL redirects before merging and publishes them afterwards.
It uses the existing `GITBOOK_TOKEN` secret and an explicit user-guide space ID;
the repository's `GITBOOK_SPACE` variable targets the separate developer site.

Run `node --test scripts/*.test.mjs` before publication. The workflow receipt
records the GitBook page, change request, revision and cover hash. Check the
public page after the workflow completes; a repository merge alone is not proof
that the article is live.
