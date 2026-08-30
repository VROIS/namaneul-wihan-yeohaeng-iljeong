#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-04 사장님 SSOT = Claude Code(나) 자신을 물리 차단.
import { readFileSync } from "node:fs";

let payload = "";
try {
  payload = readFileSync(0, "utf8"); // stdin
} catch (e) {
  console.error(
    `[guard-bash-danger] stdin 읽기 실패(차단 안 함, fail-open) = ${e?.message || e}`,
  );
  process.exit(0); // 페이로드 못 읽으면 차단하지 않음(오탐으로 작업 전체를 막지 않음). 실패 자체는 로그로 남겨 조용한 무력화 방지.
}

let command = "";
try {
  const data = JSON.parse(payload);
  command = data?.tool_input?.command || "";
} catch (e) {
  console.error(
    `[guard-bash-danger] JSON 파싱 실패(차단 안 함, fail-open) = ${e?.message || e}`,
  );
  process.exit(0);
}

const DANGEROUS_PATTERNS = [
  /\bgit\b.*(?<!-)(?<!-no-)\brebase\b/i,
  /\bgit\b.*\breset\b.*--hard\b/i,
];

const hit = DANGEROUS_PATTERNS.find((re) => re.test(command));
if (hit) {
  console.error(
    `\n⛔⛔ 위험한 git 명령 차단 = "${command}"\n` +
      `   = 2026-07-04 사고(AI가 rebase 실행 → Replit 저장소 꼬임 → EAS 배포 마비 → $20+ 손실) 재발 방지.\n` +
      `   = 원격이 앞서면 git pull(merge)만 사용. 정말 필요하면 사장님께 직접 여쭤보고 Replit Git pane에서 처리.\n`,
  );
  process.exit(2); // PreToolUse 차단 신호
}

process.exit(0);
