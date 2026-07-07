---
name: server:build required for every backend change
description: .replit runs node server_dist/index.js (esbuild bundle), NOT tsx; any server/*.ts change must be bundled first.
---

**Rule:** Every `server/*.ts` change requires `npm run server:build` before it is reflected in production or the dev workflow. "Backend-only change, no build needed" is always wrong.

**Why:** `.replit` run command is `["node", "server_dist/index.js"]`. The running process is the esbuild bundle in `server_dist/`, not the TypeScript source. Restarting the workflow without rebuilding serves stale code.

**How to apply:**
- Sync cycle standard order:
  1. `git diff --stat <prev> HEAD -- server/ client/ app.json package.json`
  2. `server/` changed → `npm run server:build` (always, no exceptions)
  3. `client/` / `app.json` / `package.json` changed → `npx expo export --platform web`
  4. Grep a key symbol from the new code in `server_dist/index.js` to confirm bundle is fresh
  5. Restart Start application → then Start Frontend (never simultaneously)
- Build verification example: `grep -c "loadSeedRawMap" server_dist/index.js` — must return > 0
