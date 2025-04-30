#!/usr/bin/env bash
set -euo pipefail

if [ -d full_coverage_metadata ]; then
  rm -r full_coverage_metadata
fi
mkdir full_coverage_metadata

# Move all collected mocha files
cp -r .nyc_output_mocha/* full_coverage_metadata/

cp .nyc_output_karma/chrome/coverage-final.json full_coverage_metadata/karma_coverage_chrome.json
cp .nyc_output_karma/firefox/coverage-final.json full_coverage_metadata/karma_coverage_firefox.json


echo "Merging the karma and mocha coverage reports"
npx nyc merge full_coverage_metadata coverage/final_coverage.json

echo "Creating final coverage report"
npx nyc report --reporter=lcov --temp-dir coverage/



