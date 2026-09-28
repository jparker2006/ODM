#!/usr/bin/env bash
# Builds every Blender asset into public/assets and prints its sha256.
# Run from anywhere; paths resolve against the repo root. Override Blender with BLENDER=/path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BLENDER="${BLENDER:-$(command -v blender || echo /opt/homebrew/bin/blender)}"
OUT_DIR="${1:-$ROOT/public/assets}"
ASSETS=(district mannequin titan)

mkdir -p "$OUT_DIR"
for name in "${ASSETS[@]}"; do
  echo "building $name.glb"
  if ! "$BLENDER" -b --factory-startup -P "$ROOT/tools/blender/$name.py" -- --out "$OUT_DIR/$name.glb" \
      > "$OUT_DIR/.$name.build.log" 2>&1; then
    cat "$OUT_DIR/.$name.build.log"
    echo "build failed: $name" >&2
    exit 1
  fi
  grep -E '^(ODM|  )' "$OUT_DIR/.$name.build.log" || true
  rm -f "$OUT_DIR/.$name.build.log"
done

for name in "${ASSETS[@]}"; do
  shasum -a 256 "$OUT_DIR/$name.glb"
done
