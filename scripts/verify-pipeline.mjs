#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = §22 확정 순서의 **기계 오케스트레이터 1벌** (글 아닌 기계).
// = 사장님 확정 순서: 수정 → 기계검증4 → 크롬DEV 실증(사용자 관점) → 무한루프 → 판단3종 → 표 → 문서 업뎁 → 대기
//   → 커밋 승인(스탬프) → 빌드필요 체크 → 커밋·푸시.
// = 핵심: 각 단계 통과 시 **그 시점 코드 지문(diff 해시)** 을 마커(.verify-state.json)에 기록.
//   커밋 훅은 재실행 대신 지문 대조 = **중복 검증 제거**(사장님 지적: 기계검증 4회 중복). 코드가 바뀌면 지문 불일치 = 그 단계 재요구.
// = 모드:
//   machine        = 가드3(§19박제·§16재발명·§0 500줄) + 기계4(tsc·서버빌드·웹빌드·lint) 실행 → 통과 시 machine 마커
//   evidence "메모" = 크롬DEV/실호출 실증 완료 기록(AI 가 실증 근거 1줄과 함께 호출) → evidence 마커
//   judge-pass     = 판단3종(verify-workflow) allPassed 후에만 호출 → judge 마커
//   status         = 단계별 상태 표(사장님용)
//   hook-check     = pre-commit 전용: 지문 대조(기계 불일치 = 그 자리 1회 재실행 / 판단·실증 불일치 = 커밋 차단) + 빌드필요 표시
// = 솔직 한계: 마커도 AI 가 허위 호출 가능(스탬프와 동일). 실효 = 무심결 생략의 기계 차단 + 시각·지문 감사 흔적.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const STATE = ".verify-state.json";
// ⚠️ 판정 = 화이트리스트(코드 나열) 폐기 = 2026-08-06 §19 — 판단검증이 누락을 2차례(plugins/… → babel.config 등) 적발 = 나열은 구조적으로 또 빠뜨림.
//   반전: **명백한 문서만 면제**(docs/ 와 .md), 나머지 전부 = 코드 취급(실증·판단 필수 + 지문 포함). 스킬 prompt.txt = 프롬프트=코드 = 면제 아님.
const NON_CODE_RE = /^docs\/|\.md$/;
const isCodePath = (f) => !NON_CODE_RE.test(f);

const sh = (cmd, opts = {}) =>
  execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024, // 대형 출력 안전(§22 판단검증 적발 = 기본 1MB 크래시 회귀 방지)
    ...opts,
  });

// 지문 = **코드 경로만**의 staged blob 해시 목록(git ls-files -s) md5.
//   왜 코드 한정: 사장님 확정 순서 = "판단3종 → 문서 업뎁 → 대기" = 문서 갱신이 판단 **뒤** = 문서 수정이 지문을 깨면
//   문서 1줄마다 판단 재검 요구 = 순서 자체가 불성립. 코드가 안 바뀌면 실증·판단은 유효한 게 의미론상 정답.
//   문서의 §19 박제 검사는 hook-check 가 가드3를 **상시** 실행해 담당(아래) = 구멍 없음.
//   옛 diff 텍스트 md5(1MB 크래시)·전체 트리 해시(문서에 깨짐) = 폐기 2026-08-06 §19.
function fingerprint(stage = true) {
  if (stage) sh("git add -A", { stdio: "ignore" });
  // -c core.quotepath=false = 한글 파일명을 따옴표 인용 없이 원문 출력(§22 판단검증 적발 2026-08-06: 인용되면 한글 문서가 전부 코드로 오분류)
  const lines = sh("git -c core.quotepath=false ls-files -s")
    .split(/\r?\n/)
    .filter((l) => isCodePath(l.split(/\t/)[1] || ""))
    .join("\n");
  return createHash("md5").update(lines).digest("hex");
}
const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
};
const writeState = (s) =>
  writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n", "utf8");
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const stagedCodeChanged = () =>
  sh("git -c core.quotepath=false diff --cached --name-only")
    .split(/\r?\n/)
    .some((f) => f.trim() && isCodePath(f.trim()));

// 가드 3종·기계 4종 = 기존 검증기 그대로 호출(재발명 0). runGuards = machine·hook-check 공용 1벌(§16)
function runGuards() {
  sh("node scripts/guard-no-old-artifacts.mjs --staged", { stdio: "inherit" });
  sh("node scripts/guard-no-reinvention.mjs --staged", { stdio: "inherit" });
  sh("node scripts/guard-max-file-lines.mjs --staged", { stdio: "inherit" });
}
function runMachine() {
  runGuards();
  sh("node scripts/verify-before-commit.mjs", { stdio: "inherit" });
}

const mode = process.argv[2] || "status";
const state = readState();

if (mode === "machine") {
  const fp = fingerprint();
  runMachine(); // 실패 = throw = exit 1
  state.machine = { fp, at: now() };
  writeState(state);
  console.log(
    `✅ [machine] 가드3+기계4 통과 = 마커 기록 (지문 ${fp.slice(0, 8)})`,
  );
  process.exit(0);
}

if (mode === "evidence") {
  const note = process.argv[3] || "";
  if (!note) {
    console.error(
      '⛔ 실증 메모 필수: verify-pipeline.mjs evidence "무엇을 어떻게 입증했는지 1줄"',
    );
    process.exit(1);
  }
  state.evidence = { fp: fingerprint(), at: now(), note };
  writeState(state);
  console.log(`✅ [evidence] 실증 마커 기록: ${note}`);
  process.exit(0);
}

if (mode === "judge-pass") {
  state.judge = { fp: fingerprint(), at: now() };
  writeState(state);
  console.log(
    "✅ [judge] 판단3종 통과 마커 기록 (verify-workflow allPassed 후에만 호출할 것)",
  );
  process.exit(0);
}

if (mode === "status") {
  const fp = fingerprint(false);
  const row = (k, need = true) => {
    const m = state[k];
    if (!m) return need ? "🔴 미실행" : "⚪ 없음";
    return m.fp === fp
      ? `✅ ${m.at}${m.note ? " | " + m.note : ""}`
      : `🟡 낡음(코드 변경됨, ${m.at})`;
  };
  console.log("┌─ §22 파이프라인 상태 (지문 " + fp.slice(0, 8) + ") ─");
  console.log("│ 기계검증(가드3+기계4): " + row("machine"));
  console.log("│ 크롬DEV/실호출 실증:   " + row("evidence"));
  console.log("│ 판단 3종:              " + row("judge"));
  console.log(
    "│ 커밋 토큰:             " +
      (existsSync(".commit-approved")
        ? "✅ 발급됨"
        : "⚪ 없음(사장님 승인 대기)"),
  );
  console.log("└─");
  process.exit(0);
}

if (mode === "hook-check") {
  const fp = fingerprint(false); // 훅 시점 = 이미 staged
  // ⓪ 가드3 = **항상** 실행(수 초, staged 전체 = 문서 포함 §19 박제·§16 재발명·§0 500줄 검사 = 코드 한정 지문의 구멍 보완)
  runGuards();
  // ① 기계4 = 코드 지문 불일치·없음이면 그 자리 1회 재실행(중복 방지의 예외 = 최후 안전망) 후 마커 갱신
  if (state.machine?.fp !== fp) {
    console.log("[hook] 기계검증 마커 불일치/없음 = 이 자리에서 1회 실행...");
    sh("node scripts/verify-before-commit.mjs", { stdio: "inherit" });
    state.machine = { fp, at: now() };
    writeState(state);
  } else {
    console.log(
      `[hook] ✅ 기계검증 = 마커 일치(${state.machine.at}) = 재실행 생략(중복 제거)`,
    );
  }
  // ② 코드 변경 커밋 = 실증·판단 마커 필수(문서만 바꾼 커밋은 면제 = 실증 대상이 없음)
  if (stagedCodeChanged()) {
    if (state.evidence?.fp !== fp) {
      console.error(
        "\n⛔ 커밋 차단 = 크롬DEV/실호출 **실증 마커 없음·낡음**(§21·§22 사장님 확정 순서).",
      );
      console.error(
        '   = 실증 후 `node scripts/verify-pipeline.mjs evidence "근거 1줄"` 기록.\n',
      );
      process.exit(1);
    }
    if (state.judge?.fp !== fp) {
      console.error("\n⛔ 커밋 차단 = **판단3종 마커 없음·낡음**(§22).");
      console.error(
        "   = verify-workflow(판단3종) allPassed 후 `node scripts/verify-pipeline.mjs judge-pass` 기록.\n",
      );
      process.exit(1);
    }
    console.log(
      `[hook] ✅ 실증(${state.evidence.at}: ${state.evidence.note}) + 판단3종(${state.judge.at}) = 마커 일치`,
    );
  } else {
    console.log("[hook] 문서 전용 커밋 = 실증·판단 마커 면제");
  }
  // ③ 빌드필요 체크(사장님 확정 순서 = 승인 후·커밋 직전, 정보 표시 = 비차단)
  try {
    sh("node scripts/needs-rebuild.mjs", { stdio: "inherit" });
  } catch {
    /* 정보성 = 커밋은 막지 않음 */
  }
  process.exit(0);
}

console.error(
  `알 수 없는 모드: ${mode} (machine|evidence|judge-pass|status|hook-check)`,
);
process.exit(1);
