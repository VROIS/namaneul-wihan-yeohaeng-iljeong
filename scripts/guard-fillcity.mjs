#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 필시티 실행 스위치 = 사장님이 입력한 `/fillcity <도시번호>` 한 줄(유료 외부 호출 승인 포함) · 실행 중 필시티 코드 동결 · 산출물 없으면 끝났다 못 함 (정본 §)
import fs from "node:fs";
import path from "node:path";

const ROOT = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replaceAll(
  "\\",
  "/",
);
const TOKEN = path.join(ROOT, ".claude", "fillcity-approval.json");
const RUN = path.join(ROOT, ".claude", "fillcity-run.json");
const mode = process.argv[2];
const HOURS = 12;

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch (e) {
  console.error(
    `[guard-fillcity] 입력 읽기 실패(차단 안 함) = ${e?.message || e}`,
  );
  process.exit(0);
}
const deny = (reason) => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `⛔ 필시티 가드 = ${reason}`,
      },
    }),
  );
  process.exit(0);
};

// ── 사장님이 입력한 `/fillcity <도시번호>` 만 승인 표시를 만든다(AI 는 프롬프트를 제출할 수 없다)
if (mode === "prompt") {
  const m = /^\s*\/fillcity\s+(\d+)\s*$/.exec(String(input.prompt || ""));
  if (m) {
    fs.writeFileSync(
      TOKEN,
      JSON.stringify({
        city: Number(m[1]),
        until: Date.now() + HOURS * 3600e3,
      }),
    );
  }
  process.exit(0);
}

const running = () => {
  const r = readJson(RUN);
  return r && r.stage === "running" && Date.now() - r.startedAt < 24 * 3600e3;
};

if (mode === "tool") {
  const t = input.tool_name || "";
  const ti = input.tool_input || {};
  // 가드·승인 표시·훅 설정 = 항상 보호 / 실행 중 = 필시티 코드 동결
  const ALWAYS = [
    "scripts/guard-fillcity.mjs",
    "scripts/fillcity-run.mjs",
    ".claude/commands/fillcity.md",
    ".claude/fillcity-approval.json",
    ".claude/fillcity-run.json",
    ".claude/settings.json",
    ".claude/settings.local.json",
  ];
  const FROZEN = ["fillcity/", "worker/lib/services/fill/"];
  const rel = (p) =>
    String(p || "")
      .replaceAll("\\", "/")
      .replace(ROOT + "/", "")
      .replace(/^\.\//, "");
  if (/^(Edit|Write|NotebookEdit)$/.test(t)) {
    const f = rel(ti.file_path || ti.notebook_path);
    if (ALWAYS.includes(f))
      deny(`${f} 는 가드 파일 = AI 가 고치지 못한다(사장님이 직접).`);
    if (running() && FROZEN.some((d) => f.startsWith(d)))
      deny(`필시티 실행 중 = ${f} 동결(끝난 뒤 사장님 지시로).`);
    process.exit(0);
  }
  if (/^(Bash|PowerShell)$/.test(t)) {
    const c = String(ti.command || "").replaceAll("\\", "/");
    const WRITE =
      /(>|\btee\b|\bsed\s+-i|\bmv\b|\brm\b|\bcp\b|\bgit\s+(checkout|restore|reset|apply)\b|Set-Content|Out-File|Remove-Item)/;
    if (WRITE.test(c) && ALWAYS.some((p) => c.includes(p)))
      deny("가드 파일·승인 표시·훅 설정을 셸로 바꾸려 했다.");
    if (running() && WRITE.test(c) && FROZEN.some((d) => c.includes(d)))
      deny("필시티 실행 중 = 필시티 코드 동결.");
    const paid =
      /fillcity-run\.mjs|agent-run/.test(c) ||
      (/fill-city-v3/.test(c) && /--(auto|discover|gemini)\b/.test(c));
    if (paid) {
      const tok = readJson(TOKEN);
      const want =
        /fillcity-run\.mjs\s+(\d+)/.exec(c) || /--city-id=(\d+)/.exec(c);
      if (!tok || tok.until < Date.now())
        deny(
          "유료 외부 호출 = 사장님이 `/fillcity <도시번호>` 를 입력한 턴에만 열린다.",
        );
      if (want && Number(want[1]) !== tok.city)
        deny(`승인은 도시 ${tok.city} 만 열려 있다(요청 ${want[1]}).`);
    }
  }
  process.exit(0);
}

// ── 끝났다고 말하기 전에 산출물(전·후 상태표 + 종료 코드)이 있어야 한다
if (mode === "stop") {
  if (input.stop_hook_active) process.exit(0);
  const r = readJson(RUN);
  if (!r || r.stage !== "finished" || r.acked) process.exit(0);
  const miss = [];
  if (!r.baseline || !fs.existsSync(r.baseline))
    miss.push("실행 전 상태표(baseline)");
  if (!r.after || !fs.existsSync(r.after)) miss.push("실행 후 상태표(after)");
  if (typeof r.exit !== "number") miss.push("종료 코드");
  if (miss.length) {
    console.log(
      JSON.stringify({
        decision: "block",
        reason: `필시티 산출물 없음 = ${miss.join(" · ")}. 끝났다고 하지 말고 사장님께 그대로 보고하라.`,
      }),
    );
    process.exit(0);
  }
  r.acked = true;
  fs.writeFileSync(RUN, JSON.stringify(r));
  process.exit(0);
}
process.exit(0);
