#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT = 커밋 전 의무 병렬 검증 = 기계 검증 코어 (§22)

import { spawn, execSync } from "node:child_process";

// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 타입 오류 기준선 = 35(지금 실제 건수) = 새 타입 오류 0건만 통과 (정본 9-27)
const TSC_BASELINE = 35;

// ⚠️ lint = "변경된(staged/작업트리) 파일만" 검사 (2026-07-19 사장님 SSOT).
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

const CHECKS = {
  tsc: {
    name: "tsc 타입체크",
    cmd: "npx",
    args: ["tsc", "--noEmit"],
    judge: (_code, out) => {
      const n = (out.match(/error TS/g) || []).length;
      return {
        pass: n <= TSC_BASELINE,
        detail: `에러 ${n}건 (베이스라인 ${TSC_BASELINE} 이하 = 통과)`,
      };
    },
  },
  // ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 기계 6종의 하나 = 컨테이너 타입검사 = 오류 0건만 통과 · 모든 모드에서 반드시 돈다 (§22)
  containerTsc: {
    name: "컨테이너 타입체크",
    cmd: "npx",
    args: ["tsc", "-p", "tsconfig.container.json"],
    judge: (code, out) => {
      const n = (out.match(/error TS/g) || []).length;
      return {
        pass: code === 0 && n === 0,
        detail: n === 0 ? "오류 0건" : `오류 ${n}건`,
      };
    },
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
    cmd: "npx",
    args: () => {
      const targets = changedLintTargets();
      return targets.length ? ["eslint", ...targets] : null; // null = 스킵
    },
    judge: (_code, out, skipped) => {
      if (skipped) return { pass: true, detail: "변경 파일 없음 = 스킵" };
      const m = out.match(/\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);
      const errs = m ? +m[1] : 0;
      const warns = m ? +m[2] : 0;
      return {
        pass: errs === 0,
        detail: errs === 0 ? `OK(오류0, 경고${warns})` : `오류 ${errs}건`,
      };
    },
  },
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 기계 5번째 = MIX 저장단계 스모크 = 실호출 전에 실제 DB·R2 경로(알아보는 문 SQL·저장 SQL·drizzle·raw 순번)를 밟아 본다(쓰기 0·유료 0) = 확률 게임 종료
  // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 기계 6번째 = 워커 번들(wrangler dry-run) = 후처리 큐·Browser Run 배선이 실제로 묶이는지(alias 껍데기 포함) 배포 없이 확인
  workerBundle: {
    name: "워커 번들(wrangler dry-run)",
    cmd: "npx",
    args: () => [
      "wrangler",
      "deploy",
      "--dry-run",
      "--outdir",
      `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/tripis-wrangler-dry`,
      "--containers-rollout=none",
      "--config",
      "worker/wrangler.jsonc",
    ],
    judge: (code, out) => ({
      pass: code === 0 && /dry-run|Total Upload/i.test(out),
      detail: code === 0 ? "OK" : "번들 실패",
    }),
  },
  mixSmoke: {
    name: "MIX 저장단계 스모크",
    cmd: "npx",
    args: ["tsx", "worker/lib/services/agents/mix-save-smoke.ts"],
    judge: (code, out) => ({
      pass: code === 0 && /스모크 통과/.test(out),
      detail: code === 0 ? "OK(실DB·R2, 쓰기0)" : "스모크 실패",
    }),
  },
};

let targets = Object.keys(CHECKS);
if (quick) targets = ["tsc", "containerTsc", "lint"];
if (feOnly) targets = ["tsc", "containerTsc", "webBuild", "lint"];

function run(key) {
  const c = CHECKS[key];
  return new Promise((resolve) => {
    const t0 = Date.now();
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
