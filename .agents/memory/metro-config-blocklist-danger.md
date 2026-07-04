---
name: Metro config blockList must never touch node_modules
description: Why a metro.config.js resolver.blockList broke production EAS/CI builds while working fine in the Replit dev workflow.
---

Adding a `metro.config.js` with `resolver.blockList` to stop Metro's dev-server file watcher from crashing on ephemeral non-source directories (e.g. `.local/`, agent tooling scratch dirs) is risky: an unanchored regex like `/(^|\/)(dist|...)\/.*/` matches "dist" anywhere in a path, including `node_modules/react-native-web/dist/...`, `node_modules/react-i18next/dist/...`, etc. That breaks `expo export`/EAS builds with "Unable to resolve module ... /dist/..." errors.

**Why:** It appeared to work in the Replit dev workflow (watcher just stopped crashing) but silently broke the separate EAS Update GitHub Actions build, since bundling actually needs those `node_modules/**/dist/` files. Even an install anchored to the project root (`^${rootDir}/(dirname)/.*`) is safer but still adds risk/maintenance surface for a problem (rare watcher ENOENT crash from `.local/` scratch dirs) that hits a dev convenience, not production.

**How to apply:** Prefer NOT adding a project-wide `metro.config.js` blockList for this project — it was removed after causing a production EAS build failure. If the watcher-crash problem returns, don't reach for `resolver.blockList`; consider alternatives that can't leak into `node_modules` matching (e.g. `resolver.blockList` explicitly built from `exclusionList()` with directory-literal regexes anchored with both start AND end boundary segments, tested against an actual `node_modules/**/dist` path before shipping) — and always verify with a full `expo export` (or the actual CI build command) afterward, not just a workflow restart, since the failure only shows up in the bundler/export step.
