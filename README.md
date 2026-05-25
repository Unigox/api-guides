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

To publish manually:

```
gitbook auth --token <token>
gitbook openapi publish --organization <org> --spec <spec> openapi/swagger.yaml
```
