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
