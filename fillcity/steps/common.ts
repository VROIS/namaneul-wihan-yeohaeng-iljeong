// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 읽은 뒤 단계(탐지·에이전트 명단·에이전트 실행·제미니 후보·검수)가 같이 쓰는 공통 1벌 = 환경·인자·DB·구글맵 로그 읽기·호텔 페이지 판별·에이전트 조 크기와 동시 수 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

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

/** 에이전트 한 명 몫(건)과 동시에 투입하는 수 = 사장님 결정 10건씩 3명. */
export const AGENT_CHUNK = 10;
export const AGENT_PARALLEL = 3;

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
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
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
