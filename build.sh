#!/bin/bash
set -e
echo "=== Installing dependencies ==="
npm install

echo "=== Building server bundle ==="
npm run server:build

echo "=== Building Expo web frontend ==="
npx expo export --platform web

echo "=== Build complete ==="
