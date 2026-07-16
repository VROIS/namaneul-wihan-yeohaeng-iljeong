#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-15 사장님 SSOT = §0 가벼움 가드 = 1파일 500줄 이하를 "글 아닌 기계"로 강제.
// = 근본: AI 과설계로 파일이 비대해짐(TripPlannerScreen 3,415줄 등 14개 실측). 등재만으로는 안 지켜짐 = 기계 차단.
// = 규칙(커밋 차단 기준):
//     ① 신규 파일 500줄 초과 = 차단.
//     ② 기존 파일 수정 = HEAD 보다 줄수가 "늘었고" 500줄 초과면 차단(= 슬림화 이행기: 아직 못 쪼갠 레거시 파일의
//        버그수정·감량은 허용, 더 키우는 것만 금지. 전부 쪼개지면 자연히 ①만 남음).
//     ③ EXCEPTIONS(데이터 전용 상수 = 로직 0)만 예외. 화면·서비스 로직 파일은 예외 없음.
// = 진입점:
//     --catalog : 현재 500줄 초과 파일 전체 목록(줄수 내림차순) 출력 = 1단계 슬림화 진행상황 추적.
//     --staged  : git pre-commit = 위 규칙 위반 시 exit 1.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LINES = 500;

// ── 예외 = 데이터 전용 상수 파일만(사유 필수). 로직 파일 등재 금지(= 남발 방지, 사장님 승인 필요). ──
const EXCEPTIONS = [
  'client/constants/bts-world-map-svg.ts', // SVG path 좌표 데이터 상수 2,217줄 = 로직 0 (2026-07-15 사장님 계획 승인)
];

// ── 검사 대상 = RN·서버 코드. 레거시 웹 자산(public/=§3 보호)·빌드산출물·문서는 제외. ──
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const SKIP = /(node_modules|server_dist|[\/\\]dist[\/\\]|^dist[\/\\]|_archive|^public[\/\\]|^docs[\/\\]|^assets[\/\\]|\.expo|android[\/\\]|ios[\/\\])/;

const norm = (p) => p.replace(/\\/g, '/');
const isException = (file) => EXCEPTIONS.some((e) => norm(file).endsWith(e));
const countLines = (content) => {
  if (!content) return 0;
  const n = content.split('\n').length;
  return content.endsWith('\n') ? n - 1 : n; // = wc -l 과 동일 기준
};

// ── --catalog : 500줄 초과 전수 목록(진행상황 추적 = 목표: 예외 제외 0건) ──
// = git 추적 파일만(= .gitignore 의 빌드산출물 dist-server/ 등 자동 제외).
function catalog() {
  const out = [];
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean).filter((f) => SCAN_EXT.test(f) && !SKIP.test(norm(f)));
  for (const rel of tracked) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) continue;
    const lines = countLines(readFileSync(full, 'utf8'));
    if (lines > MAX_LINES) out.push({ rel: norm(rel), lines, ex: isException(rel) });
  }
  out.sort((a, b) => b.lines - a.lines);
  const over = out.filter((f) => !f.ex);
  console.log(`# 500줄 초과 파일 카탈로그 (§0 슬림화 목표 = 예외 제외 0건) — 현재 ${over.length}건 + 예외 ${out.length - over.length}건`);
  for (const f of out) console.log(`${String(f.lines).padStart(6)}  ${f.rel}${f.ex ? '  [예외=데이터상수]' : ''}`);
  return over.length;
}

// ── --staged : 규칙 위반 검사 ──
function scanStaged() {
  const files = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => SCAN_EXT.test(f) && !SKIP.test(norm(f)) && !isException(f));
  const violations = [];
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    // 커밋될 내용(= staged 버전) 기준으로 측정
    const stagedLines = countLines(execSync(`git show ":${f}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    if (stagedLines <= MAX_LINES) continue;
    let headLines = null; // null = 신규 파일
    try { headLines = countLines(execSync(`git show "HEAD:${f}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] })); } catch { }
    if (headLines === null) violations.push({ f, stagedLines, why: `신규 파일인데 ${stagedLines}줄 (한도 ${MAX_LINES})` });
    else if (stagedLines > headLines) violations.push({ f, stagedLines, why: `${headLines}줄 → ${stagedLines}줄로 증가 (500 초과 파일은 늘리기 금지 = 쪼개기)` });
  }
  return violations;
}

const mode = process.argv[2];
if (mode === '--catalog') { catalog(); process.exit(0); }
if (mode === '--staged') {
  const violations = scanStaged();
  if (violations.length) {
    console.error(`\n❌ §0 파일 비대화 차단 = 1파일 ${MAX_LINES}줄 이하 (2026-07-15 사장님 SSOT):`);
    for (const v of violations) console.error(`  ${v.f} = ${v.why}`);
    console.error('\n해법: 파일을 완전 독립 폴더+화면/함수별 파일로 분리(패턴 = client/screens/expert/).');
    console.error('현황: node scripts/guard-max-file-lines.mjs --catalog');
    console.error('데이터 전용 상수(로직 0)만 사장님 승인 후 이 스크립트 EXCEPTIONS 에 사유와 함께 등재.\n');
    process.exit(1);
  }
  process.exit(0);
}
console.error('사용법: --catalog | --staged');
process.exit(2);
