#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-04 사장님 SSOT = Claude Code(나) 자신을 물리 차단.
// = "Replit은 이미 자동화 시스템, 문제는 AI가 그걸 무시하고 자기 편한 대로 작업한 것" = 사장님 진단.
// = 2026-07-04 사고(AI가 git rebase 실행 → Replit 저장소 stale lock → EAS 배포 마비 → $20+ 손실) 재발 방지.
// = PreToolUse 훅 = Bash/PowerShell 도구가 실제 실행되기 "전" 이 스크립트가 명령어를 검사 → 위험 패턴이면 exit 2로 차단.
// = /review 실증 지적 반영: matcher="Bash" 단독은 PowerShell 도구로 완전 우회됨(실증됨) → .claude/settings.json 의 matcher를
//   "Bash|PowerShell" 로 양쪽 다 등록해야 함(이 파일 자체가 아니라 등록 설정의 책임). 이 스크립트는 두 도구 페이로드 모두 처리.
// = 한계(정직히 명시, 완전 우회불가 아님): command 문자열 리터럴 검사이므로 base64/원격스크립트 실행 등은 못 잡음.
//   이건 "무심결 실수" 재발방지가 목적이지 악의적 우회 방지가 목적이 아님(§1 정직 = 과장 주장 금지).
import { readFileSync } from 'node:fs';

let payload = '';
try {
  payload = readFileSync(0, 'utf8'); // stdin
} catch (e) {
  console.error(`[guard-bash-danger] stdin 읽기 실패(차단 안 함, fail-open) = ${e?.message || e}`);
  process.exit(0); // 페이로드 못 읽으면 차단하지 않음(오탐으로 작업 전체를 막지 않음). 실패 자체는 로그로 남겨 조용한 무력화 방지.
}

let command = '';
try {
  const data = JSON.parse(payload);
  // Bash 도구 = tool_input.command / PowerShell 도구 = tool_input.command 동일 필드명 사용.
  command = data?.tool_input?.command || '';
} catch (e) {
  console.error(`[guard-bash-danger] JSON 파싱 실패(차단 안 함, fail-open) = ${e?.message || e}`);
  process.exit(0);
}

// ⚠️ 위험 패턴 = git rebase(모든 형태, "git -c x rebase" 처럼 옵션이 끼어도 잡히게 완화) / git reset --hard 계열.
//   git reset --soft/--mixed(비파괴)나 파일 경로 지정 reset은 차단하지 않음(과잉차단 방지).
//   ⚠️ 2026-07-04 오탐 보정 = "rebase" 앞이 "-"(= --no-rebase, --rebase=false 등 rebase를 끄는 안전 옵션)면 차단 안 함.
//   = git pull --no-rebase(=merge, 원격병합 정석)가 "rebase" 단어 때문에 막히던 오탐 해소. 실제 위험은 하위명령 "git rebase"뿐.
const DANGEROUS_PATTERNS = [
  /\bgit\b.*(?<!-)(?<!-no-)\brebase\b/i,
  /\bgit\b.*\breset\b.*--hard\b/i,
];

const hit = DANGEROUS_PATTERNS.find((re) => re.test(command));
if (hit) {
  console.error(
    `\n⛔⛔ 위험한 git 명령 차단 = "${command}"\n` +
    `   = 2026-07-04 사고(AI가 rebase 실행 → Replit 저장소 꼬임 → EAS 배포 마비 → $20+ 손실) 재발 방지.\n` +
    `   = 원격이 앞서면 git pull(merge)만 사용. 정말 필요하면 사장님께 직접 여쭤보고 Replit Git pane에서 처리.\n`
  );
  process.exit(2); // PreToolUse 차단 신호
}

process.exit(0);
