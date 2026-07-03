#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
npm install

LAST_BUILT_SHA_FILE=".local/last_built_sha"
CURRENT_SHA=$(git rev-parse HEAD)
PREV_SHA=""
if [ -f "$LAST_BUILT_SHA_FILE" ]; then
  PREV_SHA=$(cat "$LAST_BUILT_SHA_FILE")
fi

if [ -z "$PREV_SHA" ]; then
  echo "[post-merge] No previous build marker found, building everything."
  CHANGED_FILES=$(git ls-files)
else
  CHANGED_FILES=$(git diff --name-only "$PREV_SHA" "$CURRENT_SHA" || echo "")
fi

echo "[post-merge] Changed files since last build:"
echo "$CHANGED_FILES"

NEEDS_SERVER_BUILD=false
NEEDS_CLIENT_BUILD=false

if echo "$CHANGED_FILES" | grep -qE '^(server/|shared/|package\.json|package-lock\.json)'; then
  NEEDS_SERVER_BUILD=true
fi

if echo "$CHANGED_FILES" | grep -qE '^(client/|assets/|app\.json|package\.json|package-lock\.json)'; then
  NEEDS_CLIENT_BUILD=true
fi

if [ "$NEEDS_SERVER_BUILD" = true ]; then
  echo "[post-merge] server/ changed -> running server build"
  npm run server:build
else
  echo "[post-merge] server/ unchanged -> skipping server build"
fi

if [ "$NEEDS_CLIENT_BUILD" = true ]; then
  echo "[post-merge] client/ changed -> running expo web export"
  npx expo export --platform web --output-dir dist
else
  echo "[post-merge] client/ unchanged -> skipping dist build"
fi

mkdir -p .local
echo "$CURRENT_SHA" > "$LAST_BUILT_SHA_FILE"

echo "[post-merge] Done."
