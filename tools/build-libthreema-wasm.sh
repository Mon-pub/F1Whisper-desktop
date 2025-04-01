#!/usr/bin/env bash
set -euo pipefail

function _print_usage {
    echo "Usage: $0  [--no-container] ]"
    echo
    echo "Use --no-container to not source a devcontainer environment."
}

_no_container=""
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -h | --help)
            _print_usage
            exit 0
            ;;
        --no-container)
            _no_container="--no-container"
            ;;
    esac
    shift
done
# Determine script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT="$DIR/.."

# Move to local libthreema
cd "$ROOT"/libs/libthreema

# Add wasm target
rustup target add wasm32-unknown-unknown

# Run the libthreema build command
./tools/build-wasm.sh --target=web ${_no_container}

# Move the build into the folder where the package.json is
mv build/wasm/web/* wasm/web

echo "Successfully built libthreema"
