---
name: Build automation structure
description: How dev workflow and production deployment handle builds — no manual build needed in either case.
---

**Rule:** Do NOT manually run `npm run server:build` or `npx expo export --platform web` as part of the sync cycle. Both environments handle builds automatically.

**Why:** Confirmed via `.replit` config and Replit official docs.

**How it works:**

| Environment | Run command | Build needed? |
|---|---|---|
| Dev workflow (`Start application`) | `npx tsx server/index.ts` | ❌ — tsx runs TypeScript directly |
| Production (`my-guide.replit.app`) | `node server_dist/index.js` | ✅ — but Replit auto-runs it at Publish time |

**`.replit` deployment config:**
```toml
[deployment]
build = ["npm", "run", "build"]   ← auto-runs at every Publish
run   = ["node", "server_dist/index.js"]
```

`npm run build` = `npm run server:build && npx expo export --platform web` — both server bundle and frontend dist are rebuilt automatically at Publish.

**Standard sync cycle (correct):**
1. `git diff --stat <prev> HEAD` — check what changed
2. Restart `Start application` (backend change reflected immediately via tsx)
3. If `client/` / `app.json` changed → restart `Start Frontend` too (Metro picks up changes)
4. Hit Publish → Replit handles full build + deploy automatically

**What NOT to do:** Do not add a manual `npm run server:build` step to the sync cycle — it was a mistake based on misreading the `.replit` run command as the dev workflow command (it is only the production run command).
