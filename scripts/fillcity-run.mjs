#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = `/fillcity <도시번호>` = 실행 전 상태표(베이스라인) → 필시티 v3 한 판(--auto) → 실행 후 상태표 → 전후 비교 (정본 §)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const city = Number(process.argv[2]);
if (!Number.isInteger(city) || city <= 0) {
  console.error("사용법: /fillcity <도시번호>");
  process.exit(1);
}
const CDP = "http://127.0.0.1:9222";
try {
  const r = await fetch(`${CDP}/json/version`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.error(`⛔ 전용 크롬(${CDP})이 안 켜져 있다 = 켠 뒤 다시.`);
  process.exit(2);
}
const stamp = () =>
  new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "");
const dir = path.join(ROOT, "docs", "b1-reports", String(city));
const RUN = path.join(ROOT, ".claude", "fillcity-run.json");
const write = (o) => fs.writeFileSync(RUN, JSON.stringify(o));
const status = (file) => {
  const r = spawnSync(
    "npx",
    ["tsx", "fillcity/status.ts", `--city-id=${city}`],
    {
      encoding: "utf8",
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.status !== 0) {
    console.error(
      `⛔ 상태표 실패(도시 ${city}) = 유료 호출 전에 멈춤\n${r.stderr || r.stdout}`,
    );
    process.exit(3);
  }
  if (/^=== \?\(/.test(r.stdout)) {
    console.error(`⛔ 없는 도시 번호 ${city} = 유료 호출 전에 멈춤`);
    process.exit(3);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, r.stdout);
  return r.stdout;
};

const baseFile = path.join(dir, `${stamp()}_baseline-status.txt`);
const before = status(baseFile);
console.log(`═══ 베이스라인 저장 = ${baseFile}`);
const startedAt = Date.now();
write({ city, stage: "running", startedAt, baseline: baseFile });

const run = spawnSync(
  "npx",
  ["tsx", "fillcity/fill-city-v3.ts", `--city-id=${city}`, "--auto=true"],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, GMAPS_CDP: CDP },
  },
);

const afterFile = path.join(dir, `${stamp()}_after-status.txt`);
const after = status(afterFile);
write({
  city,
  stage: "finished",
  startedAt,
  baseline: baseFile,
  after: afterFile,
  exit: run.status ?? -1,
  acked: false,
});
const a = new Set(before.split("\n"));
const b = new Set(after.split("\n"));
console.log(
  `\n═══ 전후 비교 (− 실행 전 · + 실행 후) · 필시티 종료 코드 ${run.status}`,
);
for (const l of before.split("\n"))
  if (l.trim() && !b.has(l)) console.log(`− ${l}`);
for (const l of after.split("\n"))
  if (l.trim() && !a.has(l)) console.log(`+ ${l}`);
console.log(`═══ 실행 후 상태표 저장 = ${afterFile}`);
process.exit(run.status ?? 1);
