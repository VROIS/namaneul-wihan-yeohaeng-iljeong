#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = `/fillcity <도시번호>` = 상태표(베이스라인) → 필시티 한 판(--auto, .claude 폴더에 신호 파일 fillcity-only 가 있으면 그 단계만 한 번) → 실행 후 상태표 → 전후 비교 (정본 §)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
// ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 전용 크롬 = 포트 9333(Aside 9222 와 안 겹침) · 판마다 같은 프로필의 옛 전용 크롬을 닫고 최소화로 새로 켜고(로그인은 프로필에 남음 · 화면을 가로채지 않음) 판이 끝나면 닫는다 = 탭·메모리가 판을 넘어 쌓이지 않음 · ⑦ 페이지 확인 = --chrome 으로 새로 켬 · 켜도 응답 없을 때만 멈춤 (정본 §2026-10-26)
const CDP = "http://127.0.0.1:9333";
const cdpUp = async () => {
  try {
    const r = await fetch(`${CDP}/json/version`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
};
const closeChrome = () =>
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*fillcity-chrome*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ],
    { stdio: "ignore", windowsHide: true },
  );
const freshChrome = async () => {
  closeChrome();
  await new Promise((r) => setTimeout(r, 1500));
  spawn(
    "cmd",
    [
      "/c",
      "start",
      '""',
      "/min",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "--remote-debugging-port=9333",
      "--user-data-dir=C:/Users/hzino/fillcity-chrome",
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  ).unref();
  let up = false;
  for (let i = 0; i < 30 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    up = await cdpUp();
  }
  if (!up) {
    console.error(`⛔ 전용 크롬(${CDP})을 켰지만 응답이 없다.`);
    process.exit(2);
  }
  console.log("✅ 전용 크롬 새로 켜짐 = 작업 표시줄에 최소화.");
};
if (process.argv[2] === "--chrome") {
  await freshChrome();
  process.exit(0);
}
const city = Number(process.argv[2]);
if (!Number.isInteger(city) || city <= 0) {
  console.error("사용법: /fillcity <도시번호> · 전용 크롬만 새로 켜기 = --chrome");
  process.exit(1);
}
await freshChrome();
const stamp = () =>
  new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "");
const dir = path.join(ROOT, "docs", "b1-reports", String(city));
const RUN = path.join(ROOT, ".claude", "fillcity-run.json");
const ONLY = path.join(ROOT, ".claude", "fillcity-only.txt");
const only = fs.existsSync(ONLY) ? fs.readFileSync(ONLY, "utf8").trim() : "";
if (only) fs.unlinkSync(ONLY);
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
  [
    "tsx",
    "fillcity/fill-city-v3.ts",
    `--city-id=${city}`,
    "--auto=true",
    ...(only ? [`--only=${only}`] : []),
  ],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, GMAPS_CDP: CDP },
  },
);
closeChrome();
console.log(
  "✅ 전용 크롬 닫음 = 다음 판은 새로 켠다 · ⑦ 페이지 확인 = node scripts/fillcity-run.mjs --chrome",
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
// ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = ⑦ AI 최종 검수(의무) = 이 출력을 받은 AI 는 전용 크롬을 --chrome 으로 새로 켜고 fillcity/prompts/09-ai-final-review/instruction.txt 대로 페이지를 직접 열어 걸린 행을 채우고 판정 통과를 본 뒤에만 사장님께 보고한다 (정본 §2026-10-26)
console.log(
  `\n⑦ AI 최종 검수(의무) = 전용 크롬을 node scripts/fillcity-run.mjs --chrome 으로 새로 켜고 fillcity/prompts/09-ai-final-review/instruction.txt 를 읽고 그대로 한 뒤, status.ts --city-id=${city} --judge=true 통과를 확인하고 나서 보고한다. 그 전의 "끝났다"는 거짓 보고다.`,
);
process.exit(run.status ?? 1);
