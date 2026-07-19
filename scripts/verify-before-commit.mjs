#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT = 커밋 전 의무 병렬 검증 = 기계 검증 코어 (§22)
// = 기계 검증 4종(tsc·서버빌드·웹빌드·lint)을 자식프로세스로 "동시 실행"(병렬) → 전부 통과해야 exit 0.
// = 목적: FE(client/) 변경이 웹빌드·lint 깨져도 서버빌드만 보던 옛 hook 이 못 잡던 것 = 기계로 전수 방어(§0·§12·§17).
// = AI 판단 검증(simplify·code-review·react-best) = 쉘에서 서브에이전트 호출 불가 = Workflow(verify-workflow) 가 담당.
//   이 스크립트 = 그중 "기계로 확정 가능한 것"만 = hook 최후방어선 + Workflow 의 기계파트 재사용.
// 사용:
//   node scripts/verify-before-commit.mjs            = 4종 전부 병렬
//   node scripts/verify-before-commit.mjs --fe-only  = client/ 변경 시 관련만(웹빌드·lint·tsc)
//   node scripts/verify-before-commit.mjs --quick    = 빠른 것만(tsc·서버빌드·lint, 웹빌드 제외)

import { spawn, execSync } from "node:child_process";

// tsc 베이스라인 = SSOT §8-4 실측 = 커밋 시점마다 갱신될 수 있어 "현재 main 기준 대비 증가 0"이 진짜 기준.
// 여기선 절대 상한(BASELINE)으로 1차 방어 = 신규 대량에러 차단. 정밀 신규에러 판정은 Workflow tsc 에이전트가 담당.
const TSC_BASELINE = 161;

// ⚠️ lint = "변경된(staged/작업트리) 파일만" 검사 (2026-07-19 사장님 SSOT).
// = 레포 전체엔 CRLF·prettier 기존오류 수천개(scripts·대형파일) = 전체 lint 면 모든 커밋 영원차단.
// = tsc 베이스라인과 같은 실용원칙 = "내가 건드린 것만 깨끗하면 통과". staged 없으면 작업트리 변경파일.
function changedLintTargets() {
  try {
    const staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    const unstaged = execSync("git diff --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    const files = [...staged.split("\n"), ...unstaged.split("\n")]
      .map((f) => f.trim())
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
      .filter((f, i, a) => a.indexOf(f) === i); // dedup
    return files;
  } catch {
    return [];
  }
}

const args = process.argv.slice(2);
const feOnly = args.includes("--fe-only");
const quick = args.includes("--quick");

// 각 검증 = { name, cmd, args, judge(code, stdout) }
const CHECKS = {
  tsc: {
    name: "tsc 타입체크",
    cmd: "npx",
    args: ["tsc", "--noEmit"],
    // tsc 는 에러 있으면 exit 1 = code 로만 보면 베이스라인 161건 때문에 항상 실패.
    // → stdout 의 'error TS' 개수를 세서 베이스라인 이하면 통과(신규 대량에러만 차단).
    judge: (_code, out) => {
      const n = (out.match(/error TS/g) || []).length;
      return {
        pass: n <= TSC_BASELINE,
        detail: `에러 ${n}건 (베이스라인 ${TSC_BASELINE} 이하 = 통과)`,
      };
    },
  },
  serverBuild: {
    name: "서버빌드(esbuild)",
    cmd: "npm",
    args: ["run", "server:build"],
    judge: (code) => ({
      pass: code === 0,
      detail: code === 0 ? "OK" : "빌드 실패",
    }),
  },
  webBuild: {
    name: "웹빌드(expo export web)",
    cmd: "npx",
    args: ["expo", "export", "--platform", "web"],
    judge: (code, out) => ({
      pass: code === 0 && /Exported/.test(out),
      detail: code === 0 ? "Exported: dist" : "웹빌드 실패",
    }),
  },
  lint: {
    name: "lint(변경 파일만)",
    // ⚠️ 변경 파일만 eslint = 레포 전체 CRLF 지옥 회피(위 changedLintTargets). 변경 없으면 검사대상 0 = 통과.
    cmd: "npx",
    args: () => {
      const targets = changedLintTargets();
      return targets.length ? ["eslint", ...targets] : null; // null = 스킵
    },
    judge: (_code, out, skipped) => {
      if (skipped) return { pass: true, detail: "변경 파일 없음 = 스킵" };
      // ⚠️ exit code 로 판정 금지 = eslint 는 warning 만 있어도 exit 1 = 오탐. → 요약줄의 error 개수만 진실.
      // eslint 요약 = "✖ N problems (X errors, Y warnings)". error 0 = 통과(warning 은 커밋 차단 안 함, CRLF 근절 후 남은 건 unused 등 경고뿐).
      const m = out.match(/\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);
      const errs = m ? +m[1] : 0;
      const warns = m ? +m[2] : 0;
      return {
        pass: errs === 0,
        detail: errs === 0 ? `OK(오류0, 경고${warns})` : `오류 ${errs}건`,
      };
    },
  },
};

// 실행 대상 선택
let targets = Object.keys(CHECKS);
if (quick) targets = ["tsc", "serverBuild", "lint"];
if (feOnly) targets = ["tsc", "webBuild", "lint"];

function run(key) {
  const c = CHECKS[key];
  return new Promise((resolve) => {
    const t0 = Date.now();
    // args 가 함수면 동적 계산(예: lint = 변경파일 목록). null 반환 = 검사 스킵(통과).
    const cmdArgs = typeof c.args === "function" ? c.args() : c.args;
    if (cmdArgs === null) {
      const r = c.judge(0, "", true);
      return resolve({
        key,
        name: c.name,
        pass: r.pass,
        detail: r.detail,
        ms: 0,
      });
    }
    const p = spawn(c.cmd, cmdArgs, { shell: true, cwd: process.cwd() });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      const r = c.judge(code, out);
      resolve({
        key,
        name: c.name,
        pass: r.pass,
        detail: r.detail,
        ms: Date.now() - t0,
      });
    });
    p.on("error", (e) =>
      resolve({
        key,
        name: c.name,
        pass: false,
        detail: `실행오류: ${e.message}`,
        ms: Date.now() - t0,
      }),
    );
  });
}

(async () => {
  console.log(`\n[verify] 기계 검증 병렬 실행 = ${targets.join(", ")}\n`);
  const results = await Promise.all(targets.map(run)); // ← 병렬(동시 실행)

  console.log("┌─ 결과 ───────────────────────────────────────");
  for (const r of results) {
    const mark = r.pass ? "✅" : "🔴";
    console.log(
      `│ ${mark} ${r.name.padEnd(26)} ${(r.ms / 1000).toFixed(1)}s  ${r.detail}`,
    );
  }
  console.log("└──────────────────────────────────────────────");

  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.error(
      `\n🔴 기계 검증 실패 ${failed.length}건 = 커밋 불가. Ralph-loop 로 통과까지 보완.\n`,
    );
    process.exit(1);
  }
  console.log(`\n✅ 기계 검증 ${results.length}종 전부 통과.\n`);
  process.exit(0);
})();
