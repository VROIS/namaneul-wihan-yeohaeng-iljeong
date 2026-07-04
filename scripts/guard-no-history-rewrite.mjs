#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-04 사장님 SSOT = git 히스토리 재작성 물리 차단 (= 글 아닌 기계).
// = AI 가 rebase/reset --hard 를 함부로 써서 Replit 저장소를 꼬이게 만든 사고(2026-07-04) 재발 방지.
// = pre-rebase 훅이 이 스크립트를 호출 = 허가 토큰(.history-rewrite-approved)이 있고 + 5분 이내일 때만 통과.
//   토큰 없음/만료 = exit 1 = rebase 거부.
// = 토큰 = 사장님이 "리베이스 해도 돼" 같이 명시 지시 시에만 AI 가 stamp 로 생성 = 1회용.
// = 목적: AI 의 무심결 rebase/reset (특히 Replit 관리 저장소) 물리 차단. 문서/메모리는 논문일 뿐 = 기계로 막음.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';

const TOKEN = '.history-rewrite-approved';
const VALID_MS = 5 * 60 * 1000; // 5분

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const mode = process.argv[2]; // 'check' | 'consume' | 'stamp'

if (mode === 'stamp') {
  // 사장님이 rebase/reset 을 명시 허가 시에만 AI 가 이 명령으로 토큰 생성
  writeFileSync(TOKEN, nowStamp() + '\n', 'utf8');
  console.log(`✅ 히스토리 재작성 허가 토큰 발급: ${nowStamp()} (유효 5분, 1회용)`);
  process.exit(0);
}

if (mode === 'consume') {
  if (existsSync(TOKEN)) { try { unlinkSync(TOKEN); } catch {} }
  process.exit(0);
}

// 기본 = check (pre-rebase)
if (!existsSync(TOKEN)) {
  console.error('\n⛔⛔ REBASE 차단 = 사장님 허가 토큰(.history-rewrite-approved) 없음.');
  console.error('   = 2026-07-04 사고(AI 무심결 rebase → Replit 저장소 꼬임 → EAS 배포 마비 → $20+ 손실) 재발 방지.');
  console.error('   = Replit 관리 저장소에서 rebase/reset 금지. 원격이 앞서면 git pull(merge) 또는 Replit Git pane 사용.');
  console.error('   = 정말 필요하면 사장님 명시 허가 후: node scripts/guard-no-history-rewrite.mjs stamp\n');
  process.exit(1);
}

const content = readFileSync(TOKEN, 'utf8').trim();
const m = content.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
if (!m) {
  console.error(`\n⛔ REBASE 차단 = 토큰 형식 오류 (토큰="${content}").`);
  process.exit(1);
}
const issued = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
const diff = Date.now() - issued;
if (diff < 0 || diff > VALID_MS) {
  const mins = Math.round(Math.abs(diff) / 60000);
  console.error(`\n⛔ REBASE 차단 = 허가 토큰 만료 (발급="${content}", 경과=${mins}분, 유효=5분).`);
  process.exit(1);
}

// 통과 (토큰 소멸은 post 단계에서 = 실패 시 재시도 가능)
process.exit(0);
