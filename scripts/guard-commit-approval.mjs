#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-06-29 사장님 SSOT = 임의 커밋 차단 기계 = 글 아닌 기계 (§19 정합)
// = AI 의 무심결/실수 커밋(= 사장님 지시 없는 커밋)을 헌법 글이 아니라 기계로 차단.
// = pre-commit 훅이 호출 = 허가 토큰(.commit-approved)이 있고 + 내용이 오늘 날짜일 때만 통과.
//   토큰 없음/날짜 불일치 = exit 1 = 커밋 거부.
// = 토큰 = 사장님이 "커밋해" 지시 시에만 AI 가 생성 = 1회용 = 커밋 성공 후 pre-commit 이 자동 삭제.
// = 토큰 내용 = 발급 시각(YYYY-MM-DD HH:mm:ss) = 시/분/초까지 = 발급 후 유효시간(5분) 이내만 통과 (= 옛 토큰/재사용/하루내 다회 우회 차단).
// = 솔직: AI 가 --no-verify / 직접 토큰생성으로 회피하면 완벽차단 불가. 목표 = 무심결/실수 커밋 + 옛 토큰 재사용 차단.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const TOKEN = ".commit-approved";
const VALID_MS = 5 * 60 * 1000; // 유효시간 5분 (= 발급 직후 1회 커밋만 = 시각 우회 차단)

// 발급 시각 문자열 = "YYYY-MM-DD HH:mm:ss" (= 토큰 생성 시 이 형식으로 기록)
function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const mode = process.argv[2]; // 'check' | 'consume' | 'stamp'

if (mode === "stamp") {
  // 사장님 "커밋해" 지시 시 = AI 가 이 명령으로 현재 시각 토큰 생성 (= 형식/시각 자동 = 수기 실수 방지)
  writeFileSync(TOKEN, nowStamp() + "\n", "utf8");
  console.log(`✅ 허가 토큰 발급: ${nowStamp()} (유효 5분, 1회용)`);
  process.exit(0);
}

if (mode === "consume") {
  // 커밋 성공 후(post-commit) = 토큰 1회용 소멸
  if (existsSync(TOKEN)) {
    try {
      unlinkSync(TOKEN);
    } catch {}
  }
  process.exit(0);
}

// 기본 = check (pre-commit)
if (!existsSync(TOKEN)) {
  console.error("\n⛔ 커밋 차단 = 사장님 허가 토큰(.commit-approved) 없음.");
  console.error(
    '   = 사장님 지시 없는 임의 커밋 방지(§10·§17). 사장님이 "커밋해" 지시 시에만 토큰 생성.\n',
  );
  process.exit(1);
}

const content = readFileSync(TOKEN, "utf8").trim();
// "YYYY-MM-DD HH:mm:ss" 파싱 (= 로컬 시각) → 현재와의 차이 검사
const m = content.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
if (!m) {
  console.error(
    `\n⛔ 커밋 차단 = 토큰 형식 오류 (토큰="${content}", 기대="YYYY-MM-DD HH:mm:ss").`,
  );
  console.error("   = 사장님 지시 시 stamp 명령으로 재발급.\n");
  process.exit(1);
}
const issued = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
const diff = Date.now() - issued;
if (diff < 0 || diff > VALID_MS) {
  const mins = Math.round(Math.abs(diff) / 60000);
  console.error(
    `\n⛔ 커밋 차단 = 허가 토큰 만료/무효 (발급="${content}", 경과=${mins}분, 유효=5분).`,
  );
  console.error(
    "   = 옛 토큰/재사용/시각 우회 방지. 사장님 지시 시 즉시 재발급 후 커밋.\n",
  );
  process.exit(1);
}

// 통과 (토큰 소멸은 post-commit 에서 = 커밋 실패 시 토큰 보존 = 재시도 가능)
process.exit(0);
