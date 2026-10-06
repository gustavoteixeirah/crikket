#!/usr/bin/env bash
# CI / local helper: pin community MinIO + mc GitHub release binaries, harden,
# and run scripts/storage-smoke.ts. Docker Hub no longer publishes minio/minio.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

MINIO_RELEASE="${MINIO_RELEASE:-RELEASE.2025-09-07T16-13-09Z}"
MC_RELEASE="${MC_RELEASE:-RELEASE.2025-08-13T08-35-41Z}"
MINIO_ADDRESS="${MINIO_ADDRESS:-127.0.0.1:9000}"

bindir="$(mktemp -d)"
datadir="$(mktemp -d)"
cleanup() {
  if [[ -n "${minio_pid:-}" ]] && kill -0 "${minio_pid}" 2>/dev/null; then
    kill "${minio_pid}" 2>/dev/null || true
    wait "${minio_pid}" 2>/dev/null || true
  fi
  rm -rf "${bindir}" "${datadir}"
}
trap cleanup EXIT

echo "Downloading MinIO ${MINIO_RELEASE} and mc ${MC_RELEASE}"
curl -fsSL -o "${bindir}/minio" \
  "https://github.com/minio/minio/releases/download/${MINIO_RELEASE}/minio.linux-amd64.${MINIO_RELEASE}"
curl -fsSL -o "${bindir}/mc" \
  "https://github.com/minio/mc/releases/download/${MC_RELEASE}/mc.linux-amd64.${MC_RELEASE}"
chmod +x "${bindir}/minio" "${bindir}/mc"
export PATH="${bindir}:${PATH}"

export MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
"${bindir}/minio" server "${datadir}" --address "${MINIO_ADDRESS}" >/tmp/minio-ci-server.log 2>&1 &
minio_pid=$!

for _ in $(seq 1 30); do
  if curl -sf "http://${MINIO_ADDRESS}/minio/health/live" >/dev/null; then
    break
  fi
  if ! kill -0 "${minio_pid}" 2>/dev/null; then
    echo "MinIO exited before becoming ready" >&2
    cat /tmp/minio-ci-server.log >&2 || true
    exit 1
  fi
  sleep 1
done
if ! curl -sf "http://${MINIO_ADDRESS}/minio/health/live" >/dev/null; then
  echo "MinIO did not become ready" >&2
  cat /tmp/minio-ci-server.log >&2 || true
  exit 1
fi

export MC_ALIAS="${MC_ALIAS:-ci}"
export MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://${MINIO_ADDRESS}}"
export STORAGE_BUCKET="${STORAGE_BUCKET:-crikket}"
export STORAGE_DENY_BUCKET="${STORAGE_DENY_BUCKET:-crikket-policy-deny-probe}"
export CRIKKET_MINIO_ACCESS_KEY="${CRIKKET_MINIO_ACCESS_KEY:-crikket-ci}"
export CRIKKET_MINIO_SECRET_KEY="${CRIKKET_MINIO_SECRET_KEY:-crikket-ci-secret}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://crikket.kodegt.com}"
export CHROME_EXTENSION_ID="${CHROME_EXTENSION_ID:-abcdefghijklmnopqrstuvwxyzabcdef}"

bash "${root}/scripts/minio-harden.sh"

export STORAGE_ACCESS_KEY_ID="${CRIKKET_MINIO_ACCESS_KEY}"
export STORAGE_SECRET_ACCESS_KEY="${CRIKKET_MINIO_SECRET_KEY}"
export STORAGE_REGION="${STORAGE_REGION:-us-east-1}"
export STORAGE_ENDPOINT="${MINIO_ENDPOINT}"
export STORAGE_ADDRESSING_STYLE="${STORAGE_ADDRESSING_STYLE:-path}"

bun "${root}/scripts/storage-smoke.ts"
