# Kode GT fork of Crikket

This repository is **Kode GT's public fork** of
[redpangilinan/crikket](https://github.com/redpangilinan/crikket), licensed under
[AGPL-3.0](./LICENSE).

Production deploy (Coolify): [https://crikket.kodegt.com](https://crikket.kodegt.com)

Do not open pull requests against upstream from this fork's Kode GT work. All
changes land on **this** repository (`gustavoteixeirah/crikket`).

## Purpose

Upstream Crikket is open-source bug reporting with reproduction context
(screenshots, recordings, console logs, network, steps).

Kode GT is evolving this fork into an internal **QA / bug-report tool whose
reports feed AI coding agents**. Upcoming work (separate tickets) includes:

- MCP server so agents can list and fetch reports and artifacts
- Outbound webhooks when a report is ready
- Organization API keys / machine-readable API
- Agent-ready report packages (one-call context for a coding agent)
- Fork-specific capture, storage, and access-control changes

Until those land, this is still Crikket: capture bugs, attach context, share
reports. The fork exists so we can add agent integrations without publishing
Kode GT product changes to upstream.

## Attribution

- Original project: [Crikket](https://github.com/redpangilinan/crikket) by
  [redpangilinan](https://github.com/redpangilinan)
- Upstream website and docs: [crikket.io](https://crikket.io)
- License: GNU Affero General Public License v3.0 (`LICENSE` is unchanged)
- This fork keeps copyright and license notices from upstream and adds Kode GT
  operational docs only

## Branch strategy

| Branch | Role |
| --- | --- |
| `main` | Kode GT **deployable** branch. Coolify should track `main`. Protected by CI. |
| `teixeirah/kod-XXX` | Feature branches. `XXX` is the Linear issue number (example: `teixeirah/kod-269`). |
| `master` | GitHub's original default from the upstream fork. **Do not** land Kode GT work on `master`. Prefer leaving it alone or using it only as a read-only mirror of upstream. |

Upstream's default branch is `master`, not `main`. Kode GT standardizes on
`main` so deploy and PRs have a single target.

### Day-to-day workflow

1. Branch from latest `main`:

   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   git checkout -b teixeirah/kod-XXX
   ```

2. Open a pull request on **`gustavoteixeirah/crikket`** with base **`main`**.

   GitHub's compare UI for forks often defaults the base to
   `redpangilinan/crikket`. Change the base repository to
   `gustavoteixeirah/crikket` before opening the PR. Never open Kode GT PRs
   against upstream.

3. Wait for the `CI` GitHub Actions workflow (install, lint, typecheck, build,
   tests). Squash-merge into `main` when green.

4. Coolify deploys from `main` to `crikket.kodegt.com`.

Commit messages follow the upstream conventional-commit style in
[CONTRIBUTING.md](./CONTRIBUTING.md). Reference Linear issues (`KOD-XXX` /
`#XXX` is GitHub; use `KOD-XXX` in the PR body).

## Upstream sync policy

Remote names used in this document:

```bash
git remote add upstream https://github.com/redpangilinan/crikket.git   # once
git fetch upstream master
git fetch origin main
```

| Item | Policy |
| --- | --- |
| What to merge | `upstream/master` into Kode GT `main` |
| When | Weekly, or sooner for security fixes and bugs we need. The `Upstream sync check` workflow reports how far behind `main` is; it does **not** auto-merge. |
| How | Always via a PR into `main` (never a force-push, never a direct push of a conflicted merge). Suggested branch: `teixeirah/kod-XXX-sync-upstream`. |
| Auto-merge | **No.** A human or agent reviews conflict resolution and fork-only files before merge. |

### Sync procedure

```bash
git fetch upstream master
git fetch origin main
git checkout -b teixeirah/kod-XXX-sync-upstream origin/main
git merge upstream/master
# resolve conflicts (see below)
git push -u origin teixeirah/kod-XXX-sync-upstream
```

Open a PR: base `gustavoteixeirah/crikket` `main`. After CI is green, squash or
merge according to the size of the sync (a true merge commit is acceptable for
large upstream imports so history stays obvious).

Check divergence without merging:

```bash
./scripts/check-upstream.sh
```

### Conflict handling

When `git merge upstream/master` conflicts:

1. **Fork-only files** — keep the Kode GT version unless upstream added a file
   at the same path (unlikely). Includes:
   - `FORK.md`
   - `docker-compose.coolify.yml`
   - `scripts/check-upstream.sh`
   - `.github/workflows/ci.yml`
   - `.github/workflows/upstream-sync.yml`
   - README / CONTRIBUTING intro sections that describe this fork
2. **Gated upstream workflows** (`.github/workflows/publish.yml`,
   `docker-publish.yml`, `version-packages.yml`) — keep the
   `if: github.repository == 'redpangilinan/crikket'` job guard so this fork
   never publishes npm packages, GHCR images, or Changeset release PRs.
3. **Application code** — prefer upstream unless Kode GT has an intentional
   patch on that hunk. If we have a fork patch, re-apply it on top of the
   upstream change and leave a short comment in the PR (and a Linear issue if
   the patch should stay long-term).
4. **Lockfile** (`bun.lock`) — regenerate with `bun install` after resolving
   `package.json` conflicts. Do not hand-edit the lockfile.
5. Never resolve by deleting `LICENSE` or weakening AGPL notices.

If a sync is large or risky, split: merge upstream into a throwaway branch,
open the PR, and keep Kode GT product work on separate `teixeirah/kod-XXX`
branches until the sync lands.

## GitHub Actions on this fork

| Workflow | Runs here? |
| --- | --- |
| `CI` | Yes — PRs and pushes to `main` |
| `Upstream sync check` | Yes — weekly + manual. Informational only. |
| `Publish Packages` | No — still npm-publishes `@crikket-io/capture`; gated to upstream repo |
| `Publish Docker Images` | No — would push GHCR images from the fork; gated to upstream repo |
| `Version Packages` | No — would open Changeset release PRs; gated to upstream repo |

Kode GT deploys with Coolify, not these upstream publish jobs.

`bun run test` (and the CI Test step) run `scripts/ci-test.sh`. Billing unit
tests use Bun `mock.module` against the same specifiers; running that package's
files in one process leaks mocks, so the script runs
`packages/billing/test/*.test.ts` one file at a time.

## Coolify deploy (source build)

Production at [crikket.kodegt.com](https://crikket.kodegt.com) must run **this
fork's `main`**, not `ghcr.io/redpangilinan/crikket-*:latest`.

Use Coolify resource type **Docker Compose** (Git), not Nixpacks and not a
single Dockerfile.

| Coolify field | Value |
| --- | --- |
| Source | GitHub `gustavoteixeirah/crikket` |
| Branch | `main` |
| Base directory | `/` (repository root) |
| Docker Compose file | `docker-compose.coolify.yml` |
| Build pack | Docker Compose |

That file **builds** `server` and `web` from `apps/server/Dockerfile` and
`apps/web/Dockerfile` (same Dockerfiles as the upstream GHCR workflow). Upstream
`docker-compose.yml` / `docker-compose.external-db.yml` still pull published
images and must not be used for this fork's production.

### Domains and ports

`web` uses `network_mode: service:server`, so it has **no own IP**. Do not
attach a Coolify domain to the `web` service.

Attach domains only to **`server`**:

| Public site | Container port | Notes |
| --- | --- | --- |
| App UI (`https://crikket.kodegt.com`) | `3001` | Next.js |
| API (`BETTER_AUTH_URL` / `NEXT_PUBLIC_SERVER_URL`) | `3000` | Hono |

Same-host `/api` + `/rpc` routing (like the bundled Caddyfile) can be done with
Coolify's proxy extra config, or a second hostname for port `3000`. Do not
publish `5432` on the Coolify proxy.

Host port mapping in the compose file is `${SERVER_PORT:-3000}:3000` and
`${WEB_PORT:-3001}:3001` on `server`. Coolify's reverse proxy should target
those **container** ports.

### Required environment variable names

Set these in the Coolify service environment (values stay in Coolify, never
git). No defaults that look like secrets are in the compose file.

**Web (build args + runtime; `docker-entrypoint.sh` also substitutes
placeholders):**

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SERVER_URL`

Optional web: `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, `NEXT_PUBLIC_CRIKKET_KEY`,
`NEXT_PUBLIC_DEMO_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
`VITE_APP_URL` / `VITE_SERVER_URL` are passed as build args for completeness;
the Coolify images do not build the browser extension.

**Server / migrate:**

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CORS_ORIGINS`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`
- `STORAGE_REGION` (required when `STORAGE_ENDPOINT` is unset) **or**
  `STORAGE_ENDPOINT` (MinIO / other S3-compatible)

Optional server: `ALLOWED_SIGNUP_DOMAINS`, `BETTER_AUTH_COOKIE_DOMAIN`,
`STORAGE_ADDRESSING_STYLE` (`auto` / `path` / `virtual`; use `path` for MinIO),
`STORAGE_PUBLIC_URL`, `ENABLE_PAYMENTS` (self-host: `false`), `RESEND_*`,
`GOOGLE_CLIENT_*`, `POLAR_*`, `CAPTURE_SUBMIT_TOKEN_SECRET`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`.

**Bundled Postgres service** (only if you use the `postgres` container, not
Aurora): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`POSTGRES_HOST_AUTH_METHOD`, `POSTGRES_PORT`. Then point `DATABASE_URL` at
hostname `postgres`.

For Kode GT production with Aurora + MinIO, set `DATABASE_URL` to Aurora and
MinIO via `STORAGE_ENDPOINT` + `STORAGE_ADDRESSING_STYLE=path`. The compose
`postgres` service can stay unused or be removed in Coolify if you prefer not
to run bundled Postgres.

See [Self-hosting: Coolify](./apps/docs/content/docs/self-hosting/coolify.mdx)
for a copy-paste Coolify checklist.

## AGPL-3.0 obligations (public deploy)

This fork is public, and the production service at
[crikket.kodegt.com](https://crikket.kodegt.com) is a network-accessible
modified version of AGPL-3.0 software. That means:

- Corresponding source for what we run must be available to users of the
  service. This public repo on `main` (the deployed branch) is that offer.
- Keep the [LICENSE](./LICENSE) file and copyright notices.
- Modifications distributed or served over the network remain AGPL-3.0. Do not
  relicense. Do not add a proprietary SDK or shared library that would violate
  the AGPL without a separate, explicit legal review.
- Do not commit secrets, tokens, real environment values, or private hostnames.
  `crikket.kodegt.com` is already public and is fine to name. Put runtime
  secrets in Coolify (or another secret store), never in git.
- If we change the license header or add substantial new files, keep them under
  AGPL-3.0 unless they are clearly separate non-linked assets.

## Local development

Same as upstream. See [CONTRIBUTING.md](./CONTRIBUTING.md) and the README
quick start. Clone **this** repository, not upstream, if you are doing Kode GT
work:

```bash
git clone https://github.com/gustavoteixeirah/crikket.git
cd crikket
git checkout main
```
