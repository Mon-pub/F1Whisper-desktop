#!/usr/bin/env bash
set -euo pipefail

function print_usage() {
    echo "Usage: $0 <path-to-libthreema> <commit-like>"
}

# If no arguments or too many arguments are passed, print usage
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then print_usage; exit 1; fi

if (! docker stats --no-stream > /dev/null ); then
  echo "Please start the docker daemon to build libthreema"
  exit 0
fi

# Parse libthreema dir
LIBTHREEMA_DIR="$1"; shift

# Determine script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT="$DIR/.."

# Move to libthreema for checkout
cd "$LIBTHREEMA_DIR"

# Check that the repo is clean
if [ -n "$(git status --porcelain)" ]; then
    echo libthreema has changes, please commit them
    exit 1
fi

# Checkout the given commit-like
if [ "$#" -eq 1 ]; then
    git fetch
    git checkout "$1"; shift
fi

# Ensure that submodule is checked out
SUBMODULE_STATUS=$(git submodule status threema-protocols 2>/dev/null)
if [[ $SUBMODULE_STATUS =~ ^- ]]; then
    echo "Submodule 'threema-protocols' in libthreema is not initialized."
    echo "Please run 'git submodule update --init' in the libthreema directory at $LIBTHREEMA_DIR."
    exit 1
fi

# Move to libthreema folder
cd "$ROOT"/libs/libthreema

# Remove all files except wasm/web
find . -path './wasm/web/*' -prune -o -type f -exec rm -f {} +
find . -type d -empty -delete

rsync -a "$ROOT/$LIBTHREEMA_DIR/" .

# Run the libthreema build command
./tools/build-wasm.sh --target=web

# Move the build into the folder where the package.json is
mv build/wasm/web/* wasm/web

# Ensure the build is not deleted
git add wasm

# Clean up libthreema
./.prepare-submodule-publish.sh --yes

echo Successfully built libthreema and prepared it for publishing
