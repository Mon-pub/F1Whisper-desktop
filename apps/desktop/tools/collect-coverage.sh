#!/usr/bin/env bash
set -euo pipefail

TEMP_DIR=.temp/coverage

if [ -d $TEMP_DIR ]; then
  rm -rf $TEMP_DIR
fi
mkdir -p $TEMP_DIR

# Copy mocha coverage to temp directory.
cp -r .nyc_output_mocha/* $TEMP_DIR/

# Copy karma coverage to temp directory.
cp .nyc_output_karma/chrome/coverage-final.json $TEMP_DIR/karma_coverage_chrome.json
cp .nyc_output_karma/firefox/coverage-final.json $TEMP_DIR/karma_coverage_firefox.json

echo "Merging the karma and mocha coverage reports"
pnpx nyc merge $TEMP_DIR coverage/coverage.json

echo "Generating lcov coverage report"
pnpx nyc report --reporter=lcov --temp-dir coverage/

echo "Generating cobertura coverage report"
pnpm nyc report --reporter=cobertura --temp-dir coverage/

# Cleanup.
rm -rf $TEMP_DIR
# Remove entire `.temp` directory as well if it's empty.
rmdir .temp 2>/dev/null || true
