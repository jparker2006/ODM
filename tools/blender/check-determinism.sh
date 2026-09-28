#!/usr/bin/env bash
# Builds every asset twice into temp dirs and fails if any output differs byte for byte.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/odm-determinism.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

bash "$ROOT/tools/blender/build-all.sh" "$TMP/a" > /dev/null
bash "$ROOT/tools/blender/build-all.sh" "$TMP/b" > /dev/null

status=0
for file in "$TMP"/a/*.glb; do
  name="$(basename "$file")"
  ha="$(shasum -a 256 "$TMP/a/$name" | cut -d' ' -f1)"
  hb="$(shasum -a 256 "$TMP/b/$name" | cut -d' ' -f1)"
  if [[ "$ha" == "$hb" ]]; then
    echo "ok        $name $ha"
  else
    echo "MISMATCH  $name $ha != $hb"
    status=1
  fi
done
exit $status
