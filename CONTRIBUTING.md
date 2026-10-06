# Contributing to Crikket

Thanks for your interest in contributing to Crikket.

This guide explains how to set up your local environment, make changes, and open high-quality pull requests.

## Kode GT fork

This repository is the [Kode GT fork](./FORK.md) of
[redpangilinan/crikket](https://github.com/redpangilinan/crikket).

- Branch from `main`. Feature branches are `teixeirah/kod-XXX` (Linear issue).
- Open pull requests against **`gustavoteixeirah/crikket`** with base **`main`**.
  GitHub often defaults fork PRs to upstream; switch the base repo before you
  submit.
- Do not open Kode GT product PRs on `redpangilinan/crikket`.
- CI on this fork is the `CI` workflow (install, lint, typecheck, build, tests).
- Upstream sync is documented in [FORK.md](./FORK.md). It is never automatic.

## Code of Conduct

By participating, you agree to be respectful and constructive in discussions and reviews.

## Prerequisites

- [Bun](https://bun.sh) (see `packageManager` in the root `package.json`)
- Git
- Environment variables for the app(s) you plan to run

## Project Structure

This repository is a Turborepo monorepo.

```
apps/
└── web
└── server
└── docs
└── extension
packages/
```

## Getting Started

1. Fork and clone the repository.

2. Install dependencies from the repo root:

```bash
bun install
```

3. Create environment files from the provided examples:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
cp apps/docs/.env.example apps/docs/.env
cp apps/extension/.env.example apps/extension/.env
```

4. Fill in required environment values in the `.env` files you created.

5. Start development:

```bash
bun run dev
```

Run a specific app when needed:

```bash
bun run dev:web
bun run dev:server
```

## Database Commands

From the repository root:

```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

## Code Quality

This project uses [Ultracite](https://www.ultracite.ai) (Biome-based linting/formatting) and Turborepo type checks.

Before opening a pull request, run:

```bash
bun run fix
bun run check
bun run check-types
bun run build
```

## Making Changes

- Keep changes focused and scoped to a single feature or fix.
- Prefer small, reviewable pull requests.
- Follow existing code patterns and naming conventions.
- Update documentation when behavior, APIs, or setup steps change.

## Pull Request Guidelines

When opening a PR:

- Use a clear title that explains intent.
- Describe what changed and why.
- Include screenshots/videos for UI changes.
- Link related issues if applicable.

## Commit Convention

Before you create a Pull Request, please check whether your commits comply with
the commit conventions used in this repository.

When you create a commit we kindly ask you to follow the convention
`category(scope or module): message` in your commit message while using one of
the following categories:

- `feat / feature`: all changes that introduce completely new code or new
  features
- `fix`: changes that fix a bug (ideally you will additionally reference an
  issue if present)
- `refactor`: any code related change that is not a fix nor a feature
- `docs`: changing existing or creating new documentation (i.e. README, docs for
  usage of a lib or cli usage)
- `build`: all changes regarding the build of the software, changes to
  dependencies or the addition of new dependencies
- `test`: all changes regarding tests (adding new tests or changing existing
  ones)
- `ci`: all changes regarding the configuration of continuous integration (i.e.
  github actions, ci system)
- `chore`: all changes to the repository that do not fit into any of the above
  categories

  e.g. `feat(components): add new prop to the avatar component`

If you are interested in the detailed specification you can visit
https://www.conventionalcommits.org/ or check out the
[Angular Commit Message Guidelines](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

## Security

Do not open public issues for security vulnerabilities.

Please follow [SECURITY.md](./SECURITY.md) and report vulnerabilities privately.

## Questions

If anything is unclear, open an issue or start a discussion in the repository.
