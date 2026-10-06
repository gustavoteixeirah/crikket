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
reports feed AI coding agents**.

Landed:

- Remote MCP at `/mcp` so agents can list and fetch reports and artifacts
- Organization API keys (hashed, read-only, org-scoped)
- Outbound webhooks when a report is ready
- One-call agent context package (`get_report_context` and
  `GET /api/v1/reports/:id/context`)
- Per-user preferred/default organization (web switcher + extension submit target)
- Optional OpenAI speech-to-text for report video audio (org BYOK)
- Linear issue + Cursor cloud agent handoff when a report is ready (KOD-282)

Upcoming work (separate tickets) includes:

- Broader machine-readable REST API reusing organization API keys (KOD-273)
- Fork-specific capture, storage, and access-control changes

The fork exists so we can add agent integrations without publishing Kode GT
product changes to upstream.

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
| `CI` | Yes — PRs and pushes to `main`. Includes **Package extension (Load unpacked)**, which builds the Chrome MV3 zip against `VITE_APP_URL` / `VITE_SERVER_URL` (https://crikket.kodegt.com in CI) and uploads it as `crikket-extension-chrome-mv3`. Also includes **MinIO storage smoke**, which downloads pinned community MinIO/`mc` GitHub release binaries, applies `deploy/minio` policy/CORS, and runs `scripts/storage-smoke.ts`. |
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

Attach the public hostname only to the **`proxy`** service, container port
**8080**. Coolify's proxy terminates TLS and forwards to that port. Do not
publish host ports in the compose file, and do not set `container_name`
(Coolify assigns names).

`web` uses `network_mode: service:server`, so it has **no own IP**. Do not
attach a Coolify domain to `web` or `server`. `Caddyfile.coolify` sends
`/api/*`, `/rpc/*`, `/mcp`, and `/mcp/*` to `server:3000` and everything else to `server:3001`
(the Next.js process listening in the server network namespace). MCP is proxied
without gzip so Streamable HTTP responses are not buffered.

Do not publish Postgres (`5432`) on the Coolify proxy.

### Web unhealthy / 503 on cutover

The first Coolify cutover to `docker-compose.coolify.yml` left **web
unhealthy** while Postgres, migrate, and server were fine. `proxy` waited on
`web` `service_healthy`, never started, and the site returned 503.

Fixes in this compose / web image:

1. **Healthcheck path `/` is a deadlock.** `/` is a protected RSC that
   calls `authClient.getSession()` at `NEXT_PUBLIC_SERVER_URL` (the public
   origin). That fetch fails while `proxy` is not up, so Next returns
   **500** and `response.ok` is false — `proxy` never starts. `/login` is
   static and returns 200 without the API. The web check uses
   `http://127.0.0.1:3001/login` and treats 2xx/3xx as healthy
   (`redirect: manual`). Alpine bun resolves `localhost` to `::1` first;
   Next binds `--hostname 0.0.0.0` (IPv4 only), so healthchecks use
   `127.0.0.1` (server `GET /` on `:3000` the same way).
2. **Empty `NEXT_PUBLIC_*` at runtime.** `apps/web/docker-entrypoint.sh`
   exits if `NEXT_PUBLIC_SITE_URL` / `APP_URL` / `SERVER_URL` are empty.
   Compose used `${VAR:-}` (empty string), which overrides image ENV and
   crash-loops web. The old GHCR stack baked `https://crikket.kodegt.com`.
   Compose now defaults those three, plus `BETTER_AUTH_URL` and
   `CORS_ORIGINS`, to that public origin (not a secret). Self-hosters must
   override.
3. **Slow first start.** The web Dockerfile drops `.next/cache` before
   copying `.next-template`, and the entrypoint skips `cache/` when
   grepping placeholders. Web healthcheck `start_period` is 180s (server
   60s).
4. **`proxy` vs web health.** `proxy` depends on `web` with
   `service_started` so a slow or failed UI healthcheck cannot block `/api`.
   Server remains `service_healthy`.

### Postgres volume

`docker-compose.coolify.yml` bind-mounts the existing Coolify volume data
directory:

`/var/lib/docker/volumes/rk2h1ywgegcu9qyq45m4evoz_crikket-pg/_data`

Coolify's compose transformer drops `external: true` and rewrites named
volumes to a fresh empty volume, so a literal host path is required to keep
production data. Self-hosters **must not** keep that host path unless they
already have data there; change it or switch to a named volume.

### Required environment variable names

Set these in the Coolify service environment (values stay in Coolify, never
git). No defaults that look like secrets are in the compose file. Public
origin defaults (`https://crikket.kodegt.com`) are Kode GT-specific;
self-hosters must override.

**Web (build args + runtime; `docker-entrypoint.sh` also substitutes
placeholders):**

- `NEXT_PUBLIC_SITE_URL` (compose default: `https://crikket.kodegt.com`)
- `NEXT_PUBLIC_APP_URL` (same default)
- `NEXT_PUBLIC_SERVER_URL` (same default)

Kode GT production can rely on those defaults. Still set them in Coolify if
the service already has them.

Optional web: `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, `NEXT_PUBLIC_CRIKKET_KEY`,
`NEXT_PUBLIC_DEMO_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
`VITE_APP_URL` / `VITE_SERVER_URL` are passed as build args for completeness;
the Coolify images do not build the browser extension.

**Server / migrate:**

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` (compose default: `https://crikket.kodegt.com`)
- `CORS_ORIGINS` (same default)
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`
- `STORAGE_REGION` (required when `STORAGE_ENDPOINT` is unset) **or**
  `STORAGE_ENDPOINT` (MinIO / other S3-compatible)

Optional server: `ALLOWED_SIGNUP_DOMAINS`, `ALLOWED_SIGNUP_EMAILS`, `BETTER_AUTH_COOKIE_DOMAIN`,
`STORAGE_ADDRESSING_STYLE` (`auto` / `path` / `virtual`; use `path` for MinIO),
`STORAGE_PUBLIC_URL`, `ENABLE_PAYMENTS` (self-host: `false`), `RESEND_*`,
`GOOGLE_CLIENT_*`, `POLAR_*`, `CAPTURE_SUBMIT_TOKEN_SECRET`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`, `WEBHOOK_ALLOW_PRIVATE_URLS`, `WEBHOOK_APP_BASE_URL`,
`ORG_SECRETS_ENCRYPTION_KEY` (32-byte base64; generate with
`openssl rand -base64 32`; required when an org saves a transcription, Linear,
or Cursor API key. Those keys are never env vars — admins enter them in
**Settings → Transcription** and **Settings → Linear**).

**Bundled Postgres service** (only if you use the `postgres` container, not
Aurora): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`POSTGRES_HOST_AUTH_METHOD`. Then point `DATABASE_URL` at hostname `postgres`.

For Kode GT production with Aurora + MinIO, set `DATABASE_URL` to Aurora and
MinIO via `STORAGE_ENDPOINT` + `STORAGE_ADDRESSING_STYLE=path`. The compose
`postgres` service can stay unused or be removed in Coolify if you prefer not
to run bundled Postgres.

See [Self-hosting: Coolify](./apps/docs/content/docs/self-hosting/coolify.mdx)
for a copy-paste Coolify checklist.

`STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` must be the **dedicated
Crikket MinIO user**, not the MinIO root account. See [MinIO hardening](#minio-hardening).

## MinIO hardening

Production object storage is S3-compatible MinIO. Browsers and the Chrome MV3
extension upload directly with presigned `PUT` URLs. This repo cannot touch
the live MinIO cluster; DevOps applies the files under `deploy/minio/` later.

Do **not** commit access keys, secret keys, or MinIO root credentials. The
Chrome extension ID is visible in `chrome://extensions` once loaded.

### What the app actually calls

All S3 traffic goes through `packages/bug-reports/src/lib/storage.ts`
(`createS3StorageProvider`). There is no multipart upload, no `ListObjects`,
and no `CreateBucket` from the app.

| IAM action | Code path | Why it is required |
| --- | --- | --- |
| `s3:PutObject` | `save()` and `createUploadUrl()` (`PutObjectCommand`, including presigned browser/extension PUTs) | Server-side writes and direct artifact uploads (`video/webm`, `image/png`, debugger `application/gzip`) |
| `s3:GetObject` | `read()`, `getUrl()` (presigned GET when `STORAGE_PUBLIC_URL` is unset), and `exists()` | Artifact download / signed URLs. `HeadObject` is authorized as `s3:GetObject` (there is no separate `s3:HeadObject` action) |
| `s3:DeleteObject` | `remove()` / artifact cleanup | Failed-ingest and retention cleanup |

Omitted on purpose (least privilege):

- `s3:ListBucket` — the app never lists the bucket
- Multipart (`s3:CreateMultipartUpload`, `UploadPart`, …) — uploads are a single `PutObject`
- `s3:*`, other buckets, and `arn:aws:s3:::*`

Policy file: [`deploy/minio/crikket-policy.json`](./deploy/minio/crikket-policy.json).
The bucket name is the literal `crikket` in the ARNs
(`arn:aws:s3:::crikket` and `arn:aws:s3:::crikket/*`).
`scripts/minio-harden.sh` substitutes `STORAGE_BUCKET` for `crikket` in those
ARNs when you need a different name.

### CORS (explicit origins)

Presigned uploads send **`Content-Type` only**. The extension gzip-compresses
debugger JSON but does **not** set `Content-Encoding` (KOD-275): MinIO would
otherwise auto-decompress on GET and break server-side gunzip.

Headers to allow:

| Header | Sent today? | Why it is in the policy |
| --- | --- | --- |
| `Content-Type` | Yes (`application/gzip`, `video/webm`, `image/png`) | Signed and sent on every presigned PUT |
| `x-amz-*` | Usually query-string SigV4 (`X-Amz-*`); some clients still send `x-amz-content-sha256` / `x-amz-date` / `x-amz-security-token` as headers | Preflight must not fail if they appear as request headers |
| `Content-Encoding` | **No** | Optional allow-list only. Do not configure clients to send it |

Methods: `PUT` (upload), `GET` / `HEAD` (read / exists). `OPTIONS` is handled
by the CORS engine; it does not need to be in `AllowedMethods`.
`ExposeHeaders`: `ETag`. `MaxAgeSeconds`: `3600`.

Origins:

- `https://crikket.kodegt.com` (web app)
- `chrome-extension://<id>` (MV3 extension). Chrome does not accept a
  `chrome-extension://*` wildcard here — use the real ID.

**How to find the Chrome extension ID**

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Load unpacked `apps/extension/.output/chrome-mv3`, or unzip the CI artifact
   `crikket-extension-chrome-mv3` and load that folder.
4. Copy the **ID** shown under the extension name (32 lowercase characters).
5. Or, on the extension service worker console: `chrome.runtime.id`.

Unpacked builds without a pinned `key` in the manifest get an ID derived from
the path. If you reload from a different checkout, the ID can change — update
MinIO CORS when it does.

Files:

- AWS-style JSON: [`deploy/minio/cors.json`](./deploy/minio/cors.json)
- MinIO AIStor XML for `mc cors set`: [`deploy/minio/cors.xml`](./deploy/minio/cors.xml)

Replace `PASTE_CHROME_EXTENSION_ID` (or pass `CHROME_EXTENSION_ID` to the
harden script).

#### Community MinIO vs AIStor

Community / AGPLv3 MinIO does **not** implement per-bucket CORS
(`PutBucketCors` / `mc cors set` returns “functionality that is not
implemented”). Use the **global** API CORS setting (origins only; methods and
headers are not restricted at this layer):

```bash
mc admin config set "$MC_ALIAS" api cors_allow_origin="https://crikket.kodegt.com,chrome-extension://<id>"
# Durable equivalent on the MinIO process (preferred in Coolify):
# MINIO_API_CORS_ALLOW_ORIGIN=https://crikket.kodegt.com,chrome-extension://<id>
```

A restart may be required after `mc admin config set` (`mc admin service restart`
or recycle the MinIO container). Prefer `MINIO_API_CORS_ALLOW_ORIGIN` so the
value survives rebuilds without a one-shot `mc` command.

MinIO AIStor (and some newer commercial builds) support bucket CORS, which
**overrides** the global setting when present:

```bash
mc cors set "$MC_ALIAS/$STORAGE_BUCKET" deploy/minio/cors.xml
```

`scripts/minio-harden.sh` tries `mc cors set` first, then always sets
`api cors_allow_origin`. It does **not** restart MinIO unless
`MINIO_RESTART_AFTER_CORS=1`.

### DevOps runbook

This does not run against production from CI. Run it from a trusted admin
shell that can reach MinIO.

1. Install [`mc`](https://min.io/docs/minio/linux/reference/minio-mc.html) and
   confirm you can reach the MinIO S3 API endpoint (not the Console port).
2. Generate a dedicated access key / secret (do not reuse `MINIO_ROOT_*` for
   the app). Keep the values in a secret store, not git.
3. Find the Chrome MV3 extension ID (section above).
4. Export admin + Crikket identity env (examples are names and placeholders):

   ```bash
   export MC_ALIAS=crikket
   export MINIO_ENDPOINT=https://<minio-s3-api-host>
   export MINIO_ROOT_USER=...          # MinIO admin, not the app user
   export MINIO_ROOT_PASSWORD=...
   export STORAGE_BUCKET=crikket
   export STORAGE_DENY_BUCKET=crikket-policy-deny-probe
   export CRIKKET_MINIO_ACCESS_KEY=... # becomes STORAGE_ACCESS_KEY_ID
   export CRIKKET_MINIO_SECRET_KEY=... # becomes STORAGE_SECRET_ACCESS_KEY
   export CORS_ALLOWED_ORIGINS=https://crikket.kodegt.com
   export CHROME_EXTENSION_ID=<id>
   # export MC_INSECURE=1              # only for lab TLS
   # export MINIO_RESTART_AFTER_CORS=1 # only if you accept a MinIO restart
   ```

5. From the repo root:

   ```bash
   bash ./scripts/minio-harden.sh
   ```

   The script is idempotent: alias, buckets, policy, user, attach, anonymous
   `none`, CORS. It prints the **env var names** to set in Coolify; it does
   not print secret values.

6. In Coolify (Crikket **server** service), set:

   - `STORAGE_BUCKET`
   - `STORAGE_ACCESS_KEY_ID` (the dedicated user access key)
   - `STORAGE_SECRET_ACCESS_KEY`
   - `STORAGE_ENDPOINT`
   - `STORAGE_ADDRESSING_STYLE=path`
   - `STORAGE_REGION` (any placeholder such as `us-east-1` is fine with a custom endpoint)
   - `STORAGE_PUBLIC_URL` only if you serve objects from a public/CDN base URL

7. On the **MinIO** process / Coolify MinIO service, set
   `MINIO_API_CORS_ALLOW_ORIGIN` to the same comma-separated origin list
   (`https://crikket.kodegt.com,chrome-extension://<id>`). Recycle MinIO if
   CORS does not change after `mc admin config set`.

8. Smoke from a machine that can reach MinIO, using the **dedicated** user
   (never root):

   ```bash
   export STORAGE_BUCKET=crikket
   export STORAGE_ACCESS_KEY_ID=...      # CRIKKET_MINIO_ACCESS_KEY
   export STORAGE_SECRET_ACCESS_KEY=...  # CRIKKET_MINIO_SECRET_KEY
   export STORAGE_ENDPOINT=https://<minio-s3-api-host>
   export STORAGE_ADDRESSING_STYLE=path
   export STORAGE_REGION=us-east-1
   export STORAGE_DENY_BUCKET=crikket-policy-deny-probe
   bun scripts/storage-smoke.ts
   ```

   The smoke uses `createS3StorageProvider`, presigned-PUTs a small gzip
   debugger payload (same as the extension), HEADs and GETs it, checks the
   bytes are still gzip, deletes the object, and asserts PutObject on
   `STORAGE_DENY_BUCKET` is denied.

9. Confirm in a real browser: submit a report from `https://crikket.kodegt.com`
   and from the loaded extension. If the PUT fails before the server
   responds, CORS origins/headers are wrong.

CI runs the unit fixtures without MinIO. The `CI` workflow also has a
**MinIO storage smoke** job (`scripts/minio-ci-smoke.sh`) that downloads
pinned community MinIO/`mc` GitHub release binaries, runs the harden script,
and runs `scripts/storage-smoke.ts` against that ephemeral instance. Docker
Hub no longer publishes `minio/minio` images.

## Organization invitations without email

Production may run **without** `RESEND_API_KEY` / `RESEND_FROM_EMAIL`. Organization
invitations still work:

1. An owner or admin opens **Organization Settings** and creates an invite
   (email + role). Better Auth stores a pending invitation even when Resend is
   unset; the UI shows a copyable `/invite/{id}` link instead of failing.
2. Share that link with the invitee. Pending invitations list the same link
   again, plus **Resend** and **Revoke**.
3. The invitee opens the link:
   - Signed in as the invited email → accept (role from the invitation).
   - No account → signup locked to that email (allowed by the pending-invite
     bypass of `ALLOWED_SIGNUP_*`), then auto-accept.
   - Signed in as a different email → clear mismatch message.
   - Expired, revoked, or already accepted invitations cannot be used.
4. Optional: **Add existing member** adds a user who already has an account,
   with owner/admin checks and no acceptance step.

If Resend is configured, the invite email is still sent. No extra environment
variables are required for the email-less path.

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

## Connect agents (MCP)

The Hono server exposes a **remote Streamable HTTP MCP** endpoint at
`POST /mcp`. Coding agents (Cursor cloud agents, Grok, etc.) connect with a
URL and an organization API key. There is no browser session.

Production URL: `https://crikket.kodegt.com/mcp`

### Create an API key

1. Sign in to the app.
2. Open **Settings → API Keys**.
3. As an organization owner or admin, create a key (label only). The secret
   is shown **once**. Prefix: `crik_ak_`. Scope is read-only.
4. Store the secret in the agent environment, never in git.

Keys are hashed at rest (`sha256`). Revoke from the same settings page. A key
can only list and fetch reports that belong to its organization.

The same keys also authenticate a session-free REST endpoint for the agent
context package (below). Broader REST coverage is still KOD-273.

## Active and default organization (KOD-278)

Reports created from a signed-in session go to an organization the user
**belongs to**. They never fall back to an organization the user merely owns
if that org is not a membership.

| Source | How it is chosen |
| --- | --- |
| Preferred / default | Stored in `user_preferred_organization` (one row per user). Set from the web org switcher ("Set default") or the first-login prompt. |
| New session `activeOrganizationId` | Preferred org if still a membership, else the only membership, else the oldest membership. |
| Existing session | Keep the current active org if it is still a membership; otherwise re-resolve as above. |
| Extension submit | The reporter picks an org from their memberships before submit. That explicit id is sent with create/finalize. The server rejects it if they are not a member — it does **not** silently use the session or an owner org. |

Web:

- The sidebar org switcher shows the active org name/slug and whether it is the default.
- Switching orgs changes the session only. It does **not** change the saved default.
- "Set default" saves the preferred org and activates it.
- If the user belongs to more than one org and has no default, a blocking dialog asks them to choose once.

Extension:

- Popup and submit form show which org the report will go to.
- The last chosen org is remembered in `chrome.storage.local`.
- Submit is disabled until an org is selected.

No new environment variables.

### Cursor `mcp.json`

Use a placeholder for the secret. Do not commit real keys.

```json
{
  "mcpServers": {
    "crikket": {
      "url": "https://crikket.kodegt.com/mcp",
      "headers": {
        "Authorization": "Bearer crik_ak_YOUR_KEY_HERE"
      }
    }
  }
}
```

Local server: replace the URL with `http://localhost:3000/mcp` (or your
`SERVER_PORT`).

### Tools

| Tool | Purpose |
| --- | --- |
| `list_reports` | Paginated org reports. Filters: `status`, `createdAfter`, `createdBefore`, `search`. |
| `get_report` | Detail: title, description, URL, browser/OS/viewport, timestamps, reporter, truncated steps/logs/network, ingestion metadata, transcript summary, Linear issue and Cursor agent links. |
| `get_report_context` | One-call agent package: metadata, `transcript` text plus `transcriptMeta` (status, segments, model), Linear/Cursor links, merged timeline with errors highlighted and omitted counts, 15-minute signed media URLs, plus paste-ready `markdown`. |
| `list_report_events` | Page further (`kind`: `actions` \| `logs` \| `network`). |
| `get_network_request` | Headers and bodies for one network request. |
| `get_report_artifacts` | Short-lived signed URLs for video and screenshot (15 minutes). |

Prefer `get_report_context` when prompting a fixing agent. `get_report` returns
the first page of events. If `pagination.hasNextPage` is true, call
`list_report_events`. Artifact URLs are not included in list or `get_report`
payloads; use `get_report_artifacts` or `get_report_context`.

`transcript` is the speech text when transcription completed; otherwise `null`.
`transcriptMeta` has status, language, model, error, timestamps, and segments.
Admins enable this in **Settings → Transcription** after setting
`ORG_SECRETS_ENCRYPTION_KEY` on the server. Webhooks also emit
`transcript.ready` (see [Outbound Webhooks](./apps/docs/content/docs/self-hosting/webhooks.mdx)).

### REST: agent context package

Same org API key, no browser session.

```bash
curl -sS \
  -H "Authorization: Bearer crik_ak_YOUR_KEY_HERE" \
  "https://crikket.kodegt.com/api/v1/reports/REPORT_ID/context"

curl -sS \
  -H "Authorization: Bearer crik_ak_YOUR_KEY_HERE" \
  "https://crikket.kodegt.com/api/v1/reports/REPORT_ID/context?format=markdown"
```

`format` is `json` (default) or `markdown`. JSON includes a `markdown` field so
you can paste the prompt without a second call. Local server: replace the host
with `http://localhost:3000`.

JSON also includes `linear` and `cursorAgent` when this org has created a
Linear issue or launched a Cursor cloud agent for the report.

## Linear integration (KOD-282)

When a report becomes `ready`, Crikket can open a Linear issue for the product
mapped to that organization, attach the agent context package, and (optionally)
launch a Cursor cloud agent.

Linear API keys and Cursor API keys are **bring-your-own**, stored per
organization, encrypted at rest, never returned to the client, and never
committed. The only related environment variable is the encryption key:

| Name | Required | Purpose |
| --- | --- | --- |
| `ORG_SECRETS_ENCRYPTION_KEY` | yes, to save Linear/Cursor keys | 32-byte standard base64 (`openssl rand -base64 32`). AES-256-GCM. Same helper as KOD-274 OpenAI keys. |

Do not put Linear or Cursor tokens in Coolify as global env vars. Admins paste
them in **Settings → Linear**.

### Admin setup

1. Set `ORG_SECRETS_ENCRYPTION_KEY` in Coolify (or `apps/server/.env` locally). Generate with `openssl rand -base64 32`. Restart the server.
2. Sign in as an organization **owner** or **admin**.
3. Open **Settings → Linear**.
4. Paste a Linear personal/workspace API key. Save. The UI shows a masked value only (`••••••••abcd`). Use **Test Linear key**.
5. Pick the Linear **team** (Kode GT) and **project** (the product). Optional labels. Enable **Create a Linear issue when a report is ready**.
6. Cloud agent launch stays **off** unless you want automatic PRs. To use it: paste a Cursor API key (Dashboard → API Keys), set `https://github.com/owner/repo` and a base ref (`main`), optionally enable **Launch a Cursor cloud agent automatically**, then **Test Cursor key**.

### End-to-end with a test report

1. Complete admin setup with the Linear toggle **on** and cloud agent launch **off**.
2. Capture and submit a bug report in the org (extension or existing report).
3. Wait until ingest sets `submission_status = ready`. The server enqueues a durable `linear_handoff_job` (`create_issue`) that retries like webhooks (8 attempts, exponential backoff). Failures never fail ingest.
4. Open the report (`/s/{id}`). The details sidebar shows the Linear identifier/link. MCP `get_report` / `get_report_context` and `GET /api/v1/reports/:id/context` include the same `linear` object.
5. The Linear issue body has the (truncated) Markdown context package, links back to the report and `/api/v1/reports/:id/context`, plus a **Cloud agent handoff** section (repo, suggested `cursor/crikket-…` branch, compact agent prompt, MCP `mcp.json`).
6. Click **Launch agent** on the report (or turn the org toggle on for the next report). Crikket calls `POST https://api.cursor.com/v1/agents` and posts the agent URL as a Linear comment.

Manual **Create Linear issue** works even when the auto toggle is off, as long as a key and team are saved.

### Simulated `report.ready` (mocked Linear, CI-safe)

This does **not** call Linear or Cursor. It runs the same packaging + HTTP client path used after ingest:

```bash
bun test --cwd packages/bug-reports test/linear-pipeline.test.ts test/linear-handoff.test.ts
bun run scripts/simulate-linear-handoff.ts
```

The script prints a mocked `KOD-999` issue identifier, the description preview, idempotency (`created: false` on the second call), and a mocked Cursor agent URL + Linear comment.

