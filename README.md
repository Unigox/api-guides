# Unigox API Specification

Public API documentation is published on GitBook:

- https://developers.unigox.com/

This repository contains the public OpenAPI source used for the Unigox API documentation.

OpenAPI source file:

- `openapi/swagger.yaml`

Raw OpenAPI URL:

- https://raw.githubusercontent.com/Unigox/api-guides/main/openapi/swagger.yaml

## Publishing to GitBook

GitBook does **not** render the API reference directly from `openapi/swagger.yaml`.
Git Sync only syncs the markdown pages; the interactive API reference is rendered
from an OpenAPI spec that has been **published into GitBook**. Editing this file
updates GitHub but does not change developers.unigox.com until the spec is
re-published.

This is automated by `.github/workflows/publish-openapi.yml`, which re-publishes
on every push to `main` that touches `openapi/swagger.yaml`. It requires:

- Secret `GITBOOK_TOKEN` — a GitBook API token
- Variables `GITBOOK_ORG` and `GITBOOK_SPEC` — the target organization and spec

To publish manually (uses the official GitBook CLI, `@gitbook/cli`):

```
npx @gitbook/cli auth --token <token>   # token: https://app.gitbook.com/account/developer
npx @gitbook/cli openapi publish --organization <org> --spec <spec> openapi/swagger.yaml
```

## Updating the docs after a spec change

Two cases behave **differently** on developers.unigox.com:

- **Editing an existing endpoint** (params, responses, descriptions, schemas) —
  picked up automatically once the spec is re-published (the CI above). No extra
  steps.
- **Adding or removing an endpoint** (a new path/operation) — **NOT** picked up
  automatically. The GitBook API reference is generated as a one-time *snapshot*
  of the operation list: each operation is baked into the page as a fixed block
  when the reference is generated. GitBook keeps each existing block's content in
  sync with the spec, but it never diffs the spec's operation list against the
  page to add blocks for new operations. A new endpoint has no block and never
  appears — even though `swagger.yaml`, the raw URL, and the published spec are
  all correct.

This sync is decoupled and eventually-consistent, so a new endpoint *sometimes*
shows up on its own and sometimes doesn't — don't rely on it.

### When you add (or remove) an endpoint

1. Merge the `swagger.yaml` change to `main` (CI re-publishes the spec object).
2. Wait a couple of minutes, then check developers.unigox.com. If the new
   endpoint is there, you're done.
3. If it's missing, force a spec re-fetch: in GitBook, **OpenAPI →
   `unigox-public-api` → Check for updates**, wait ~1–2 min, look again.
4. If it's *still* missing, **regenerate the reference**: in the **Unigox API
   Guides** space, delete the existing OpenAPI API reference and re-add it from
   the same spec (raw URL). This re-bakes the full current operation list,
   including the new endpoint.

There is no GitBook API or CLI to regenerate the reference — step 4 must be done
in the GitBook editor. "Check for updates" (step 3) and opening a change request
only refresh existing operations; they do not add new ones.

This affects the generated API Reference pages (Health, Supported Resources,
User Management, On-Ramp, Liquidity, Off-Ramp, Orders, Webhooks) in the space
published at developers.unigox.com.

## Changelog

`changelog.md` is the source of truth for the public changelog page. Like the
OpenAPI spec, the GitBook space is **not** git-synced, so the file is pushed into
the GitBook **Changelog** page by CI (`.github/workflows/publish-changelog.yml` →
`scripts/publish-page.mjs`) on every change to `changelog.md`. The script
replaces the whole page via a change request (create → update → merge), so the
live page always equals `changelog.md` — **edit `changelog.md`, never the GitBook
page directly** (direct edits are overwritten on the next publish).

To add an entry: prepend a dated section to `changelog.md` and merge to `main`.

One-time setup (Settings → Secrets and variables → Actions):

- Secret `GITBOOK_TOKEN` — a GitBook API token **with content edit scope** (the
  openapi-publish token may be too narrow; regenerate with content permissions if
  the job 403s).
- Variable `GITBOOK_SPACE` — the space id (`<id>` in
  `app.gitbook.com/o/<org>/s/<id>/...`).
- Variable `CHANGELOG_PAGE` — optional; the page slug, defaults to `changelog`.
- The **Changelog** page must already exist in the space (create it once).

Test without merging: `GITBOOK_DRY_RUN=1 GITBOOK_TOKEN=… GITBOOK_SPACE=… node
scripts/publish-page.mjs` resolves the page read-only and makes no changes.

## Releasing documentation ahead of the code

Merging to `main` publishes: the two jobs above put the spec and the changelog on
developers.unigox.com. Docs for an API change must therefore reach `main` only
once every service behind the change is deployed, or partners read about
endpoints that answer `404` and behaviour production does not have yet.

- Merge the api-guides pull request **last**, after the services it describes and
  the API gateway routes are live.
- While the change is not live, keep its changelog entry under an
  `## Unreleased` heading. Both publish jobs run `scripts/check-release.mjs` first
  and refuse to publish while such a heading exists (the job fails and says why).
  That stops the two CI jobs and nothing else. The raw URL above serves `main`'s
  spec the moment it merges, and GitBook can pick that spec up without the CI job
  (the re-fetch described under "Updating the docs after a spec change"). The
  guard is a backstop for a mistaken merge, not a way to merge early.
- Neither job publishes the markdown pages, and where GitBook Git Sync is on a
  page on `main` reaches developers.unigox.com without them: treat every page on
  `main` as published. So a page written ahead of its release, or the section of a
  page that is, opens with a notice that starts `> **Not available yet.**`, and
  the `Unreleased` entry links to that page or section. An index entry that points
  to such a page (a list item of a folder's `README.md` or of a `SUMMARY.md`) ends
  with the same words. `scripts/check-release.mjs` holds both ends: while the
  entry is `Unreleased` it also fails when a page or section the entry links to
  does not open with the notice, or an index entry listing such a page does not
  carry the words; once no entry is `Unreleased` it fails while any page or the
  changelog still carries them (this README is not checked).
- Once the release is live, replace `Unreleased` with the release date and remove
  every notice in the same push. That push publishes the changelog and the spec
  together.

Run the guard's tests with `node --test scripts/*.test.mjs`. CI runs them on
every pull request and every push to `main` (`.github/workflows/test.yml`); make
that job a required status check of `main` so a red run blocks the merge.

## Bridge crypto payment guide

- `crypto-payments.md`: merchant checkout and settlement walkthrough.
- `api-reference/bridge-payments.md`: signed address requests, responses, callback
  verification and transaction reconciliation.

These pages describe the memo-address release contract, initially checked against Quote
`653080043c2a23bc68316e58daac7c3de1f7cd02`. Deadline metadata, address projections,
webhook environment guidance and route-specific error responses were checked against Quote
`4de61c51b7b025d6993c27091259e7f3237e6af9` on 2026-10-15. Collection-network and token
selection rules were also checked against that Quote head, Agent
`7a2bc0d871aa26d49b3bf0628a6db56ea2ecf5c2` and Solana Monitor
`c5bc893465c6166b201680f4541114ea6a7b501d` on 2026-10-15. They do not claim deployment
or a live merchant canary. The wallet UI's Privy path does not accept merchant callback URLs;
these examples use direct EVM wallet signing.

`.github/workflows/publish-memo-guides.yml` publishes these pages under
`tutorials/crypto-payments` and `api-reference/bridge-payments` when their source
changes on `main`. It creates missing pages in the existing navigation groups,
updates only those guides, and converts their repository links to public URLs.
It also appends any missing wallet/deposit-address operation blocks to the
existing User Management reference without replacing its existing blocks.
The OpenAPI workflow still publishes the specification itself.

This uses the existing `GITBOOK_TOKEN`, `GITBOOK_SPACE` and `GITBOOK_SPEC` settings.
PR checks test the publisher and resolve its destinations read-only; they do not
publish. A manual workflow run on `main` republishes the current sources. Verify
both pages, their cross-links, and the five wallet/deposit-address operations on
developers.unigox.com after publication. Review and deploy matching API changes
before merging documentation that describes new behavior.

The payout minimum and confirmed-amount additions describe the coordinated cost-slippage release contract.
The Quote projection and quote policy were checked against lane commit
`bf2592deec3896e71290fb4ca88a6e24638de525` on 2026-10-16. The Core, KMS, Relay, Account,
frontend, Quote and documentation lanes have been reviewed and tested. A funded adjusted-payout canary
is still required before enabling the policy or publishing these additions; historical receipts and
unfunded previews do not establish that this flow works on chain.

Deploy Core immutability first, then KMS/Relay enforcement, then Account/frontend projections.
Enable Quote policy emission after those dependencies are ready. Publish the documentation last,
after the funded canary and user preview. These edits do not establish that the behavior is deployed.

The Partner API OpenAPI spec also documents customer deposit-address allocation
and listing, including saved addresses returned with pending monitoring and the
per-network confirmations used before accepting payments. Those routes use the
Partner API base URL, API key and customer ownership checks. Their matching
Account/Quote readiness changes must be deployed before publishing this contract.

The partner wallet setup reference was checked against Account #690 at
`42ad9228cec0524aa628bf85221d907a8f2904ae`. It documents external-wallet enablement,
customer creation, challenge/sign/link, wallet state, XAI credits and partner wallet
webhooks. The three wallet operations are additions to the OpenAPI operation list;
follow the new-endpoint GitBook checks above when publishing. Pushes to this PR
branch do not publish the spec; merging its OpenAPI changes to `main` does. Publish
after the matching Account routes and deposit notifier are deployed and reviewed.

The wallet-signed Bridge paths use another base URL and authorization contract.
They remain in the separate Bridge payment reference; do not put them under the
Partner API's global server/API-key contract without per-operation overrides or
a dedicated bridge spec.
