---
name: Post-merge auto build/restart — scope is limited
description: What is and isn't actually automated for the "sync commits, build, restart, deploy" cycle in this project, and why.
---

The user repeatedly asked the agent to sync new commits, conditionally build server/dist, restart workflows, and prep for deploy. `scripts/post-merge.sh` + `.replit`'s `[postMerge]` config were built for this, but **the automation only reliably fires for Replit's Task system** (Agent working in an isolated copy, merged into main after user approval) — confirmed via `searchReplitDocs`.

**This project does not use that path.** New commits arrive via an external tool (e.g. Cursor) pushing to GitHub, then the user clicking Pull/Sync in Replit's Git tab. Docs do not confirm the `[postMerge]` hook fires for that path — it should be treated as unconfirmed/likely-not-automatic.

A native git-level `post-merge` hook was attempted as a workaround (fires on any real `git merge`/`pull`, independent of Replit's Task system). **This is blocked**: the main agent cannot modify `.git` internals at all — not `git config core.hooksPath`, not directly editing `.git/config`, not even `rm` on files under a `.githooks/` dir — all rejected as "destructive git operation, use project_tasks instead." So this workaround is not available to the main agent in this kind of single-agent, external-git-sync workflow.

**Why:** Confirmed by reading Replit's own Task-system/Task-lifecycle docs and by hitting the main-agent git sandbox guard directly (not guessed).

**How to apply:** For projects that sync via external git push + manual Pull (not Replit Task agents), do not claim "fully automated" build/restart after merges — after the user pulls, the agent must still be pinged once to diff/build/restart/verify/suggest_deploy manually (this is the reliable ceiling). Only if the project's workflow switches to Replit's own Project Tasks system does the `[postMerge]` hook's automatic-fire guarantee apply.
