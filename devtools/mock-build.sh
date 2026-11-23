#!/bin/bash
# Offline mock build: compile src/ + mock/ to dist-dev/ with tsc (no Vite,
# no bundler) so the app can be tested in a plain browser with the mock
# bridge via an import map. Used while npm/Vite are unavailable (proxy
# outage) and as a fast offline check afterwards.
#
# Usage: bash devtools/mock-build.sh
#   then: python3 -m http.server 5173 --directory dist-dev
#   open: http://localhost:5173/mock-harness.html
set -euo pipefail
cd "$(dirname "$0")/.."

TSC=""
if [ -x node_modules/.bin/tsc ]; then
  TSC="node_modules/.bin/tsc"
elif [ -x /home/hatch/workspace/mstrx/node_modules/.bin/tsc ]; then
  TSC="/home/hatch/workspace/mstrx/node_modules/.bin/tsc"
else
  echo "tsc not found (need node_modules or the mstrx fallback)" >&2
  exit 1
fi

rm -rf dist-dev
"$TSC" -p tsconfig.dev.json
cp devtools/mock-harness.html dist-dev/mock-harness.html
mkdir -p dist-dev/public
cp public/icon.png dist-dev/public/icon.png 2>/dev/null || true
echo "mock build OK -> dist-dev/ (serve: python3 -m http.server 5173 --directory dist-dev)"
