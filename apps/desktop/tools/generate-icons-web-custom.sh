#!/usr/bin/env bash
set -euo pipefail

function print_usage() {
    echo "Usage: $0 <path> <optional-folder-name>"
    echo ""
    echo "Please specify a path towards your 1024x104 icon"
}

if [ "$#" -lt 1 ]; then print_usage; exit 1; fi

# Determine script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT="$DIR/.."

# Set the CWD
cd "$ROOT"

INPUT_ASSET_PATH=$1
OUTPUT_PATH="src/public/res/icons/custom-onprem"

# This script needs `imagemagick` (to be able to use the `convert` command), so check first if it's
# available.
if ! command -v convert -version &> /dev/null; then
    echo "Command \"convert\" could not be found! Is \"ImageMagick\" installed?"
    exit 1
fi

if ! command -v optipng &> /dev/null; then
    echo "Command \"optipng\" could not be found! Is it installed?"
    exit 1
fi

echo "Starting build"

declare -a sizes=(64 128 180 192 256 512)
mkdir -p "$OUTPUT_PATH";

echo "Building \"custom-onprem\""

# Build various sizes and write them to the temporary asset directory.
for size in "${sizes[@]}"; do
    file="$OUTPUT_PATH/icon-${size}.png"
    convert "$INPUT_ASSET_PATH" -resize x"$size" -strip "$file"
    optipng -o7 "$file"
done
