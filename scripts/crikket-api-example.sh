#!/usr/bin/env bash
# Example machine client for the Crikket organization REST API (KOD-273).
# Reads CRIKKET_API_KEY from the environment. Never commit a real key.

set -euo pipefail

if [ -z "${CRIKKET_API_KEY:-}" ]; then
  printf 'Set CRIKKET_API_KEY to an organization API key (crik_ak_...).\n' >&2
  printf 'Create one in Settings → API Keys. Do not commit the secret.\n' >&2
  exit 1
fi

BASE_URL="${CRIKKET_API_URL:-https://crikket.kodegt.com}"
BASE_URL="${BASE_URL%/}"
AUTH_HEADER="Authorization: Bearer ${CRIKKET_API_KEY}"

list_json="$(
  curl -fsS \
    -H "${AUTH_HEADER}" \
    -H "Accept: application/json" \
    "${BASE_URL}/api/v1/reports?perPage=5"
)"

report_id="$(
  python3 -c '
import json, sys
payload = json.load(sys.stdin)
items = payload.get("items") or []
if not items:
    raise SystemExit("no reports returned for this API key")
print(items[0]["id"])
' <<<"${list_json}"
)"

printf 'Listed reports. Downloading %s\n' "${report_id}"

output_file="${1:-crikket-report-${report_id}.json}"

curl -fsS \
  -H "${AUTH_HEADER}" \
  -H "Accept: application/json" \
  -o "${output_file}" \
  "${BASE_URL}/api/v1/reports/${report_id}/download"

printf 'Wrote %s\n' "${output_file}"
