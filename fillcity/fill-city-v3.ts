// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 시드발굴 WF = v3 1벌 = ⓪ 환율표(무료 API) → ① LLM 삭제(명단 내보내기 · 판정 파일 있으면 삭제) → ① 정제(구글맵 열어 9요소 = 7요소+가격+분류 · 장소 아님 삭제 → 소속오염 이동 → 상태 백필 → 병합 행 삭제 → 분류 정렬) → ② 제미니(유료, 유일) → ③ 알아보는 문 → ④ 이 PC 에서 "있음"은 흡수·신규만 구글맵으로 입력 → ⑤ 후처리 = 그래도 가격 없는 식당만 제미니 몰아 묻기(유료, --gemini=true) → ⑥ 검수 · 종료 코드 3(구글맵 제한 보기 = 채널 막힘)이면 그 도시 멈춤 (정본 §)
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
    .map(([k, ...v]) => [k, v.length ? v.join("=") : "true"]),
);
const cityId = Number(argv["city-id"] || 0);
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 이어 읽기 = --since=시각 을 주면 그 시각 뒤에 읽은 행은 건너뛰고 멈춘 자리부터 이어 읽는다 (정본 §)
const RUN_START = argv["since"]
  ? new Date(String(argv["since"])).toISOString()
  : new Date().toISOString();
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = --auto=true 한 번 = 쓰기(apply) · 외부 호출 승인(발굴 7콜·제미니 보충) · 에이전트 실행이 전부 들어간다 (정본 §)
const auto = argv["auto"] === "true";
const apply = argv["apply"] === "true" || auto;
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 외부 유료호출은 명시 플래그(--discover · --gemini · --auto) 없이는 실행 금지 (정본 §)
const runDiscover = argv["discover"] === "true" || auto; // ② 제미니 7콜/도시
const geminiFill = argv["gemini-fill"] === "true" || auto; // ⑤ 제미니 보충 호출
const runGemini = argv["gemini"] === "true"; // ⑤ 가격 몰아 묻기(120곳/콜)
const rebestMode = argv["rebest"] === "true";
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
// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 종료 코드 3 = 구글맵 제한 보기(채널 막힘) = 지운 것 없이 멈춘다 = 다음 채널(클라우드플레어·어사이드)로
const EXIT_LIMITED = 3;
const WAIT_MIN = Math.max(1, Number(argv["wait-min"] || 5));

if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--auto=true = 한 번에 전부(쓰기·외부 호출·에이전트)] [--apply] [--review-apply=<판정 JSON>] [--drop-ids=1,2,3] [--rebest=true] [--discover=true] [--gemini=true] [--only=rates,review,clean,align,discover,merge-diff,insert,read2,scan,agent,gtarget,price,report,verify] [--fx=KES:0.0068] [--langs=ko,en,...]",
  );
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 버전 표기 = v3 를 튜닝하면 3.x(날짜와 함께), 처음부터 새로 쓰면 4 (정본 §)
const VERSION = "v3.1 (2026-10-01)";
const P = (rel: string) => path.join(ROOT, rel);
const failures: string[] = [];
// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 구글 사람 인증(제한 보기)은 풀릴 때까지 기다렸다 같은 단계를 스스로 이어서 돈다 · 실패 횟수로 세지 않고 "⛔ 사람 인증 필요" 한 줄로 알린다 (정본 §)
function run(label: string, script: string, args: string[], retries = 2) {
  console.log(`\n━━━━━━ ${label} ━━━━━━`);
  let waitedMin = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 재시도 ${attempt}/${retries} (${label})`);
    const r = spawnSync("npx", ["tsx", P(script), ...args], {
      stdio: "inherit",
      shell: true,
    });
    if (r.status === 0) return;
    if (r.status === EXIT_LIMITED) {
      waitedMin += WAIT_MIN;
      console.error(
        `⛔ 사람 인증 필요 — ${label} = 구글맵 제한 보기 = 크롬에서 인증을 풀어 주시면 ${WAIT_MIN}분 안에 스스로 이어서 돈다(기다린 지 ${waitedMin}분)`,
      );
      // shell 없이 node 직접(윈도우 shell 은 따옴표를 깨서 0초에 끝난다 = LA 실측)
      spawnSync(process.execPath, [
        "-e",
        `setTimeout(function(){}, ${WAIT_MIN * 60000})`,
      ]);
      attempt--;
    }
  }
  console.error(`✗ ${label} = ${retries}회 재시도 후 실패 = 건너뜀`);
  failures.push(label);
}

const only = (name: string) => !onlyArg || onlyArg.includes(name);
const applyArg = apply ? ["--apply"] : [];
const fxArg = argv["fx"] ? [`--fx=${argv["fx"]}`] : [];

(async () => {
  console.log(
    `═══ 필시티 ${VERSION} — city ${cityId} · apply=${apply} · discover(유료)=${runDiscover} · gemini 가격(유료)=${runGemini} ═══`,
  );

  // ⓪ 환율표(무료 API, 0원)
  if (only("rates"))
    run(
      "⓪ 환율표 갱신",
      "worker/lib/services/fill/exchange-rates.ts",
      applyArg,
      1,
    );

  // ① LLM 삭제 = 명단 내보내기(에이전트가 판정) → 판정 파일이 있으면 삭제
  if (only("review")) {
    if (argv["review-apply"])
      run("① LLM 삭제(판정 적용)", "fillcity/steps/llm-review.ts", [
        `--city-id=${cityId}`,
        `--apply=${argv["review-apply"]}`,
      ]);
    else
      run("① LLM 검토 명단 내보내기", "fillcity/steps/llm-review.ts", [
        `--city-id=${cityId}`,
        "--export",
      ]);
  }

  // ① 창고 정제(0원) = 사전 정제(9요소) + 소속오염 이동 + 상태규칙 백필 + 병합 행 삭제
  if (only("clean")) {
    run(
      "① 사전 정제(구글맵 열기·9요소·장소 아님 삭제)",
      "worker/lib/services/fill/gmaps-preclean.ts",
      [
        `--city-id=${cityId}`,
        ...applyArg,
        ...fxArg,
        `--since=${RUN_START}`,
        ...(argv["parallel"] ? [`--parallel=${argv["parallel"]}`] : []),
        ...(argv["drop-ids"] ? [`--drop-ids=${argv["drop-ids"]}`] : []),
      ],
    );
    run("① 소속오염 이동", "worker/lib/services/fill/wrongcity-quarantine.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);
    run("① 상태규칙 백필", "worker/lib/services/fill/status-backfill.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);
    run("① 병합 행 정리", "worker/lib/services/fill/purge-merged-rows.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
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

  // ③ 선처리(B1, 0원 문지기 드라이런) = 언어 묶기 + 창고 대조 · --rebest = 앞 도시 다시 정제
  if (only("merge-diff")) {
    const rebest = (step: string) =>
      run(`③ 다시 정제(${step})`, "fillcity/steps/discovery-rebest.ts", [
        `--city-id=${cityId}`,
        `--step=${step}`,
        ...applyArg,
      ]);
    if (rebestMode) rebest("reset");
    run("③ 선처리(B1 문지기 매칭)", "fillcity/steps/discovery-merge-diff.ts", [
      `--city-id=${cityId}`,
    ]);
    if (rebestMode) rebest("clean-tr");
  }

  // ④ 흡수·신규 입력(0원) = 이 PC 에서 "있음"은 그 행에 흡수, 신규만 구글맵으로 9요소 갖춰 넣고 병합 행 정리
  if (only("insert"))
    run("④ 흡수·신규 입력(이 PC)", "fillcity/steps/discovery-gmaps-insert.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);

  // ④ 읽기 2차(10-01 사장님 결정) = 발굴로 새로 들어온 행(읽기 로그 없음)만 구글맵 9요소와 세트 로그를 남기고 → 소속 이동·상태 백필·병합 정리 → 분류 정렬(표 우선, 사전 정제 직후가 아니라 읽기 2차 뒤)
  if (only("read2")) {
    run(
      "④ 읽기 2차(로그 없는 행)",
      "worker/lib/services/fill/gmaps-preclean.ts",
      [`--city-id=${cityId}`, ...applyArg, ...fxArg, "--missing-log=true"],
    );
    run("④ 소속오염 이동", "worker/lib/services/fill/wrongcity-quarantine.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);
    run("④ 상태규칙 백필", "worker/lib/services/fill/status-backfill.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);
    run("④ 병합 행 정리", "worker/lib/services/fill/purge-merged-rows.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);
  }
  if (only("align"))
    run("④ 분류 정렬", "worker/lib/services/fill/category-align.ts", [
      `--city-id=${cityId}`,
      ...applyArg,
    ]);

  // ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = ⑤ 읽은 뒤 = 탐지 → 에이전트(분류·호텔·삭제·병합·제미니 호출 명단, 판정 = 적용) → 제미니 호출(🔴 호출 = --gemini-fill=true 일 때만) (정본 §)
  if (only("scan"))
    run("⑤ 읽은 뒤 탐지", "fillcity/steps/post-read-scan.ts", [
      `--city-id=${cityId}`,
    ]);
  const files = (key: string) =>
    String(argv[key] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  // 이번 판 에이전트가 낸 결과 파일(verdict-시각 폴더) = 이번 실행 중에 만들어진 폴더만(옛 판 재적용 금지)
  let agentStart = Number.MAX_SAFE_INTEGER;
  const verdictFiles = (re: RegExp): string[] => {
    const base = path.join(ROOT, "docs", "b1-reports", String(cityId));
    if (!fs.existsSync(base)) return [];
    const dir = fs
      .readdirSync(base)
      .filter(
        (d) =>
          d.startsWith("verdict-") &&
          fs.statSync(path.join(base, d)).mtimeMs >= agentStart,
      )
      .sort()
      .pop();
    return dir
      ? fs
          .readdirSync(path.join(base, dir))
          .filter((f) => re.test(f))
          .sort()
          .map((f) => path.join(base, dir, f))
      : [];
  };
  const pick = (key: string, re: RegExp) =>
    files(key).length ? files(key) : auto ? verdictFiles(re) : [];
  if (only("agent")) {
    run("⑤ 에이전트 명단", "fillcity/steps/agent-export.ts", [
      `--city-id=${cityId}`,
    ]);
    if (auto) {
      agentStart = Date.now();
      run(
        "⑤ 에이전트 실행(동료 동시)",
        "fillcity/steps/agent-run.ts",
        [`--city-id=${cityId}`],
        0,
      );
    }
    for (const f of pick("classify-apply", /^\d+-\d+\.json$/))
      run(
        "⑤ 에이전트 판정 적용(분류·호텔·삭제)",
        "fillcity/steps/llm-review.ts",
        [`--city-id=${cityId}`, `--apply=${f}`],
      );
    for (const f of pick("dup-apply", /-dup\.json$/))
      run(
        "⑤ 에이전트 판정 적용(같은 장소 병합)",
        "fillcity/steps/dup-merge.ts",
        [`--city-id=${cityId}`, `--apply=${f}`],
      );
  }
  if (only("gtarget")) {
    const mismatch = pick("mismatch", /-mismatch\.json$/);
    run(
      "⑤ 제미니 호출 대상",
      "fillcity/steps/gemini-targets.ts",
      [
        `--city-id=${cityId}`,
        ...(mismatch.length ? [`--mismatch=${mismatch.join(",")}`] : []),
        ...(geminiFill ? ["--call=true"] : []),
      ],
      0,
    );
  }

  // ⑤ 후처리(🔴 유료 = --gemini=true 일 때만) = 그래도 가격 없는·튀는 식당만 120곳/콜
  if (only("price"))
    run(
      "⑤ 후처리 가격(제미니 몰아 묻기)",
      "worker/lib/services/fill/price-gemini.ts",
      [
        `--city-id=${cityId}`,
        ...applyArg,
        ...fxArg,
        ...(runGemini ? ["--gemini=true"] : []),
      ],
      0,
    );

  // ⑥ 검수(0원) = 손님상 검수 + 엔진 상태표
  if (only("report"))
    run("⑥ 손님상 검수", "fillcity/steps/serving-report.ts", [
      `--city-id=${cityId}`,
    ]);
  if (only("verify"))
    run("⑥ 검수(status)", "fillcity/status.ts", [`--city-id=${cityId}`]);

  if (failures.length) {
    console.log(`\n⚠️ 실패한 단계(재시도 후) = ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ 전 단계 완료(건너뛴 유료 단계 제외)");
  }
})();
