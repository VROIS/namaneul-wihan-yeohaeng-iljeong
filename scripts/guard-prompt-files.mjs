#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 영상 지시문 파일(worker/container/prompts/) 지문 잠금 = 한 글자라도 바뀌면 커밋 차단 · 잠금 갱신(lock)은 사장님 허가 토큰(.commit-approved)이 살아 있을 때만 (정본 2026-11-03)
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "worker/container/prompts";
const LOCK = join(DIR, "LOCK.json");
const files = () =>
  readdirSync(DIR)
    .filter((f) => /\.(txt|json)$/.test(f) && f !== "LOCK.json")
    .sort();
const digest = (f) =>
  createHash("sha256")
    .update(readFileSync(join(DIR, f)))
    .digest("hex");
const current = () => Object.fromEntries(files().map((f) => [f, digest(f)]));

if (process.argv[2] === "lock") {
  execSync("node scripts/guard-commit-approval.mjs check", {
    stdio: "inherit",
  });
  writeFileSync(LOCK, JSON.stringify(current(), null, 2) + "\n");
  console.log(`✅ 지시문 잠금 갱신: ${files().join(", ")}`);
  process.exit(0);
}

let locked;
try {
  locked = JSON.parse(readFileSync(LOCK, "utf8"));
} catch {
  console.error(
    `⛔ ${LOCK} 없음 = 사장님 승인 턴에 node scripts/guard-prompt-files.mjs lock`,
  );
  process.exit(1);
}
const now = current();
const bad = [
  ...Object.keys(now).filter((f) => locked[f] !== now[f]),
  ...Object.keys(locked).filter((f) => !(f in now)),
];
if (bad.length) {
  console.error(`⛔ 영상 지시문 파일이 잠금과 다름: ${bad.join(", ")}`);
  console.error(
    "   = 지시문은 사장님 승인 없이 바꾸지 않는다. 승인 턴에 lock 으로 갱신.",
  );
  process.exit(1);
}
console.log(`✅ 영상 지시문 ${Object.keys(now).length}개 = 잠금과 일치`);
