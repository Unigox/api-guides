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
`scripts/publish-changelog.mjs`) on every change to `changelog.md`. The script
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
scripts/publish-changelog.mjs` resolves the page read-only and makes no changes.

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

### Pending: delayed settlement (T+1) and third-party payouts

The changelog's `Unreleased` entry describes the release on the
`feat/t1-third-party-payouts-20261002` branch. The account repository's runbook,
`docs/bill-payment-settlement-t1-runbook.md` ("Deploy order" and "Upgrading a
live deployment"), owns the order of the services and their preconditions; if it
and this list ever disagree, the runbook wins. The lists below restate it in
short, the API gateway (api#66) and this repository included.

Merge the pull requests in the same order as the deploys below. The api-guides
pull request is merged last, after api#66 is deployed, because merging it is
what publishes the T+1 docs.

First rollout, where nothing T+1 runs yet:

1. account: the T+1 migrations, checked as the runbook's "Deploy preconditions"
   says, then the account build. Over main's builds from before its migration
   20261007160000, which drops `users.partner`, finish main's own release first:
   its account, trades and verification, then `up` to 20261007200000 with
   main's build. This release's account cannot start before that `up`.
2. verification: after account's migrations and before trades. trades stores the
   source-of-funds documents and payout receipts through this build's routes;
   against an older build every such upload fails in trades.
3. agent-scripts: the Lightnet agent's build from this release, before trades.
   This trades releases a parked T+1 trade only while the agent keeps
   re-affirming its payment check; against an older agent it holds every T+1
   trade of that vendor.
4. trades (trades#538).
5. unigox.com.
6. api (api#66): the gateway routes for the partner T+1 endpoints, after trades.
   It merges only now, right before this repository, because merging it
   publishes the gateway's own copy of the T+1 spec, which has no notice.
   Until it is deployed those endpoints answer the gateway's `404`.
7. api-guides (this repository), the last repository: date the `Unreleased`
   entry and remove its four notices (the `**Not available yet.**` paragraph
   under the changelog's `Unreleased` heading, the top of
   `api-reference/delayed-settlement.md`, the "When a payout is delayed" section
   of `api-reference/third-party-payouts.md`, and the delayed settlement entry of
   `api-reference/README.md`), then merge. `node scripts/check-release.mjs` must
   then pass: it names any notice left behind.

offers goes out at any point after account's migrations (its build reads
`users.delayed_settlement` on every user read, its sign-in check included, and
the T+1 offer columns, all added by them) and before agent-scripts, as the
runbook's "Deploy order" says and explains.

Upgrading a deployment that already runs T+1:

1. account: the T+1 migrations and the runbook's checks, before any new build
   starts. A database migrated under an earlier T+1 branch's numbers needs the
   runbook's `migrate force` first. Where `users.partner` still exists, as on a
   stage at the 20261006090… numbers, the force and the `up` go after step 4
   instead, once account, trades and verification run this release.
2. offers and verification, in either order.
3. agent-scripts, unigox.com, trades, in that order.
4. account's build, so that no replica of the old build mails a receipt while
   one of the new build runs (a mixed fleet mails two receipts for every delayed
   bill that completes while both run): stop-start, every replica of the old
   build stopped before the first replica of the new one starts, or, on a
   rolling deploy, with receipts off across the roll, as the runbook describes.
5. api (api#66).
6. api-guides, last, as above.

In both, the switches come after the deploys and follow the runbook: the offer
flag last, and a partner is listed in `DELAYED_SETTLEMENT_PARTNERS` only once
api#66 is live and the partner has implemented the consent signing.

The T+1 pages and the spec describe trades#538 with its review fixes (T-01 to
T-31; the CONS-4 follow-up `0d5a99c4`, whose recipient-payout gates leave T+1
offers out for a partner without delayed settlement; and the other cross-repo
follow-ups), rechecked against its branch head `1e096787`. If trades changes
after that, check the T+1 docs against it again before dating the entry. The
other unreleased changes the entry lists (the estimate fields,
`404 RECIPIENT_NOT_FOUND` on a quote, the orders filter) carry no notice on
their pages and rely on the merge order alone. So does the T+1 text in the live
sections of `api-reference/third-party-payouts.md`: step 8 of "End-to-end
flow", "3. Request a quote" and the error table under "Compliance in v1".

Delete this subsection when the entry is dated.
