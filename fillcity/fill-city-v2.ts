// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 시드발굴 WF 1벌 = 제미니 힌트 → B1 문지기 → TS=PID 확정 → 같은 PID 병합 → PID 페이지 1회 방문(사진·대조·최신화). 옛 6단계 WF·A등급 직행 merge 삭제 §19.
//   (정본 = docs/2026-08-25 Tripis v1 안정화.md §"신규 시드발굴 정규 WF 설계안" 75~98행)
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
// ⚠️ 수정금지(승인필요) 2026-08-30 사장님 SSOT = 외부 유료호출(③ Gemini·⑥ TS) 은 무조건 별도 명시 플래그 없이는 실행 금지
//   (규모무관 방향보고+명시승인 후에만 = 세션 표준 반복확인 사항).
const runDiscover = argv["discover"] === "true"; // ③ 7개국어 발굴(Gemini 7콜/도시)
const runConfirm = argv["confirm"] === "true"; // ⑥ confirm+new PID 확정(TS n콜/도시)
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
    "Usage: --city-id=<N> [--apply] [--discover=true] [--confirm=true] [--only=pid,move,status,discover,merge-diff,confirm,dedup-recheck,image,verify] [--langs=ko,en,...]",
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
  console.error(
    `✗ ${label} = ${retries}회 재시도 후 실패 = 건너뜀(다른 단계 계속, 끝에 요약)`,
  );
  failures.push(label);
}

const only = (name: string) => !onlyArg || onlyArg.includes(name);

(async () => {
  console.log(
    `═══ fill-city-v2(신규 8단계 WF) — city ${cityId} · apply=${apply} · discover(유료)=${runDiscover} · confirm(유료)=${runConfirm} ═══`,
  );

  // ①② 창고 정제(0원, 구글맵 공개페이지)
  if (only("pid")) {
    // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = PID 페이지는 hl=en 으로 연다. 실측 = 페이지는 상호를 번역하지 않고 카테고리·국가명만 번역하므로 도시 언어로 열면 name_en 칸에 비영어가 들어간다.
    run("① PID 재확인·최신화", "server/services/fill/gmaps-pid-identity.ts", [
      `--city-id=${cityId}`,
      "--verify",
      "--lang=en",
      ...(apply ? ["--apply"] : []),
    ]);
  }
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 좌표가 절대값 = 소속오염 행은 500km 안 가장 가까운 도시로 이동, 없으면 삭제. PID 최신화(①) 뒤 = 교정된 좌표로 판정.
  if (only("move")) {
    run("②-1 소속오염 이동", "server/services/fill/wrongcity-quarantine.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }
  if (only("status")) {
    run("② 상태규칙 백필", "server/services/fill/status-backfill.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }

  // ③ 7개국어 발굴(🔴 유료 = Gemini 7콜/도시, 명시 승인 없으면 건너뜀)
  if (only("discover")) {
    if (runDiscover) {
      for (const lang of langs) {
        // ⚠️ 수정금지(승인필요) 2026-08-30 판단3종 적발 = 유료 호출은 재시도 0(성공 후 저장단계 실패해도
        //   같은 언어를 또 호출하면 이중과금 위험, §9·§18) — 실패 시 사람이 보고 재실행 여부 결정.
        run(
          `③ 7개국어 발굴(${lang})`,
          "fillcity/prompts/02-discover-best20-perlang/run.ts",
          [`--city-id=${cityId}`, `--lang=${lang}`],
          0,
        );
      }
    } else {
      console.log(
        "\n━━━━━━ ③ 7개국어 발굴 ━━━━━━\n⏭️ 건너뜀(🔴 유료 = Gemini 최대 7콜/도시) — 실행하려면 --discover=true 명시",
      );
    }
  }

  // ④ 선처리(B1, 0원 문지기 드라이런)
  if (only("merge-diff")) {
    run("④ 선처리(B1 문지기 매칭)", "fillcity/steps/discovery-merge-diff.ts", [
      `--city-id=${cityId}`,
    ]);
  }

  // ⑤ TS→PID 확정(🔴 유료 = TS n콜/도시, 명시 승인 없으면 건너뜀)
  if (only("confirm")) {
    if (runConfirm) {
      // ⚠️ 수정금지(승인필요) 2026-08-30 판단3종 적발 = 유료 호출(TS)은 재시도 0(§9·§18 이중과금 방지).
      run(
        "⑤ TS→PID 확정(B2)",
        "fillcity/steps/discovery-verify-and-insert.ts",
        [`--city-id=${cityId}`, ...(apply ? ["--apply=true"] : [])],
        0,
      );
    } else {
      console.log(
        "\n━━━━━━ ⑤ TS→PID 확정 ━━━━━━\n⏭️ 건너뜀(🔴 유료 = TS n콜/도시) — 실행하려면 --confirm=true 명시",
      );
    }
  }

  // ⑥ 같은 PID 쌍둥이 병합(0원, ②와 같은 도구)
  if (only("dedup-recheck")) {
    run("⑥ 같은 PID 쌍둥이 병합", "server/services/fill/status-backfill.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }

  // ⑦ 백필+검증 = 사진 없으면 채우고, 있으면 PID 페이지로 6요소 대조(verified_at 기록)
  if (only("image")) {
    run(
      "⑦ 백필+검증(backfill-verify)",
      "server/services/fill/backfill-verify.ts",
      [`--city-id=${cityId}`, ...(apply ? ["--apply"] : [])],
    );
  }

  // ⑧ 검수(0원)
  if (only("verify")) {
    run("⑧ 검수(status)", "fillcity/status.ts", [`--city-id=${cityId}`]);
  }

  if (failures.length) {
    console.log(`\n⚠️ 실패한 단계(재시도 후) = ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ 전 단계 완료(건너뛴 유료 단계 제외)");
  }
})();
