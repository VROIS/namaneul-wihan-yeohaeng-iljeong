// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import os from "os";
import { spawn } from "child_process";
import { foldAccents } from "../../worker/lib/services/shared/text-fold";
import { fileStamp } from "../../shared/r2-paths";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function loadEnv() {
  process.chdir(ROOT);
  for (const line of fs
    .readFileSync(".env", "utf-8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

export function parseArgs(): Record<string, string> {
  return Object.fromEntries(
    process.argv
      .slice(2)
      .map((a) => a.replace(/^--/, "").split("="))
      .map(([k, ...v]) => [k, v.length ? v.join("=") : "true"]),
  );
}

export async function connectDb() {
  const req = createRequire(path.join(ROOT, "package.json"));
  const pg = req("pg");
  const c = new pg.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

/** 도시 폴더의 구글맵 읽기 로그 = 행마다 가장 나중 것만(구글 값의 유일한 증거). */
export function lastGoogleLogs(cityId: number): Map<number, any> {
  const dir = path.join(ROOT, "docs", "raw", String(cityId));
  const out = new Map<number, any>();
  if (!fs.existsSync(dir)) return out;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.includes("_gmaps-page-read-") && f.endsWith(".json"))
    .sort();
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"))?.raw
      ?.rows;
    for (const r of rows ?? []) out.set(Number(r.id), r);
  }
  return out;
}

/** 구글 페이지 글 맨 앞의 분류 글자(별점 괄호 뒤 첫 가운뎃점 사이). */
export function pageLabel(raw: string): string {
  const t = raw.slice(0, 500).split(/\s+/).join(" ");
  const i = t.indexOf("·");
  if (i < 0) return "";
  const j = t.indexOf("·", i + 1);
  return t.slice(i + 1, j < 0 ? i + 40 : j).trim();
}

const HOTEL_WIDGET =
  /Check availability|Check in \/ Check out|Hotel details|Hotel class/i;
const LODGING_LABEL =
  /hotel|hostel|lodge|resort|bed & breakfast|\binn\b|guest ?house|motel|residence|villa|apart/i;

/** 숙박 위젯이 붙었고 분류 글자도 숙소류면 호텔 페이지(식당 글자에 숙박 위젯만 붙은 곳은 아님). */
export function isLodgingPage(raw: string): boolean {
  if (!HOTEL_WIDGET.test(raw.slice(0, 3000))) return false;
  const head = raw.slice(0, 500);
  return (
    LODGING_LABEL.test(pageLabel(raw)) || LODGING_LABEL.test(head.slice(0, 160))
  );
}

/** 호텔 페이지 로그 글 맨 위의 객실 요금(€) = 파서 가격 칸에는 없다. */
export function roomRateEur(raw: string): number | null {
  const m = raw.slice(0, 700).match(/€\s?([0-9][0-9,.]*)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
export const AGENT_WORKERS = 4;

/** 순서 0..total-1 을 workers 명이 똑같이 나눈 [from, to](끝 포함) 목록. 빈 몫은 만들지 않는다. */
export function shareRanges(
  total: number,
  workers = AGENT_WORKERS,
): { k: number; from: number; to: number }[] {
  const per = Math.ceil(total / workers);
  return Array.from({ length: Math.min(workers, total) }, (_, i) => ({
    k: i + 1,
    from: i * per,
    to: Math.min(total - 1, (i + 1) * per - 1),
  })).filter((j) => j.from <= j.to);
}

/** 동료 에이전트 1명을 `claude -p` 로 띄운다 = 각자 격리된 브라우저(browser-mcp.json) · 출력은 outFile 에 저장. */
export function runClaudeAgent(
  prompt: string,
  outFile: string,
  readDb = false,
): Promise<number> {
  return new Promise((resolve) => {
    // 읽기 전용 DB = 실행할 때만 저장소 밖(임시 폴더)에 설정을 만들고 끝나면 지운다(비밀번호가 저장소에 남지 않는다)
    let mcpConfig = path.join(
      ROOT,
      "fillcity/prompts/04-classify-agent/browser-mcp.json",
    );
    // 일꾼은 프로젝트 폴더가 아닌 빈 폴더에서 띄운다(프로젝트 CLAUDE.md 가 일꾼에게 딸려 들어가지 않게) · 프로젝트 폴더는 --add-dir 로 연다
    const workCwd = path.join(os.tmpdir(), "fillcity-agent-cwd");
    fs.mkdirSync(workCwd, { recursive: true });
    if (readDb) {
      const cfg = JSON.parse(fs.readFileSync(mcpConfig, "utf-8"));
      cfg.mcpServers.pgread = {
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-postgres",
          String(process.env.SUPA_URL || process.env.DATABASE_URL),
        ],
      };
      mcpConfig = path.join(
        os.tmpdir(),
        `fillcity-mcp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
      );
      fs.writeFileSync(mcpConfig, JSON.stringify(cfg));
    }
    const child = spawn(
      "claude",
      [
        "-p",
        "--strict-mcp-config",
        "--mcp-config",
        `"${mcpConfig}"`,
        "--add-dir",
        `"${ROOT}"`,
        "--allowedTools",
        readDb
          ? "Read,Write,Glob,Grep,mcp__agentbrowser,mcp__pgread"
          : "Read,Write,Glob,Grep,mcp__agentbrowser",
        "--model",
        "claude-sonnet-5-5",
        "--effort",
        "high",
      ],
      { cwd: workCwd, shell: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => out.push(d));
    child.on("close", (code) => {
      if (readDb) fs.rmSync(mcpConfig, { force: true });
      fs.writeFileSync(outFile, Buffer.concat(out));
      resolve(code ?? 1);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ④ 판정 장부 1벌 = docs/b1-reports/{도시}/insert-ledger.json (넣음·거부 · 거부는 제미니 힌트를 통째로 들고 일꾼 명단이 된다) (정본 §)
export type LedgerEntry = {
  name: string;
  cat: string;
  langs: number;
  verdict: "inserted" | "rejected" | "worker-inserted" | "worker-absorbed";
  rowId?: number | null;
  cid?: string | null;
  tier?: "T1" | "T2" | null;
  why?: string;
  pageName?: string | null;
  at: string;
  entry?: any; // 거부된 곳의 제미니 힌트(NewEntry 그대로)
};
export type Ledger = Record<string, LedgerEntry>;
export const ledgerKey = (n: { name: string; cat: string }) =>
  `${n.cat}|${String(n.name).trim().toLowerCase()}`;
export const ledgerPath = (cityId: number) =>
  path.join(reportDir(cityId), "insert-ledger.json");
export function readLedger(cityId: number): Ledger {
  const p = ledgerPath(cityId);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {};
}

// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 구글 사람 인증이 뜨면 이 PC 에 알림(윈도우 토스트 + 소리) = 사장님이 다른 일을 하고 있어도 안다 (정본 §)
export function notifyHuman(title: string, message: string): void {
  const esc = (s: string) => s.replace(/'/g, "''");
  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
    "$x = $t.GetElementsByTagName('text')",
    `$x.Item(0).AppendChild($t.CreateTextNode('${esc(title)}')) | Out-Null`,
    `$x.Item(1).AppendChild($t.CreateTextNode('${esc(message)}')) | Out-Null`,
    "$n = [Windows.UI.Notifications.ToastNotification]::new($t)",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($n)",
    "1..3 | ForEach-Object { [console]::beep(1000, 400); Start-Sleep -Milliseconds 150 }",
  ].join("; ");
  try {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { stdio: "ignore", windowsHide: true },
    );
    child.on("error", () => {});
  } catch {
    return;
  }
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 시각 글자(YYYY-MM-DD_HHMMSS, 세계시) = 프로젝트 1벌 shared/r2-paths fileStamp 를 쓴다(본체·깔때기·단계 전부) · 이미 시각 글자인 입력은 그대로 돌려준다(깔때기 기본값 = 파일 이름 앞 17자) (정본 §)
export const stampOf = (s: string): string =>
  /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(s) ? s : fileStamp(new Date(s));
export const stamp = (): string => fileStamp();

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 종료 코드 3 = 구글맵 제한 보기(사람 인증) = 지운 것 없이 멈춘다 = 본체가 알림 → 기다림 → 같은 단계 재실행 · 상수는 여기 1벌 (정본 §)
export const EXIT_LIMITED = 3;

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 동시 호출 뒤 실패한 몫 되살리기 1벌(발굴 7언어·2차 4분할) = 몫마다 recover(저장된 응답이 있으면 그것으로, 없으면 그 몫만 한 번 더) → 끝내 실패한 몫 목록 (정본 §)
export async function retryFailed<K>(
  items: K[],
  codes: number[],
  recover: (k: K) => Promise<boolean>,
): Promise<K[]> {
  const still: K[] = [];
  for (const [i, k] of items.entries())
    if (codes[i] !== 0 && !(await recover(k))) still.push(k);
  return still;
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 단계 스크립트 실행(npx tsx → 종료 코드) 1벌 = 본체·발굴·2차 호출이 같이 쓴다 · onLine 을 주면 출력을 한 줄씩 받고, 없으면 화면에 그대로 (정본 §)
export function runTsx(
  script: string,
  args: string[],
  onLine?: (line: string) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["tsx", script, ...args],
      onLine
        ? { shell: true, stdio: ["ignore", "pipe", "pipe"] }
        : { shell: true, stdio: "inherit" },
    );
    if (onLine) {
      const tag = (d: Buffer) =>
        String(d).split(/\r?\n/).filter(Boolean).forEach(onLine);
      child.stdout?.on("data", tag);
      child.stderr?.on("data", tag);
    }
    child.on("close", (code) => resolve(code ?? 1));
  });
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 일꾼 띄우기 1벌 = 몫마다 동시에, 결과 파일이 없으면 한 번 더(최대 2번) · 검토·정제·분류·찾기·최종 점검 다섯 단계가 전부 이것을 부른다 (정본 §)
export type AgentRange = { k: number; from: number; to: number };
export async function runAgents(a: {
  label: string;
  instruction: string;
  ranges: AgentRange[];
  promptOf: (j: AgentRange) => string;
  doneOf: (j: AgentRange) => boolean;
  dir: string;
  readDb?: boolean;
}): Promise<{ k: number; ok: boolean }[]> {
  return Promise.all(
    a.ranges.map(async (j) => {
      const t0 = Date.now();
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        const code = await runClaudeAgent(
          `${a.instruction} 를 처음부터 끝까지 읽고, 그 지시문대로 일하라.\n\n${a.promptOf(j)}`,
          path.join(a.dir, `${a.label}-${j.k}-report.txt`),
          a.readDb,
        );
        ok = code === 0 && a.doneOf(j);
        console.log(
          `  ${ok ? "✅" : "⚠️"} ${a.label} 일꾼 ${j.k}/${a.ranges.length} (순서 ${j.from}~${j.to}) 종료 ${code} · ${Math.round((Date.now() - t0) / 1000)}초${ok ? "" : attempt === 0 ? " = 한 번 더" : ""}`,
        );
      }
      return { k: j.k, ok };
    }),
  );
}

export function reportDir(cityId: number): string {
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function latestReport(cityId: number, suffix: string): string | null {
  const dir = reportDir(cityId);
  const f = fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(`_${suffix}.json`))
    .sort()
    .pop();
  return f ? path.join(dir, f) : null;
}

/** 장소명을 비교용 낱말로(악센트·기호 제거, 흔한 말 제외). */
export function nameTokens(s: string | null | undefined): string[] {
  return foldAccents(String(s || ""))
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          "the",
          "restaurant",
          "hotel",
          "cafe",
          "bar",
          "and",
          "der",
          "die",
          "das",
          "les",
          "los",
          "las",
          "del",
          "della",
          "de",
          "la",
          "le",
          "el",
          "museum",
          "park",
        ].includes(w),
    );
}
