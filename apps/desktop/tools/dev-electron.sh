#!/usr/bin/env bash
set -euo pipefail

if [ -z "$TURBO_BUILD_VARIANT" ]; then
  echo "TURBO_BUILD_VARIANT is not set or is empty, abort."
  exit 1
fi

if [ -z "$TURBO_BUILD_ENVIRONMENT" ]; then
  echo "TURBO_BUILD_ENVIRONMENT is not set or is empty, abort."
  exit 1
fi

# Determine script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT="$DIR/.."
cd "$ROOT"

# Export GIT_REVISION variable
GIT_REVISION=$(git rev-parse --short HEAD || true)
export GIT_REVISION

# Build main, preload and app
VITE_MAKE=electron,electron-main,$TURBO_BUILD_VARIANT,$TURBO_BUILD_ENVIRONMENT npx vite build -m development -c config/vite.config.ts
VITE_MAKE=electron,electron-preload,$TURBO_BUILD_VARIANT,$TURBO_BUILD_ENVIRONMENT npx vite build -m development -c config/vite.config.ts
VITE_MAKE=electron,screenshare-preload,$TURBO_BUILD_VARIANT,$TURBO_BUILD_ENVIRONMENT npx vite build -m development -c config/vite.config.ts
VITE_MAKE=electron,app,$TURBO_BUILD_VARIANT,$TURBO_BUILD_ENVIRONMENT tools/run-with-vite.mjs -m development -c config/vite.config.ts -r electron -p electron.pid -- . \
    ${CHROMIUM_FLAGS:-} \
    --ozone-platform-hint=auto --enable-features="WaylandWindowDecorations" \
    $*
    