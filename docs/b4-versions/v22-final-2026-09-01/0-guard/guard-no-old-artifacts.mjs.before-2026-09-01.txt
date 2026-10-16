#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = §19 가드 = 옛것 박제 기계 차단 (글 아닌 기계)
// = AI 의 나쁜 습관(옛 내용을 주석/취소선/폴백으로 박제) 을 헌법 글이 아니라 기계로 영구 차단.
// = 진입점 3개:
//     --file <경로>   : Claude Code PostToolUse hook (Edit/Write 직후 그 파일 검사 = 그 자리 차단)
//     --staged        : git pre-commit (staged diff 추가줄 검사 = 커밋 최후 방어선)
//     --stdin         : Claude Code hook 이 stdin JSON 으로 file_path 주는 버전 대응
// = 위반 시 exit 1 + stderr 사유 → AI/커밋 차단.
import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { resolve, basename, join } from "node:path";

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
  const content = readFileSync(path, "utf8");
  content.split(/\r?\n/).forEach((line, i) => {
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
  if (isCommentTarget(path)) out.push(...commentChecks(path, content));
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
    if (isCommentTarget(f)) {
      const staged = execSync(`git show ":${f}"`, { encoding: "utf8" });
      out.push(...commentChecks(f, staged, touchedLines(diff)));
      out.push(...staleAdjacentChecks(f, staged, diff));
    }
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

// ⚠️ 수정금지(승인필요) 2026-08-29 사장님 결정 = 코드 파일 주석 검사 3종(양 상한·인접 미갱신·유령 참조) + --dry/--fix (§6)
const CMT_EXT = /\.(ts|tsx|mjs|js)$/;
const CMT_SKIP = /(node_modules|legacy|worktrees|dist[\/\\]|server_dist)/;
const APPROVAL_WORD = /(수정금지|사장님)/;
const DATE_RE = /20\d\d-\d\d-\d\d/g;
const FILE_REF_RE =
  /[A-Za-z0-9_./-]+\.(tsx|ts|mjs|js|sql|txt|md)(?![A-Za-z0-9])/g;
// 메서드 호출(x.foo())은 제외 = 라이브러리 메서드 오탐 방지(2026-08-29)
const FN_REF_RE = /(?<![.\w])([A-Za-z_][A-Za-z0-9_]{3,})\(\)/g;
const NOT_FILE = /^(node|next|react|vue|express|three|d3)\.js$/i;
const REPO_ROOT = (() => {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
    }).trim();
  } catch {
    return process.cwd();
  }
})();

const isCommentTarget = (p) =>
  CMT_EXT.test(p) && !CMT_SKIP.test(p) && !SKIP_PATH.test(p);
const isApproval = (line) =>
  APPROVAL_WORD.test(line) && /20\d\d-\d\d-\d\d/.test(line);
// §3(수정금지 보호파일)·§18(raw 관문) 주석 = --fix 삭제 대상에서 제외(2026-08-29)
const PROTECTED_COMMENT = /(수정금지|§\s?3\b|§\s?18\b)/;
// diff 가 건드린 줄 번호(1-base) = §6 주석검사 범위 한정용
function touchedLines(diff) {
  const set = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let k = 0; k < count; k++) set.add(start + k);
  }
  return set;
}
const maxDate = (line) => (line.match(DATE_RE) || []).sort().pop() || "";

function isDirective(line) {
  const t = line.trim();
  if (t.startsWith("#!")) return true;
  if (/^\/\/\/\s*<reference/.test(t)) return true;
  const body = t.replace(/^(\/\/+|\/\*+|\*+)\s*/, "");
  return /^(eslint-|@ts-|prettier-|#region|#endregion)/.test(body);
}

function classify(lines) {
  const info = [];
  let inBlock = false;
  let owned = false;
  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    let isComment = false;
    let style = "line";
    if (inBlock) {
      const e = t.indexOf("*/");
      if (owned) {
        isComment = true;
        style = "block";
        if (e >= 0 && t.slice(e + 2).trim()) {
          for (let k = blockStart; k < i; k++) info[k].isComment = false;
          isComment = false;
        }
      }
      if (e >= 0) inBlock = false;
    } else if (t.startsWith("//")) {
      isComment = true;
    } else if (t.startsWith("/*")) {
      style = "block";
      const e = t.indexOf("*/", 2);
      if (e < 0) {
        inBlock = true;
        owned = true;
        blockStart = i;
        isComment = true;
      } else if (!t.slice(e + 2).trim()) isComment = true;
    } else {
      const o = t.lastIndexOf("/*");
      if (o >= 0 && t.indexOf("*/", o + 2) < 0) {
        inBlock = true;
        owned = false;
      }
    }
    info.push({ isComment, style, directive: isComment && isDirective(line) });
  }
  return info;
}

function blocksOf(info) {
  const blocks = [];
  let cur = null;
  info.forEach((c, i) => {
    if (c.isComment) {
      if (!cur) cur = { start: i, end: i };
      cur.end = i;
    } else if (cur) {
      blocks.push(cur);
      cur = null;
    }
  });
  if (cur) blocks.push(cur);
  return blocks;
}

function splitLines(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

let repoFiles = null;
function repoFileSets() {
  if (repoFiles) return repoFiles;
  const list = execSync("git ls-files", { encoding: "utf8", cwd: REPO_ROOT })
    .split("\n")
    .filter(Boolean);
  repoFiles = {
    paths: new Set(list),
    bases: new Set(list.map((p) => basename(p))),
  };
  return repoFiles;
}

let corpusCache = null;
function corpus() {
  if (corpusCache !== null) return corpusCache;
  const files = execSync('git ls-files "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs"', {
    encoding: "utf8",
    cwd: REPO_ROOT,
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !CMT_SKIP.test(f));
  const parts = [];
  for (const f of files) {
    const p = join(REPO_ROOT, f);
    if (existsSync(p)) parts.push(readFileSync(p, "utf8"));
  }
  corpusCache = parts.join("\n");
  return corpusCache;
}

const defCache = new Map();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function isDefined(name) {
  if (defCache.has(name)) return defCache.get(name);
  const c = corpus();
  const n = escapeRe(name);
  // 선언 키워드 또는 "이름(" 형태가 코드 어딘가에 있으면 정의로 본다(여러 줄 시그니처 대응, 오탐 방지 2026-08-29)
  const ok =
    new RegExp(`\\bfunction\\s*\\*?\\s*${n}\\b`).test(c) ||
    new RegExp(`\\b(const|let|var|class|type|interface)\\s+${n}\\b`).test(c) ||
    new RegExp(`(^|[^.\\w])${n}\\s*(<[^>\\n]*>)?\\s*\\(`, "m").test(c);
  defCache.set(name, ok);
  return ok;
}

function fileExists(tok) {
  const t = tok.replace(/^\.?\//, "").replace(/\\/g, "/");
  const { paths, bases } = repoFileSets();
  return (
    paths.has(t) || bases.has(basename(t)) || existsSync(join(REPO_ROOT, t))
  );
}

// touched = 이번 diff 가 건드린 줄 번호(1-base) 집합. 주면 그 줄 ±3 에 걸친 것만 검사(§19 와 같은 "새로 넣은 것만" 원칙, 2026-08-29).
function commentChecks(path, content, touched = null) {
  const lines = splitLines(content);
  const info = classify(lines);
  const out = [];
  const near = (a, b) => {
    if (!touched) return true;
    for (let i = a - 3; i <= b + 3; i++) if (touched.has(i + 1)) return true;
    return false;
  };
  const push = (line, id, desc, text) =>
    out.push({
      path,
      line,
      id,
      warn: false,
      desc,
      text: text.trim().slice(0, 100),
    });

  let commentLines = 0;
  info.forEach((c) => {
    if (c.isComment) commentLines++;
  });
  const blocks = blocksOf(info).filter((b) => near(b.start, b.end));
  const longest = blocks.reduce((m, b) => Math.max(m, b.end - b.start + 1), 0);
  // 승인 줄 = 블록당 1개(같은 날짜 여러 줄은 1건으로 봄). 파일당 총량 상한 없음(2026-08-29 사장님 결정).
  for (const b of blocks) {
    const dates = new Set();
    for (let i = b.start; i <= b.end; i++)
      if (!info[i].directive && isApproval(lines[i]))
        dates.add((lines[i].match(/20\d\d-\d\d-\d\d/) || [""])[0]);
    if (dates.size > 1)
      push(
        b.start + 1,
        "CMT_QUOTA_APPROVAL",
        `한 블록에 승인 줄 ${dates.size}종(${[...dates].sort().join(", ")}) = 최신 1개만 남길 것`,
        lines[b.start],
      );
  }
  if (longest > 3) {
    const b = blocks.find((x) => x.end - x.start + 1 === longest);
    push(
      b.start + 1,
      "CMT_QUOTA_BLOCK",
      `주석 블록 ${longest}줄 > 3 (최장 블록 상한)`,
      lines[b.start],
    );
  }
  if (!touched && lines.length >= 80 && commentLines / lines.length > 0.15)
    push(
      1,
      "CMT_QUOTA_RATIO",
      `주석 줄 비율 ${((commentLines / lines.length) * 100).toFixed(1)}% > 15% (${commentLines}/${lines.length})`,
      "",
    );

  info.forEach((c, i) => {
    if (!c.isComment || c.directive || !near(i, i)) return;
    const line = lines[i];
    for (const m of line.matchAll(FILE_REF_RE)) {
      const tok = m[0];
      if (NOT_FILE.test(tok)) continue;
      if (!fileExists(tok))
        push(
          i + 1,
          "CMT_GHOST_FILE",
          `유령 파일 참조 ${tok} (저장소에 없음)`,
          line,
        );
    }
    for (const m of line.matchAll(FN_REF_RE)) {
      if (!isDefined(m[1]))
        push(
          i + 1,
          "CMT_GHOST_FN",
          `유령 함수 참조 ${m[1]}() (저장소에 정의 없음)`,
          line,
        );
    }
  });
  return out;
}

function staleAdjacentChecks(path, staged, diff) {
  const added = touchedLines(diff);
  const lines = splitLines(staged);
  const info = classify(lines);
  const flagged = new Set();
  const out = [];
  for (const n of added) {
    const i = n - 1;
    if (i < 0 || i >= lines.length) continue;
    if (info[i].isComment || !lines[i].trim()) continue;
    for (
      let k = Math.max(0, i - 3);
      k <= Math.min(lines.length - 1, i + 3);
      k++
    ) {
      if (
        !info[k].isComment ||
        info[k].directive ||
        added.has(k + 1) ||
        flagged.has(k)
      )
        continue;
      flagged.add(k);
      out.push({
        path,
        line: k + 1,
        id: "CMT_STALE_ADJ",
        warn: false,
        desc: `수정한 코드(${n}줄) 옆 주석이 안 바뀜 — 재승인(날짜 갱신) 또는 삭제`,
        text: lines[k].trim().slice(0, 100),
      });
    }
  }
  return out;
}

function closeBlockLine(line) {
  const indent = line.match(/^\s*/)[0];
  const t = line.trim();
  if (t.startsWith("/*") && t.endsWith("*/")) return line;
  const body = t
    .replace(/^\/\*+\s?/, "")
    .replace(/^\*+\s?/, "")
    .replace(/\s*\*\/\s*$/, "")
    .trim();
  return `${indent}/** ${body} */`;
}

function planFix(content) {
  const lines = splitLines(content);
  const info = classify(lines);
  const drop = new Set();
  let keptApproval = 0;
  for (const b of blocksOf(info)) {
    const appr = [];
    for (let i = b.start; i <= b.end; i++)
      if (!info[i].directive && isApproval(lines[i])) appr.push(i);
    const latest =
      appr
        .map((i) => maxDate(lines[i]))
        .sort()
        .pop() || "";
    const keep = new Set(appr.filter((i) => maxDate(lines[i]) === latest));
    for (let i = b.start; i <= b.end; i++) {
      if (info[i].directive) continue;
      if (PROTECTED_COMMENT.test(lines[i])) continue; // §3·§18 보호주석 = 삭제 대상 아님
      if (keep.has(i)) keptApproval++;
      else drop.add(i);
    }
  }
  const outLines = [];
  const deleted = [];
  lines.forEach((line, i) => {
    if (drop.has(i)) {
      deleted.push({ line: i + 1, text: line });
      return;
    }
    if (info[i].isComment && info[i].style === "block" && !info[i].directive)
      outLines.push(closeBlockLine(line));
    else outLines.push(line);
  });
  const collapsed = [];
  for (const l of outLines) {
    if (
      !l.trim() &&
      collapsed.length &&
      !collapsed[collapsed.length - 1].trim()
    )
      continue;
    collapsed.push(l);
  }
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const trailing = content.endsWith("\n") ? eol : "";
  return { deleted, keptApproval, output: collapsed.join(eol) + trailing };
}

function listCodeFiles() {
  return execSync('git ls-files "*.ts" "*.tsx" "*.js" "*.mjs"', {
    encoding: "utf8",
    cwd: REPO_ROOT,
  })
    .split("\n")
    .filter(Boolean)
    .filter(isCommentTarget);
}

function runDry(targets) {
  const files = targets[0] === "--all" ? listCodeFiles() : targets;
  const report = [];
  let touched = 0;
  let removed = 0;
  let kept = 0;
  for (const f of files) {
    const p = resolve(f);
    if (!existsSync(p) || statSync(p).isDirectory() || !isCommentTarget(f))
      continue;
    const plan = planFix(readFileSync(p, "utf8"));
    kept += plan.keptApproval;
    if (!plan.deleted.length) continue;
    touched++;
    removed += plan.deleted.length;
    for (const d of plan.deleted) report.push(`${f}:${d.line}: ${d.text}`);
  }
  const summary = `요약: 파일 ${touched}개 · 삭제 예정 ${removed}줄 · 보존 승인 줄 ${kept}줄`;
  for (const l of report) console.log(l);
  console.log(summary);
  if (report.length > 100) {
    const dir = join(REPO_ROOT, "docs", "b1-reports");
    mkdirSync(dir, { recursive: true });
    const out = join(
      dir,
      `comment-sweep-dry-${new Date().toISOString().slice(0, 10)}.txt`,
    );
    writeFileSync(out, [...report, summary].join("\n") + "\n");
    console.log(out);
  }
}

function runFix(targets) {
  if (!targets.length || targets.includes("--all")) {
    console.error("--fix 는 경로를 명시해야 한다(--all 금지).");
    process.exit(2);
  }
  for (const f of targets) {
    const p = resolve(f);
    if (!existsSync(p) || statSync(p).isDirectory() || !isCommentTarget(f)) {
      console.error(`건너뜀(대상 아님): ${f}`);
      continue;
    }
    const plan = planFix(readFileSync(p, "utf8"));
    if (plan.deleted.length) writeFileSync(p, plan.output);
    console.log(
      `${f}: 삭제 ${plan.deleted.length}줄 · 승인 유지 ${plan.keptApproval}줄`,
    );
  }
}

const args = process.argv.slice(2);
let findings = [];
if (args[0] === "--staged") findings = scanStaged();
else if (args[0] === "--all") findings = scanAll();
else if (args[0] === "--file") findings = scanFile(args[1]);
else if (args[0] === "--stdin") findings = scanFile(fileFromStdin());
else if (args[0] === "--dry") {
  runDry(args.slice(1));
  process.exit(0);
} else if (args[0] === "--fix") {
  runFix(args.slice(1));
  process.exit(0);
} else {
  console.error(
    "사용법: --staged | --all | --file <경로> | --stdin | --dry [경로...|--all] | --fix <경로...>",
  );
  process.exit(2);
}

const hard = findings.filter((f) => !f.warn && !f.id.startsWith("CMT_"));
const cmt = findings.filter((f) => f.id.startsWith("CMT_"));
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
}
if (cmt.length) {
  console.error(
    "\n❌ §6 위반 = 코드 파일은 코드장, 주석은 사장님 승인 1줄만(양 상한 · 인접 미갱신 · 유령 참조):",
  );
  for (const h of cmt)
    console.error(
      `  ${h.path}:${h.line} [${h.id}] ${h.desc}${h.text ? `\n     → ${h.text}` : ""}`,
    );
  console.error(
    "\n해소: `node scripts/guard-no-old-artifacts.mjs --dry <경로>` 로 확인 후 `--fix <경로>` (승인 줄 최신 1개만 남김).\n",
  );
}
if (hard.length || cmt.length) process.exit(1);
process.exit(0);
