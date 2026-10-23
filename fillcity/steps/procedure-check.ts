// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 지시문 = 코드 = 일꾼(04 분류·06 최종 점검·07 못 찾은 베스트)·최종 검수가 판단 순서(로그 → 답 없으면 구글 검색 → 힌트로 구글맵)를 지켰는지 기계가 검문한다 · 애매 금지 · 했다고 쓴 검색·페이지는 전용 크롬(9333) 방문 기록과 대조 · 구글맵은 그 CID 또는 특정 장소·검색 주소 방문만 인정 · 크롬 기록 저장 지연(실측 11초)만큼 기다린 뒤 검문 · 통과 못 한 행은 결과로 받지 않는다 (정본 §2026-10-23)
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { AGENT_WORKERS } from "./common";

const CHROME_PROFILE = "C:/Users/hzino/fillcity-chrome";

export type Visit = { url: string; t: number };

/** 전용 크롬 방문 기록(초 단위 세계시) = 프로필의 History 를 복사해 읽는다(크롬이 켜져 있어도 읽힘). */
export function chromeVisits(fromMs: number, toMs: number): Visit[] {
  const src = path.join(CHROME_PROFILE, "Default", "History");
  if (!fs.existsSync(src)) return [];
  const copy = path.join(os.tmpdir(), `fillcity-history-${process.pid}.db`);
  fs.copyFileSync(src, copy);
  const code = `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);const r=db.prepare('SELECT u.url AS url, CAST(v.visit_time/1000000 - 11644473600 AS INTEGER) AS t FROM visits v JOIN urls u ON u.id=v.url WHERE v.visit_time/1000000 - 11644473600 BETWEEN ? AND ? ORDER BY v.visit_time').all(Number(process.argv[2]),Number(process.argv[3]));process.stdout.write(JSON.stringify(r));`;
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-sqlite",
      "--no-warnings",
      "-e",
      code,
      copy,
      String(Math.floor(fromMs / 1000)),
      String(Math.ceil(toMs / 1000)),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  fs.rmSync(copy, { force: true });
  if (r.status !== 0) throw new Error(`크롬 방문 기록 읽기 실패: ${r.stderr}`);
  return JSON.parse(r.stdout || "[]");
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const queryOf = (url: string): string | null => {
  const m = /google\.[a-z.]+\/search\?(?:.*&)?q=([^&#]+)/.exec(url);
  if (!m) return null;
  try {
    return norm(decodeURIComponent(m[1].replace(/\+/g, " ")));
  } catch {
    return null;
  }
};
const cidHex = (cid: string): string => {
  try {
    return BigInt(cid).toString(16);
  } catch {
    return "";
  }
};

/** 구글 검색 = 그 질문으로 연 검색 페이지의 방문 시각(없으면 null). */
export function searchedAt(visits: Visit[], q: string): number | null {
  const want = norm(q);
  const hit = visits.find((v) => queryOf(v.url) === want);
  return hit ? hit.t : null;
}

/** 구글맵 = 그 CID 페이지(주소에 cid=번호 또는 :0x16진수) 또는 주소창에 적은 특정 장소·검색 url 의 방문 시각(없으면 null). 구글맵 첫 화면 같은 짧은 주소는 인정하지 않는다. */
export function mapsAt(
  visits: Visit[],
  url: string,
  cid: string | null,
  after: number | null = null,
): number | null {
  const hex = cid ? cidHex(cid) : "";
  const u = norm(url);
  const specific = /\/maps\/(place|search)\/[^/?#]+|[?&]cid=\d+/.test(u);
  const hit = visits.find((v) => {
    if (after != null && v.t < after) return false;
    const x = v.url.toLowerCase();
    if (!/google\.[a-z.]+\/maps|maps\.google\./.test(x)) return false;
    if (cid && (x.includes(`cid=${cid}`) || (hex && x.includes(`:0x${hex}`))))
      return true;
    return specific && (x === u || x.startsWith(u));
  });
  return hit ? hit.t : null;
}

/** 크롬은 방문 기록을 약 10초마다 몰아 저장한다(실측 11초) = 검문 직전에 이만큼 기다린 뒤 읽는다. */
export const waitHistory = (): Promise<void> =>
  new Promise((r) => setTimeout(r, 15_000));

/** 그 행의 마지막 페이지 읽기(page-reader)가 머리줄·1인 가격을 읽었는가 = 구글 로그 priceState. */
export const pagePriceOf = (g: any): boolean =>
  g?.priceState?.headerPrice === "있음" || g?.priceState?.perPerson === "있음";

const PRICE_Q = /식대|1인|price|per person|cost|menu|가격/i;

/** 판정 한 행 검문(최종 점검 06 · 일꾼 분류 04) = 위반 이유 목록(빈 목록 = 통과). priceSearch = 페이지 읽기(page-reader)가 1인 가격을 못 읽은 식당은 1인 식대 검색을 요구(06 만). */
export function checkCheckRow(
  v: any,
  row: { cid: string; seed_category: string; pagePrice: boolean },
  visits: Visit[],
  priceSearch = true,
): string[] {
  const bad: string[] = [];
  if (/애매/.test(JSON.stringify(v ?? {})))
    bad.push("'애매'는 없다 = 확정해야 한다");
  if (typeof v?.reason !== "string" || v.reason.trim().length < 8)
    bad.push("reason = 모든 행 8자 이상(짝 맞음이면 무엇이 맞는지 한 줄)");
  const s = v?.["단계"];
  if (!s || typeof s !== "object")
    return [...bad, "단계 칸이 없다(로그 → 구글 검색 → 구글맵)"];
  if (typeof s["로그"] !== "string" || s["로그"].trim().length < 10)
    bad.push("단계.로그 = 로그에서 읽은 사실 원문 10자 이상");
  if (typeof s["로그로_답"] !== "boolean")
    bad.push("단계.로그로_답 = true/false");
  const g = s["구글검색"];
  const m = s["구글맵"];
  const priceAsk =
    priceSearch && row.seed_category === "restaurant" && !row.pagePrice;
  const needSearch = s["로그로_답"] === false || priceAsk;
  let gAt: number | null = null;
  if (needSearch) {
    if (!g || typeof g["질문"] !== "string" || !g["질문"].trim())
      bad.push(
        s["로그로_답"] === false
          ? "로그로 답이 안 나왔는데 구글 검색이 없다"
          : "머리줄 가격 없는 식당인데 1인 식대 구글 검색이 없다",
      );
    else {
      if (typeof g["힌트"] !== "string" || g["힌트"].trim().length < 20)
        bad.push("구글검색.힌트 = 받은 글 원문 20자 이상");
      if (priceAsk && !PRICE_Q.test(g["질문"]))
        bad.push("머리줄 가격 없는 식당 = 질문에 1인 식대를 묻는다");
      gAt = searchedAt(visits, g["질문"]);
      if (gAt == null)
        bad.push(`구글 검색 "${g["질문"]}" 이 크롬 방문 기록에 없다`);
    }
  }
  if (s["로그로_답"] === false) {
    if (
      !m ||
      typeof m.url !== "string" ||
      typeof m.h1 !== "string" ||
      typeof m.seen !== "string" ||
      m.seen.trim().length < 10
    )
      bad.push("로그로 답이 안 나왔는데 구글맵(url·h1·seen 10자) 이 없다");
    else {
      const mAt = mapsAt(visits, m.url, row.cid);
      if (mAt == null) bad.push(`구글맵 "${m.url}" 이 크롬 방문 기록에 없다`);
      else if (gAt != null && mapsAt(visits, m.url, row.cid, gAt) == null)
        bad.push("순서 위반 = 구글 검색 뒤에 연 구글맵이 없다");
    }
  }
  return bad;
}

/** 못 찾은 베스트(07) 항목 검문 = 제미니 힌트 → 구글 검색 → 구글맵 · 찾았다는 cid 의 페이지를 검색 뒤에 실제로 열었는가. */
export function checkFindItem(v: any, visits: Visit[]): string[] {
  const bad: string[] = [];
  if (/애매/.test(JSON.stringify(v ?? {})))
    bad.push("'애매'는 없다 = 확정해야 한다");
  if (typeof v?.note !== "string" || v.note.trim().length < 8)
    bad.push("note = 모든 항목 8자 이상");
  const s = v?.["단계"];
  if (!s || typeof s !== "object")
    return [...bad, "단계 칸이 없다(제미니 힌트 → 구글 검색 → 구글맵)"];
  if (typeof s["로그"] !== "string" || s["로그"].trim().length < 10)
    bad.push("단계.로그 = 읽은 제미니 힌트 원문 10자 이상");
  const g = s["구글검색"];
  const m = s["구글맵"];
  let gAt: number | null = null;
  if (!g || typeof g["질문"] !== "string" || !g["질문"].trim())
    bad.push("구글 검색이 없다(구글맵보다 먼저)");
  else {
    if (typeof g["힌트"] !== "string" || g["힌트"].trim().length < 20)
      bad.push("구글검색.힌트 = 받은 글 원문 20자 이상");
    gAt = searchedAt(visits, g["질문"]);
    if (gAt == null)
      bad.push(`구글 검색 "${g["질문"]}" 이 크롬 방문 기록에 없다`);
  }
  if (
    !m ||
    typeof m.url !== "string" ||
    typeof m.h1 !== "string" ||
    typeof m.seen !== "string" ||
    m.seen.trim().length < 10
  )
    return [...bad, "구글맵(url·h1·seen 10자) 이 없다"];
  if (v.found === true) {
    const cid = String(v.cid ?? "");
    if (!/^\d+$/.test(cid))
      return [...bad, "found=true 인데 cid 가 숫자가 아니다"];
    if (mapsAt(visits, "", cid) == null)
      bad.push(`찾았다는 cid ${cid} 의 페이지가 크롬 방문 기록에 없다`);
    else if (gAt != null && mapsAt(visits, "", cid, gAt) == null)
      bad.push("순서 위반 = 구글 검색 뒤에 그 cid 페이지를 열지 않았다");
  } else if (mapsAt(visits, m.url, null) == null)
    bad.push(`구글맵 "${m.url}" 이 크롬 방문 기록에 없다`);
  else if (gAt != null && mapsAt(visits, m.url, null, gAt) == null)
    bad.push("순서 위반 = 구글 검색 뒤에 연 구글맵이 없다");
  return bad;
}

/** 검문 → 어긴 행만 이유와 함께 일꾼에게 한 번 되돌림(retry-1.json) → 다시 검문 = 남은 것이 두 번 어긴 행(order → 이유). */
export async function auditWithRetry(o: {
  audit: () => Map<number, string[]>;
  retry: (
    ranges: { k: number; from: number; to: number }[],
    retryFile: string,
  ) => Promise<unknown>;
  dir: string;
  nextK: number;
}): Promise<Map<number, string[]>> {
  await waitHistory();
  let bad = o.audit();
  console.log(`═══ 판단 순서 검문 1차 = 받지 않은 행 ${bad.size} ═══`);
  if (!bad.size) return bad;
  const orders = [...bad.keys()].sort((a, b) => a - b);
  const per = Math.ceil(orders.length / AGENT_WORKERS);
  const groups = Array.from(
    { length: Math.ceil(orders.length / per) },
    (_, i) => ({
      k: o.nextK + i,
      from: 0,
      to: 0,
      orders: orders.slice(i * per, (i + 1) * per),
    }),
  );
  const retryFile = path.join(o.dir, "retry-1.json");
  fs.writeFileSync(
    retryFile,
    JSON.stringify(
      Object.fromEntries(
        groups.map((j) => [
          j.k,
          j.orders.map((n) => ({ order: n, 이유: bad.get(n) })),
        ]),
      ),
      null,
      2,
    ),
  );
  await o.retry(groups, retryFile);
  await waitHistory();
  bad = o.audit();
  console.log(`═══ 판단 순서 검문 2차 = 받지 않은 행 ${bad.size} ═══`);
  return bad;
}

/** 최종 검수(⑦) 고침 항목 검문 = 근거 칸(제미니 원본 · 로그 · 검색 · 구글맵)과 방문 기록. */
export function checkFixItem(
  v: any,
  rawDir: string,
  visits: Visit[],
): string[] {
  const bad: string[] = [];
  if (/애매/.test(JSON.stringify(v ?? {})))
    bad.push("'애매'는 없다 = 확정해야 한다");
  const e = v?.["근거"];
  if (!e || typeof e !== "object")
    return [...bad, "근거 칸이 없다(제미니·로그·구글검색·구글맵)"];
  if (
    typeof e["제미니"] !== "string" ||
    !fs.existsSync(path.join(rawDir, path.basename(e["제미니"])))
  )
    bad.push("근거.제미니 = 읽은 제미니 원본 파일 이름(docs/raw/{도시}/)");
  if (typeof e["로그"] !== "string" || e["로그"].trim().length < 10)
    bad.push("근거.로그 = 로그에서 읽은 사실 원문 10자 이상");
  let gAt: number | null = null;
  if (e["구글검색"] != null) {
    gAt = searchedAt(visits, String(e["구글검색"]));
    if (gAt == null)
      bad.push(`구글 검색 "${e["구글검색"]}" 이 크롬 방문 기록에 없다`);
  }
  if (e["구글맵"] != null) {
    if (e["구글검색"] == null)
      bad.push("순서 위반 = 구글 검색 없이 구글맵을 열었다");
    const mAt = mapsAt(visits, String(e["구글맵"]), null);
    if (mAt == null)
      bad.push(`구글맵 "${e["구글맵"]}" 이 크롬 방문 기록에 없다`);
    else if (
      gAt != null &&
      mapsAt(visits, String(e["구글맵"]), null, gAt) == null
    )
      bad.push("순서 위반 = 구글 검색 뒤에 연 구글맵이 없다");
  }
  return bad;
}
