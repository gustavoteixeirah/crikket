#!/usr/bin/env bash
# Run unit tests the way this monorepo intends, without Bun mock.module
# leaking across billing test files (process-wide mocks).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

run_pkg_tests() {
  local pkg="$1"
  echo "::group::bun test (${pkg})"
  bun test --cwd "$pkg" test
  echo "::endgroup::"
}

# These packages do not share conflicting mock.module specifiers across files.
run_pkg_tests packages/bug-reports
run_pkg_tests packages/capture-core
run_pkg_tests packages/auth
run_pkg_tests sdks/capture
run_pkg_tests apps/server
run_pkg_tests apps/extension

# packages/billing tests mock the same modules (polar-payload, payments, …).
# Running them in one process makes later files see the wrong mock.
echo "::group::bun test (packages/billing, isolated files)"
shopt -s nullglob
for f in packages/billing/test/*.test.ts; do
  bun test "$f"
done
echo "::endgroup::"
