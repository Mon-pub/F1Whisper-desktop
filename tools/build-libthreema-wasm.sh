#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
_root="$(pwd)"

# Build libthreema as WASM
cd "${_root}/libs/libthreema/"
source ./tools/build-wasm.sh --target=web --no-container

# Move the build into the folder where the package.json is
mv "${_root}/libs/libthreema/build/wasm/web/"* "${_root}/libs/libthreema/wasm/web"

echo "Successfully built libthreema"
