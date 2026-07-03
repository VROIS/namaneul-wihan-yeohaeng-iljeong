---
name: Post-merge auto build/restart
description: How the repeated "sync commits, build if needed, restart, prep deploy" cycle was automated for this project.
---

The user repeatedly asked the agent to sync new commits, conditionally build server/dist, restart workflows, and prep for deploy. This was automated using the Replit platform's post-merge hook (`post_merge_setup` skill) instead of doing it manually every time.

- `scripts/post-merge.sh` runs automatically whenever new commits land on main (e.g. after a task-agent merge). No agent chat turn is needed to trigger it.
- The script diffs `git rev-parse HEAD` against a marker file (`.local/last_built_sha`) to determine which paths changed since the last build, then conditionally runs `npm run server:build` and/or `npx expo export --platform web`.
- After the script, the platform's own workflow reconciliation restarts already-running workflows — the agent does not need to call `restart_workflow` manually for routine syncs.
- Configured via `.replit`'s `[postMerge]` section (`path`, `timeoutMs`), set through `setPostMergeConfig()`.

**Why:** The user does this cycle ~100+ times and asked for automation; git-pull/merge already happens automatically via the platform when task-agent work merges, so the only missing piece was auto-building and auto-restarting after that merge — the post-merge hook covers exactly that gap.

**Remaining hard limit:** Actually clicking "Publish" to deploy still requires the human user — this is a Replit policy the agent cannot bypass. The agent can only call `suggest_deploy()` to prompt them. If the post-merge script fails, the agent gets alerted automatically and should fix it (see `post_merge_setup` skill).
