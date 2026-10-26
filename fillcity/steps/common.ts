// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { reportDirOf } from "../../worker/lib/services/shared/local-paths";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import os from "os";
import { spawn } from "child_process";
import { foldAccents } from "../../worker/lib/services/shared/text-fold";
import { fileStamp } from "../../shared/r2-paths";
import { latestVersioned } from "../../worker/lib/services/shared/raw-filename";

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

export function isLodgingPage(raw: string): boolean {
  if (!HOTEL_WIDGET.test(raw.slice(0, 3000))) return false;
  const head = raw.slice(0, 500);
  return (
    LODGING_LABEL.test(pageLabel(raw)) || LODGING_LABEL.test(head.slice(0, 160))
  );
}

export function roomRateEur(raw: string): number | null {
  const m = raw.slice(0, 700).match(/€\s?([0-9][0-9,.]*)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
export const AGENT_WORKERS = 4;

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

function runClaudeAgent(
  prompt: string,
  outFile: string,
  readDb = false,
): Promise<number> {
  return new Promise((resolve) => {
    let mcpConfig = path.join(
      ROOT,
      "fillcity/prompts/04-classify-agent/browser-mcp.json",
    );
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
  verdict:
    | "inserted"
    | "rejected"
    | "worker-inserted"
    | "worker-absorbed"
    | "not-found";
  rowId?: number | null;
  cid?: string | null;
  tier?: "T1" | "T2" | null;
  why?: string;
  pageName?: string | null;
  at: string;
  entry?: any; // 거부된 곳의 제미니 힌트(NewEntry 그대로)
  round?: 1 | 2; // 못 찾음 결론을 낸 찾기 차수
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

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 산출표 두 구역(볼거리·식당)의 확인·신규 항목 펼치기 1벌 (정본 §2026-10-23)
export const DIFF_SECTIONS = ["landmarks", "restaurants"] as const;
export const diffSectionItems = (report: any, section: string): any[] => [
  ...(report?.[section]?.confirm ?? []),
  ...(report?.[section]?.new ?? []),
];

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

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 사람 인증 대기 1벌(엔진 단계·일꾼 단계 공용) = 구글이 막혀 있으면 전용 크롬을 앞으로 띄워 인증 화면을 보여 주고 알림 → 풀릴 때까지 30초마다 그 창을 본다(사람 인증 화면은 새로 고치지 않음 = 풀던 인증이 지워지지 않게 · 제한 보기 화면만 1분마다 새로 고침) → 풀리면 돌아가 같은 자리에서 이어 돈다 · 막혀 있지 않으면 바로 돌아간다 · 브라우저는 구글맵 읽기와 같은 launchBrowser 1벌(전용 크롬 GMAPS_CDP) = 전용 크롬 없이 도는 판은 사람이 풀 화면이 없으므로 기다리지 않는다 (정본 §2026-10-23)
export async function waitHumanCleared(label: string): Promise<boolean> {
  const { chromium } = await import("playwright");
  const { LIMITED_VIEW_RE, launchBrowser, openWindow, showWindow } =
    await import(
      "../../worker/lib/services/fill/gmaps-pid-identity/page-reader"
    );
  if (!process.env.GMAPS_CDP) {
    console.error(
      `⛔ ${label} = 전용 크롬(GMAPS_CDP) 없이 도는 판 = 사람 인증을 풀 화면이 없다 = scripts/fillcity-run.mjs 로 돌린다`,
    );
    return false;
  }
  const browser = await launchBrowser(chromium);
  const win = await openWindow(browser).catch(async (e: any) => {
    console.error(
      `  ⚠️ ${label} = 인증 확인 창을 못 열었다(${String(e?.message || e).slice(0, 80)}) = 그대로 다시 돈다`,
    );
    await browser.close().catch(() => {});
    return null;
  });
  if (!win) return false;
  const page = win.page;
  const SORRY_RE = /google\.[a-z.]+\/sorry\//;
  const blocked = async () =>
    SORRY_RE.test(page.url()) ||
    LIMITED_VIEW_RE.test(
      await page
        .locator("body")
        .innerText({ timeout: 5000 })
        .catch(() => ""),
    );
  let held = false;
  try {
    for (const url of [
      "https://www.google.com/search?q=weather&hl=en",
      "https://www.google.com/maps/search/restaurant?hl=en",
    ]) {
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(3000);
      let waited = 0;
      while (await blocked()) {
        held = true;
        if (waited % 300 === 0) {
          await showWindow(page);
          console.error(
            `⛔ 사람 인증 필요 — ${label} = 전용 크롬을 화면 앞에 띄웠다 = 인증을 풀어 주시면 그 자리에서 이어서 돈다(기다린 지 ${Math.round(waited / 60)}분)`,
          );
          notifyHuman(
            "필시티: 구글 사람 인증 필요",
            `${label} — 화면 앞에 띄운 전용 크롬에서 "로봇이 아닙니다"를 풀어 주세요. 풀면 그 자리에서 이어서 돕니다.`,
          );
        }
        await page.waitForTimeout(30_000);
        waited += 30;
        if (!SORRY_RE.test(page.url()) && waited % 60 === 0)
          await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }
    if (held) console.log(`✅ 사람 인증 풀림 — ${label} = 이어서 돈다`);
    return held;
  } finally {
    await win.close();
    await browser.close().catch(() => {});
  }
}

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

// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 헌법 1벌(fillcity/prompts/00-constitution.txt) = 모든 일꾼 지시문 맨 앞에 붙는다 · 읽었는가 = {"읽음": true|false} 하나뿐 · false 거나 없으면 결과를 받지 않는다 · true 인데 지시문대로 하지 않은 결과는 검문이 버린다 (정본 §2026-10-24)
const CONSTITUTION_FILE = path.join(
  ROOT,
  "fillcity/prompts/00-constitution.txt",
);
const normText = (s: string) => s.replace(/\r\n/g, "\n").trim();
export const constitution = () =>
  normText(fs.readFileSync(CONSTITUTION_FILE, "utf-8"));
export const BOKMYEONG_FORMAT = `{"읽음": true}`;
export function bokmyeongOk(file: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"))?.["읽음"] === true;
  } catch {
    return false;
  }
}

// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 일꾼 띄우기 1벌 = 몫마다 동시에, 결과 파일이 없거나 읽음({"읽음": true})이 없으면 한 번 더(최대 2번) · 검토·정제·분류·찾기·최종 점검 다섯 단계가 전부 이것을 부른다 (정본 §2026-10-24)
type AgentRange = { k: number; from: number; to: number };
export async function runAgents(a: {
  label: string;
  instruction: string;
  ranges: AgentRange[];
  promptOf: (j: AgentRange) => string;
  doneOf: (j: AgentRange) => boolean;
  dir: string;
  readDb?: boolean;
}): Promise<{ k: number; ok: boolean }[]> {
  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 일꾼이 전용 크롬에 연 탭은 일꾼이 끝나면 필시티가 닫는다(일꾼 단계 시작 때 없던 탭만) = 묵은 탭이 쌓여 크롬이 멈추던 것(92번 첫 판 · 64번 탭 15개) (정본 §2026-10-24)
  const before = new Set((await cdpPages()).map((t) => t.id));
  try {
    return await runAgentJobs(a);
  } finally {
    for (const t of await cdpPages())
      if (!before.has(t.id))
        await fetch(`${process.env.GMAPS_CDP}/json/close/${t.id}`).catch(
          () => {},
        );
  }
}
const cdpPages = async (): Promise<{ id: string }[]> => {
  if (!process.env.GMAPS_CDP) return [];
  const list: any[] = await fetch(`${process.env.GMAPS_CDP}/json/list`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.json())
    .catch(() => []);
  return list.filter((t) => t?.type === "page");
};
function runAgentJobs(a: {
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
      let sworn = false;
      const bok = path.join(a.dir, `bokmyeong-${a.label}-${j.k}.json`);
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        fs.rmSync(bok, { force: true });
        const code = await runClaudeAgent(
          `${constitution()}\n\n${a.instruction} 를 처음부터 끝까지 읽는다. 다 읽었으면 ${bok} 에 ${BOKMYEONG_FORMAT} 를 Write 로 쓴다(읽지 않았으면 {"읽음": false} = 네 결과는 받지 않는다). 읽은 지시문 그대로만 일하라 = 읽었다고 쓰고 지시문과 다르게 한 결과는 검문이 버린다.\n\n${a.promptOf(j)}`,
          path.join(a.dir, `${a.label}-${j.k}-report.txt`),
          a.readDb,
        );
        sworn = bokmyeongOk(bok);
        ok = code === 0 && a.doneOf(j) && sworn;
        console.log(
          `  ${ok ? "✅" : "⚠️"} ${a.label} 일꾼 ${j.k}/${a.ranges.length} (순서 ${j.from}~${j.to}) 종료 ${code} · ${Math.round((Date.now() - t0) / 1000)}초${sworn ? "" : " · 읽음 없음"}${ok ? "" : attempt === 0 ? " = 한 번 더" : ""}`,
        );
      }
      if (!sworn)
        throw new Error(
          `${a.label} 일꾼 ${j.k} = 두 번 다 지시문을 읽었다는 답({"읽음": true})이 없다 = 이 단계는 진행하지 않는다(${bok})`,
        );
      return { k: j.k, ok };
    }),
  );
}

export function reportDir(cityId: number): string {
  const dir = reportDirOf(cityId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 최신 보고서 고르기 1벌 = 그 도시 보고 폴더의 {시각}_{이름}.json 중 가장 나중(같은 이름이면 가장 큰 버전 번호) · 산출표는 b1-discovery-diff 이름만 읽는다(2026-09-08) · 읽기만 = 폴더를 만들지 않는다 (정본 §2026-10-23)
export function latestReport(
  cityId: number,
  suffix: string,
  keep: (file: string) => boolean = () => true,
): string | null {
  const dir = reportDirOf(cityId);
  if (!fs.existsSync(dir)) return null;
  const re = new RegExp(`_${suffix}(_\\d+)?\\.json$`);
  const files = fs.readdirSync(dir).filter((f) => re.test(f) && keep(f));
  if (!files.length) return null;
  const latestFile = files.sort().reverse()[0];
  const stem = latestFile.replace(/_\d+\.json$/, ".json");
  return path.join(dir, latestVersioned(dir, stem) || latestFile);
}

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
