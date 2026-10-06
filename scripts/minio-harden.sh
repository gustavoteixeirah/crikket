#!/usr/bin/env bash
# Idempotent MinIO hardening for the Kode GT Crikket deploy.
# Creates a dedicated IAM user, attaches the bucket-only policy, applies CORS,
# and disables anonymous access. Never prints secret values.
#
# Required env:
#   MINIO_ENDPOINT
#   MINIO_ROOT_USER
#   MINIO_ROOT_PASSWORD
#   CRIKKET_MINIO_ACCESS_KEY
#   CRIKKET_MINIO_SECRET_KEY
#
# Optional env:
#   MC_ALIAS                      default: crikket
#   MC_INSECURE                   set to 1 for self-signed TLS
#   STORAGE_BUCKET                default: crikket
#   STORAGE_DENY_BUCKET           default: crikket-policy-deny-probe
#   CRIKKET_MINIO_POLICY_NAME     default: crikket-bucket
#   CORS_ALLOWED_ORIGINS          comma-separated, default: https://crikket.kodegt.com
#   CHROME_EXTENSION_ID           appended as chrome-extension://<id>
#   MINIO_RESTART_AFTER_CORS      set to 1 to run `mc admin service restart`
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
policy_src="${root}/deploy/minio/crikket-policy.json"

if ! command -v mc >/dev/null 2>&1; then
  echo "error: mc (MinIO client) is not on PATH" >&2
  exit 1
fi

: "${MINIO_ENDPOINT:?set MINIO_ENDPOINT}"
: "${MINIO_ROOT_USER:?set MINIO_ROOT_USER}"
: "${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}"
: "${CRIKKET_MINIO_ACCESS_KEY:?set CRIKKET_MINIO_ACCESS_KEY}"
: "${CRIKKET_MINIO_SECRET_KEY:?set CRIKKET_MINIO_SECRET_KEY}"

MC_ALIAS="${MC_ALIAS:-crikket}"
STORAGE_BUCKET="${STORAGE_BUCKET:-crikket}"
STORAGE_DENY_BUCKET="${STORAGE_DENY_BUCKET:-crikket-policy-deny-probe}"
CRIKKET_MINIO_POLICY_NAME="${CRIKKET_MINIO_POLICY_NAME:-crikket-bucket}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://crikket.kodegt.com}"
MC_INSECURE="${MC_INSECURE:-0}"
MINIO_RESTART_AFTER_CORS="${MINIO_RESTART_AFTER_CORS:-0}"

mc_flags=()
if [[ "${MC_INSECURE}" == "1" ]]; then
  mc_flags+=(--insecure)
fi

mc_cmd() {
  mc "${mc_flags[@]}" "$@"
}

ok_or_already() {
  local output
  local status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e
  if [[ "${status}" -eq 0 ]]; then
    return 0
  fi
  if grep -qiE 'already|exists|no change|not implemented' <<<"${output}"; then
    echo "${output}"
    return 0
  fi
  echo "${output}" >&2
  return "${status}"
}

IFS=',' read -r -a origin_items <<<"${CORS_ALLOWED_ORIGINS}"
origins=()
for item in "${origin_items[@]}"; do
  trimmed="${item#"${item%%[![:space:]]*}"}"
  trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
  if [[ -n "${trimmed}" ]]; then
    origins+=("${trimmed}")
  fi
done

if [[ -n "${CHROME_EXTENSION_ID:-}" ]]; then
  origins+=("chrome-extension://${CHROME_EXTENSION_ID}")
else
  echo "warning: CHROME_EXTENSION_ID is unset; CORS will not include chrome-extension://<id>" >&2
  echo "         Find the ID at chrome://extensions (Developer mode) after loading the unpacked MV3 build." >&2
fi

cors_origin_csv="$(IFS=','; echo "${origins[*]}")"

if [[ ! -f "${policy_src}" ]]; then
  echo "error: missing policy file ${policy_src}" >&2
  exit 1
fi

policy_rendered="$(mktemp)"
cors_xml="$(mktemp)"
cleanup() {
  rm -f "${policy_rendered}" "${cors_xml}"
}
trap cleanup EXIT

sed "s|arn:aws:s3:::crikket|arn:aws:s3:::${STORAGE_BUCKET}|g" "${policy_src}" >"${policy_rendered}"

{
  echo "<CORSConfiguration>"
  echo "  <CORSRule>"
  for origin in "${origins[@]}"; do
    echo "    <AllowedOrigin>${origin}</AllowedOrigin>"
  done
  cat <<'EOF'
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedHeader>Content-Type</AllowedHeader>
    <AllowedHeader>Content-Encoding</AllowedHeader>
    <AllowedHeader>x-amz-*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
EOF
} >"${cors_xml}"

echo "Setting mc alias ${MC_ALIAS} -> ${MINIO_ENDPOINT}"
mc_cmd alias set "${MC_ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
mc_cmd ready "${MC_ALIAS}"

echo "Ensuring buckets ${STORAGE_BUCKET} and ${STORAGE_DENY_BUCKET}"
ok_or_already mc_cmd mb --ignore-existing "${MC_ALIAS}/${STORAGE_BUCKET}"
ok_or_already mc_cmd mb --ignore-existing "${MC_ALIAS}/${STORAGE_DENY_BUCKET}"

echo "Creating or updating policy ${CRIKKET_MINIO_POLICY_NAME}"
ok_or_already mc_cmd admin policy create "${MC_ALIAS}" "${CRIKKET_MINIO_POLICY_NAME}" "${policy_rendered}"

echo "Creating or updating dedicated user (access key id only; secret not printed)"
ok_or_already mc_cmd admin user add "${MC_ALIAS}" "${CRIKKET_MINIO_ACCESS_KEY}" "${CRIKKET_MINIO_SECRET_KEY}"
ok_or_already mc_cmd admin user enable "${MC_ALIAS}" "${CRIKKET_MINIO_ACCESS_KEY}"

echo "Attaching policy ${CRIKKET_MINIO_POLICY_NAME} to dedicated user"
ok_or_already mc_cmd admin policy attach "${MC_ALIAS}" "${CRIKKET_MINIO_POLICY_NAME}" --user "${CRIKKET_MINIO_ACCESS_KEY}"

echo "Disabling anonymous access on ${STORAGE_BUCKET}"
ok_or_already mc_cmd anonymous set none "${MC_ALIAS}/${STORAGE_BUCKET}"
ok_or_already mc_cmd anonymous set none "${MC_ALIAS}/${STORAGE_DENY_BUCKET}"

echo "Applying bucket CORS (AIStor / versions that implement PutBucketCors)"
if mc_cmd cors set "${MC_ALIAS}/${STORAGE_BUCKET}" "${cors_xml}" >/dev/null 2>&1; then
  echo "Bucket CORS applied with mc cors set"
else
  echo "warning: mc cors set is not available on this MinIO (community builds use global CORS only)" >&2
fi

echo "Applying global CORS origins via mc admin config set api cors_allow_origin"
if ok_or_already mc_cmd admin config set "${MC_ALIAS}" api "cors_allow_origin=${cors_origin_csv}"; then
  echo "Global CORS origins set"
else
  echo "warning: could not set api cors_allow_origin; set MINIO_API_CORS_ALLOW_ORIGIN on the MinIO process instead" >&2
fi

if [[ "${MINIO_RESTART_AFTER_CORS}" == "1" ]]; then
  echo "Restarting MinIO so API CORS config is picked up"
  mc_cmd admin service restart "${MC_ALIAS}"
  mc_cmd ready "${MC_ALIAS}"
else
  echo "MinIO was not restarted. If browser CORS is still wrong, restart MinIO or set MINIO_API_CORS_ALLOW_ORIGIN on the process."
fi

echo
echo "Coolify / Crikket server env var NAMES (set values in Coolify, never git):"
echo "  STORAGE_BUCKET"
echo "  STORAGE_ACCESS_KEY_ID"
echo "  STORAGE_SECRET_ACCESS_KEY"
echo "  STORAGE_REGION"
echo "  STORAGE_ENDPOINT"
echo "  STORAGE_ADDRESSING_STYLE"
echo "  STORAGE_PUBLIC_URL"
echo
echo "MinIO process env var NAMES (CORS; not Crikket app env):"
echo "  MINIO_API_CORS_ALLOW_ORIGIN"
echo
echo "Suggested STORAGE_* assignments for this run (names only except public bucket/endpoint):"
echo "  STORAGE_BUCKET=${STORAGE_BUCKET}"
echo "  STORAGE_ACCESS_KEY_ID=<CRIKKET_MINIO_ACCESS_KEY>"
echo "  STORAGE_SECRET_ACCESS_KEY=<CRIKKET_MINIO_SECRET_KEY>"
echo "  STORAGE_ENDPOINT=${MINIO_ENDPOINT}"
echo "  STORAGE_ADDRESSING_STYLE=path"
echo "  STORAGE_REGION=us-east-1"
echo "  MINIO_API_CORS_ALLOW_ORIGIN=${cors_origin_csv}"
echo
echo "Smoke with the dedicated user:"
echo "  bun scripts/storage-smoke.ts"
echo
echo "Done."
