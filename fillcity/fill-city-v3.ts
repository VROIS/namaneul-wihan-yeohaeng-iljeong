// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 시드발굴 WF = v3 1벌(v2 삭제 §19). ① 정제(소속오염 이동·상태 백필·병합 행 삭제) → ② 제미니(유료, 유일) → ③ 알아보는 문 → ④ 산출표를 워커 큐에 = 구글맵 확정·입력·후처리·병합 행 정리는 클라우드플레어 워커 엔진(MIX 와 같은 1벌)이 돈다 → ⑤ 검수 (정본 §)
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
    run("① 소속오염 이동", "worker/lib/services/fill/wrongcity-quarantine.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
    run("① 상태규칙 백필", "worker/lib/services/fill/status-backfill.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
    // 백필이 정한 진 행(merged)은 가진 것을 원행으로 옮기고 삭제 = 유령 0 (엔진 purgeMergedRows 1벌)
    run("① 병합 행 정리", "worker/lib/services/fill/purge-merged-rows.ts", [
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

  // ④ 구글맵 확정·입력(0원) = 산출표를 워커 큐에 → 워커가 Browser Run 으로 7요소 갖춰 넣고 후처리·병합 행 정리까지
  if (only("insert")) {
    run(
      "④ 구글맵 확정·입력(워커 큐)",
      "fillcity/steps/discovery-gmaps-insert.ts",
      [`--city-id=${cityId}`, ...(apply ? ["--apply"] : [])],
    );
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
