#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = §19 가드 = 옛것 박제 기계 차단 (글 아닌 기계)
// = AI 의 나쁜 습관(옛 내용을 주석/취소선/폴백으로 박제) 을 헌법 글이 아니라 기계로 영구 차단.
// = 진입점 3개:
//     --file <경로>   : Claude Code PostToolUse hook (Edit/Write 직후 그 파일 검사 = 그 자리 차단)
//     --staged        : git pre-commit (staged diff 추가줄 검사 = 커밋 최후 방어선)
//     --stdin         : Claude Code hook 이 stdin JSON 으로 file_path 주는 버전 대응
// = 위반 시 exit 1 + stderr 사유 → AI/커밋 차단.
import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";

// 삭제마커 + (날짜 또는 §) 둘 다 있으면 = 사장님 승인 스타일(삭제사유 1줄) = 통과
const DELETE_MARK =
  /(폐기|폐지|삭제|철회|제거|완전삭제|deprecated|dead[- ]?code)/;
const DATE_OR_SEC = /(20\d\d-\d\d-\d\d|§\s?\d)/;
// CLAUDE.md = 헌법 자체 = 금지 패턴을 글로 설명해야 함 = 스캔 제외(가드가 자기 규칙 설명문을 잡으면 안 됨).
const SKIP_PATH =
  /(server[\/\\]data[\/\\]|\.json$|node_modules|server_dist|dist[\/\\]|bts-app[\/\\]node_modules|_archive|CLAUDE\.md$|guard-no-old-artifacts\.mjs$)/;
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|md|sql)$/;

const isDeletionReason = (l) => DELETE_MARK.test(l) && DATE_OR_SEC.test(l);

// quote=true 룰 = 옛 내용 인용(삭제사유 동반 시 통과) / quote=false = 폴백코드(무조건 차단) / warn=true = 경고만
const RULES = [
  {
    id: "OLD_QUOTE_DQ",
    re: /옛\s*"[^"]+"/,
    quote: true,
    desc: '옛 "..." 옛 값 인용 박제',
  },
  {
    id: "OLD_QUOTE_SQ",
    re: /옛\s*'[^']+'/,
    quote: true,
    desc: "옛 '...' 옛 값 인용 박제",
  },
  {
    id: "OLD_QUOTE_BT",
    re: /옛\s*`[^`]+`/,
    quote: true,
    desc: "옛 `...` 옛 코드값 박제",
  },
  {
    id: "OLD_ARRAY",
    re: /옛\s*\[[^\]]+\]/,
    quote: true,
    desc: "옛 [배열값] 박제",
  },
  {
    id: "OLD_VS_NEW_COEXIST",
    re: /(이전|옛)\s*방식\s*=.*새\s*방식\s*=/,
    quote: true,
    desc: "옛/새 방식 모순 공존",
  },
  {
    id: "OLD_FALLBACK",
    re: /옛방식\s*\|\||\|\|\s*새방식|if\s*\(\s*옛/,
    quote: false,
    desc: "옛방식 || 새방식 폴백 분기 잔존",
  },
  {
    id: "STRIKETHROUGH",
    re: /~~[^~]+~~/,
    warn: true,
    desc: "~~취소선~~ 박제 의심(경고)",
  },
];

function scanLine(line) {
  const hits = [];
  for (const r of RULES) {
    if (!r.re.test(line)) continue;
    if (r.id === "STRIKETHROUGH" && /(✅|완료|해결|done)/i.test(line)) continue; // 완료표 취소선 = 정당
    if (r.quote && isDeletionReason(line)) continue; // 삭제사유 1줄 = 통과
    if (/수정금지/.test(line)) continue; // 보호주석(§3/§6) = 통과
    hits.push(r);
  }
  return hits;
}

function scanFile(path) {
  if (!path || !existsSync(path) || statSync(path).isDirectory()) return [];
  if (SKIP_PATH.test(path) || !SCAN_EXT.test(path)) return [];
  const out = [];
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const h of scanLine(line))
        out.push({
          path,
          line: i + 1,
          id: h.id,
          warn: !!h.warn,
          desc: h.desc,
          text: line.trim().slice(0, 100),
        });
    });
  return out;
}

// --staged: staged diff 의 추가(+)된 줄만 검사 (= 새로 박제한 것만, 기존 잔존은 통과)
function scanStaged() {
  const files = execSync("git diff --cached --name-only --diff-filter=ACM", {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => SCAN_EXT.test(f) && !SKIP_PATH.test(f));
  const out = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const diff = execSync(`git diff --cached -U0 -- "${f}"`, {
      encoding: "utf8",
    });
    diff.split(/\r?\n/).forEach((l) => {
      if (!l.startsWith("+") || l.startsWith("+++")) return;
      const line = l.slice(1);
      for (const h of scanLine(line))
        out.push({
          path: f,
          line: "+",
          id: h.id,
          warn: !!h.warn,
          desc: h.desc,
          text: line.trim().slice(0, 100),
        });
    });
  }
  return out;
}

// --stdin: Claude Code hook 이 stdin JSON 으로 주는 경우 (tool_input.file_path 추출)
function fileFromStdin() {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return null;
    const j = JSON.parse(raw);
    return (
      j?.tool_input?.file_path || j?.file_path || j?.tool_input?.path || null
    );
  } catch {
    return null;
  }
}

// --all: 레포 전체 추적 파일 스캔 (= 현황 점검용 = 한 프로세스에서 git ls-files 일괄)
function scanAll() {
  const files = execSync(
    'git ls-files "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs" "*.md" "*.sql"',
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !SKIP_PATH.test(f));
  const out = [];
  for (const f of files) out.push(...scanFile(f));
  return out;
}

const args = process.argv.slice(2);
let findings = [];
if (args[0] === "--staged") findings = scanStaged();
else if (args[0] === "--all") findings = scanAll();
else if (args[0] === "--file") findings = scanFile(args[1]);
else if (args[0] === "--stdin") findings = scanFile(fileFromStdin());
else {
  console.error("사용법: --staged | --all | --file <경로> | --stdin");
  process.exit(2);
}

const hard = findings.filter((f) => !f.warn);
const warn = findings.filter((f) => f.warn);

if (warn.length) {
  console.error("\n⚠️ §19 박제 의심(경고, 차단 안 함):");
  for (const w of warn)
    console.error(`  ${w.path}:${w.line} [${w.id}] ${w.text}`);
}
if (hard.length) {
  console.error(
    '\n❌ §19 위반 = 옛것 박제 차단 (헌법: 옛것은 완전삭제, 삭제사유는 "폐기 + 날짜/§" 1줄로):',
  );
  for (const h of hard)
    console.error(
      `  ${h.path}:${h.line} [${h.id}] ${h.desc}\n     → ${h.text}`,
    );
  console.error(
    "\n해소: 옛 내용 인용/폴백/취소선을 삭제. 사유만 남기려면 `... 폐기 = 2026-XX-XX §19` 1줄 형태.\n",
  );
  process.exit(1);
}
process.exit(0);
