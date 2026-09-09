// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 시드발굴 WF v3 = 밖에서 다 확인하고 넣는다.
//   v2 대비 = ① PID 재확인 삭제(⑦ 과 같은 페이지 2회) · ⑤ TS 삭제(유료인데 오배송) · ⑥ 같은 PID 병합 삭제(밖에서 확인 후 넣어 쌍둥이가 안 생김) · ⑦ 백필 삭제(③ 에서 사진까지 받음).
//   유료는 ② 제미니 하나뿐. v2 는 확정 전까지 그대로 둔다(§19 삭제는 v3 채택 뒤).
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, "..");
process.chdir(ROOT);

const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-30 사장님 SSOT = 외부 유료호출은 별도 명시 플래그 없이는 실행 금지.
const runDiscover = argv["discover"] === "true"; // ② 제미니 7콜/도시
const onlyArg = argv["only"]
  ? String(argv["only"])
      .split(",")
      .map((s) => s.trim())
  : null;
const LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"];
const langs = argv["langs"]
  ? String(argv["langs"])
      .split(",")
      .map((s) => s.trim())
  : LANGS;

if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--discover=true] [--only=clean,discover,merge-diff,insert,verify] [--langs=ko,en,...]",
  );
  process.exit(1);
}

const P = (rel: string) => path.join(ROOT, rel);
const failures: string[] = [];
function run(label: string, script: string, args: string[], retries = 2) {
  console.log(`\n━━━━━━ ${label} ━━━━━━`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 재시도 ${attempt}/${retries} (${label})`);
    const r = spawnSync("npx", ["tsx", P(script), ...args], {
      stdio: "inherit",
      shell: true,
    });
    if (r.status === 0) return;
  }
  console.error(`✗ ${label} = ${retries}회 재시도 후 실패 = 건너뜀`);
  failures.push(label);
}

const only = (name: string) => !onlyArg || onlyArg.includes(name);

(async () => {
  console.log(
    `═══ fill-city-v3(4단계) — city ${cityId} · apply=${apply} · discover(유료)=${runDiscover} ═══`,
  );

  // ① 창고 정제(0원) = 소속오염 이동 + 상태규칙 백필
  if (only("clean")) {
    run("① 소속오염 이동", "server/services/fill/wrongcity-quarantine.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
    run("① 상태규칙 백필", "server/services/fill/status-backfill.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }

  // ② 7개국어 발굴(🔴 유료 = Gemini 7콜/도시)
  if (only("discover")) {
    if (runDiscover) {
      for (const lang of langs) {
        // ⚠️ 유료 호출은 재시도 0(성공 후 저장 실패해도 재호출 = 이중과금, §9·§18).
        run(
          `② 7개국어 발굴(${lang})`,
          "fillcity/prompts/02-discover-best20-perlang/run.ts",
          [`--city-id=${cityId}`, `--lang=${lang}`],
          0,
        );
      }
    } else {
      console.log(
        "\n━━━━━━ ② 7개국어 발굴 ━━━━━━\n⏭️ 건너뜀(🔴 유료 = Gemini 최대 7콜/도시) — 실행하려면 --discover=true 명시",
      );
    }
  }

  // ③ 선처리(B1, 0원 문지기 드라이런) = 언어 묶기 + 창고 대조
  if (only("merge-diff")) {
    run("③ 선처리(B1 문지기 매칭)", "fillcity/steps/discovery-merge-diff.ts", [
      `--city-id=${cityId}`,
    ]);
  }

  // ④ 구글맵 확정·입력(0원) = 밖에서 6요소+URI 확보 후 INSERT
  if (only("insert")) {
    run("④ 구글맵 확정·입력", "fillcity/steps/discovery-gmaps-insert.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }

  // ⑤ 검수(0원)
  if (only("verify")) {
    run("⑤ 검수(status)", "fillcity/status.ts", [`--city-id=${cityId}`]);
  }

  if (failures.length) {
    console.log(`\n⚠️ 실패한 단계(재시도 후) = ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ 전 단계 완료(건너뛴 유료 단계 제외)");
  }
})();
