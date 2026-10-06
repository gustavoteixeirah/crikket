#!/usr/bin/env bash
# Report how far Kode GT main is from upstream redpangilinan/crikket (master).
# Never merges. Safe to run locally and in GitHub Actions.
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/redpangilinan/crikket.git}"
UPSTREAM_REF="${UPSTREAM_REF:-master}"
FORK_REF="${FORK_REF:-main}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not a git repository" >&2
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$UPSTREAM_URL"
fi

git fetch --quiet --no-tags upstream "$UPSTREAM_REF"
git fetch --quiet --no-tags origin "$FORK_REF"

behind="$(git rev-list --count "origin/${FORK_REF}..upstream/${UPSTREAM_REF}")"
ahead="$(git rev-list --count "upstream/${UPSTREAM_REF}..origin/${FORK_REF}")"
upstream_sha="$(git rev-parse --short "upstream/${UPSTREAM_REF}")"
fork_sha="$(git rev-parse --short "origin/${FORK_REF}")"

echo "Kode GT origin/${FORK_REF} (${fork_sha})"
echo "upstream/${UPSTREAM_REF}     (${upstream_sha})"
echo "behind: ${behind}    ahead: ${ahead}"

if [[ "${GITHUB_STEP_SUMMARY:-}" != "" ]]; then
  {
    echo "## Upstream sync"
    echo
    echo "| | |"
    echo "| --- | --- |"
    echo "| Fork \`origin/${FORK_REF}\` | \`${fork_sha}\` |"
    echo "| Upstream \`upstream/${UPSTREAM_REF}\` | \`${upstream_sha}\` |"
    echo "| Behind upstream | **${behind}** commit(s) |"
    echo "| Ahead of upstream | **${ahead}** commit(s) |"
    echo
    echo "This workflow does not merge. Open a PR into \`main\` to sync."
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [[ "$behind" -gt 0 ]]; then
  echo "::warning::Fork ${FORK_REF} is ${behind} commit(s) behind upstream/${UPSTREAM_REF}. Sync via PR — do not auto-merge."
else
  echo "Fork ${FORK_REF} is up to date with upstream/${UPSTREAM_REF}."
fi
