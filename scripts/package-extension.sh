#!/usr/bin/env bash
# Zip the unpacked Chrome MV3 extension output for chrome://extensions
# "Load unpacked". Build first with VITE_APP_URL / VITE_SERVER_URL set.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/apps/extension/.output/chrome-mv3"
out="${1:-$root/crikket-extension-chrome-mv3.zip}"

if [[ ! -f "$src/manifest.json" ]]; then
  echo "error: missing $src/manifest.json" >&2
  echo "Build the extension first, for example:" >&2
  echo "  VITE_APP_URL=https://crikket.kodegt.com VITE_SERVER_URL=https://crikket.kodegt.com bun run --filter extension build" >&2
  exit 1
fi

python3 - "$src" "$out" <<'PY'
import sys
import zipfile
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
if out.exists():
    out.unlink()

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in src.rglob("*"):
        if path.is_file():
            archive.write(path, Path("chrome-mv3") / path.relative_to(src))

print(out)
PY
