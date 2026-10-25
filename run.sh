#!/usr/bin/env bash
# One-step start (macOS / Linux): install, create the database, build, start and open the app.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
[ -f healthcare.db ] || npm run db:init
[ -f .next/BUILD_ID ] || npm run build
URL=http://localhost:3000
( sleep 4; if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi ) >/dev/null 2>&1 &
echo "Starting on $URL (Ctrl+C to stop)"
npm start
