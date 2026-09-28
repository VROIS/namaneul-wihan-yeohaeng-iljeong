#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 트리피스 올리기 = 성공한 직접 배포(9-28 02:03) 순서·명령 그대로 (정본 §24)
import { execSync } from "node:child_process";

const msg = process.argv[2];
if (!msg) {
  console.log("node scripts/release.mjs <커밋메시지파일>");
  process.exit(1);
}
const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
if (
  execSync("git status --porcelain")
    .toString()
    .split("\n")
    .some((l) => l[1] && l[1] !== " ")
) {
  console.log("⛔ 커밋에 안 넣은 변경이 있다 = git status 확인");
  process.exit(1);
}

sh("node scripts/build-worker-assets.mjs");
sh(`git commit -F "${msg}"`);
try {
  sh("git push origin tripis1");
} catch {
  console.log("⛔ 푸시 실패 = 직접 배포는 계속");
}
const subject = execSync("git log -1 --format=%s")
  .toString()
  .trim()
  .replaceAll('"', "'");
sh(`npx wrangler deploy --config worker/wrangler.jsonc --message "${subject}"`);
sh("npx wrangler versions list --config worker/wrangler.jsonc");
sh("node scripts/worker-logs.mjs --min 15 --errors");
