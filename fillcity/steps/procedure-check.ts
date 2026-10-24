// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 검문 = 지시문대로 했는가 하나 = 결과가 지시문의 빈칸 양식(단계 칸 · 로그 → 답 없으면 구글 검색 → 힌트로 구글맵 순서 · 애매 금지 · 근거 칸)을 채웠는가만 본다 · 크롬 방문 기록 대조·저장 지연 대기는 없앤다(과설계 = 지시문대로 한 판정을 글자 하나로 버림, 92번) · 통과 못 한 행은 결과로 받지 않는다 (정본 §2026-10-24)
import fs from "fs";
import path from "path";
import {
  CLOSED_PERM_RE,
  CLOSED_TEMP_RE,
  OPEN_RE,
  moneyInText,
  pagePrices,
} from "../../worker/lib/services/fill/gmaps-pid-identity/page-reader";
import { savedEnrichRaws } from "../../worker/lib/services/shared/gemini-curate";
import {
  loadEurPer,
  pagePriceEur,
  toEur,
} from "../../worker/lib/services/shared/price-eur";
import { lastGoogleLogs } from "../../worker/lib/services/shared/local-paths";
import {
  AGENT_WORKERS,
  DIFF_SECTIONS,
  diffSectionItems,
  latestReport,
  ledgerKey,
  readLedger,
  waitHumanCleared,
} from "./common";

const near = (a: number, b: number) => Math.abs(a - b) < 0.06;
const STATUS_RE: Record<string, RegExp> = {
  CLOSED_PERMANENTLY: CLOSED_PERM_RE,
  CLOSED_TEMPORARILY: CLOSED_TEMP_RE,
  OPERATIONAL: OPEN_RE,
};
/** 고침 칸(fix) 검문 = 06 지시문의 양식 그대로인가(keep=false 면 fix 또는 delete 가 있어야 자동으로 넣는다). */
const FIX_KEYS = new Set([
  "price_eur",
  "seed_category",
  "tags",
  "remove_tags",
  "summary_ko",
  "editorial_summary",
  "business_status",
  "name_en",
  "name_ko",
  "google_maps_uri",
]);
export function checkFixShape(v: any): string[] {
  if (v?.keep !== false) return [];
  if (v.delete === true) return [];
  const f = v.fix;
  if (
    !f ||
    typeof f !== "object" ||
    !Object.values(f).some((x) =>
      Array.isArray(x) ? x.length > 0 : x != null && x !== "",
    )
  )
    return ["keep=false 인데 값이 든 fix(고칠 칸) 도 delete=true 도 없다"];
  const unknown = Object.keys(f).filter((k) => !FIX_KEYS.has(k));
  return unknown.length ? [`fix 에 없는 칸 = ${unknown.join(", ")}`] : [];
}
/** 판정 한 행 검문(최종 점검 06 · 일꾼 분류 04) = 위반 이유 목록(빈 목록 = 통과). */
export function checkCheckRow(v: any): string[] {
  const bad: string[] = [];
  if (/애매/.test(JSON.stringify(v ?? {})))
    bad.push("'애매'는 없다 = 확정해야 한다");
  if (typeof v?.reason !== "string" || v.reason.trim().length < 8)
    bad.push("reason = 모든 행 8자 이상(짝 맞음이면 무엇이 맞는지 한 줄)");
  bad.push(...checkFixShape(v));
  const s = v?.["단계"];
  if (!s || typeof s !== "object")
    return [...bad, "단계 칸이 없다(로그 → 구글 검색 → 구글맵)"];
  if (typeof s["로그"] !== "string" || s["로그"].trim().length < 10)
    bad.push("단계.로그 = 로그에서 읽은 사실 원문 10자 이상");
  if (typeof s["로그로_답"] !== "boolean")
    bad.push("단계.로그로_답 = true/false");
  const g = s["구글검색"];
  const m = s["구글맵"];
  if (s["로그로_답"] === false) {
    if (!g || typeof g["질문"] !== "string" || !g["질문"].trim())
      bad.push("로그로 답이 안 나왔는데 구글 검색이 없다");
    else if (typeof g["힌트"] !== "string" || g["힌트"].trim().length < 20)
      bad.push("구글검색.힌트 = 받은 글 원문 20자 이상");
    if (
      !m ||
      typeof m.url !== "string" ||
      typeof m.h1 !== "string" ||
      typeof m.seen !== "string" ||
      m.seen.trim().length < 10
    )
      bad.push("로그로 답이 안 나왔는데 구글맵(url·h1·seen 10자) 이 없다");
  }
  return bad;
}

/** 못 찾은 베스트(07) 항목 검문 = 제미니 힌트 → 구글 검색 → 구글맵 칸을 다 채웠는가 · found=true 면 cid 가 숫자인가. */
export function checkFindItem(v: any): string[] {
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
  if (!g || typeof g["질문"] !== "string" || !g["질문"].trim())
    bad.push("구글 검색이 없다(구글맵보다 먼저)");
  else if (typeof g["힌트"] !== "string" || g["힌트"].trim().length < 20)
    bad.push("구글검색.힌트 = 받은 글 원문 20자 이상");
  if (
    !m ||
    typeof m.url !== "string" ||
    typeof m.h1 !== "string" ||
    typeof m.seen !== "string" ||
    m.seen.trim().length < 10
  )
    return [...bad, "구글맵(url·h1·seen 10자) 이 없다"];
  if (v.found === true && !/^\d+$/.test(String(v.cid ?? "")))
    bad.push("found=true 인데 cid 가 숫자가 아니다");
  return bad;
}

/** 검문 결과 = 어긴 행(이유) · 못 한 행(인증·중단으로 결과가 없는 행)은 따로 담는다. */
export type AuditResult = { bad: Map<number, string[]>; missing: Set<number> };
const MISSING_TEXT =
  "판정 빠짐 = 아직 안 한 행(인증·중단) = 지시문 순서대로 처음부터 한다";
const MISSING_ROUNDS = 3;

/** 검문 → 못 한 행은 인증이 풀린 뒤 다 할 때까지(최대 3번) · 어긴 행은 이유와 함께 한 번 되돌림(retry-N.json) → 다시 검문 = 남은 것(order → 이유). */
export async function auditWithRetry(o: {
  audit: () => AuditResult;
  retry: (
    ranges: { k: number; from: number; to: number }[],
    retryFile: string,
  ) => Promise<unknown>;
  dir: string;
  nextK: number;
}): Promise<Map<number, string[]>> {
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 어긴 행은 회차 사이에 어긴 이유를 유지한다 = 결과 파일에서 빠져도 못 한 행으로 바뀌어 다시 맡기지 않는다 (정본 §2026-10-23)
  const violated = new Map<number, string[]>();
  let missing = new Set<number>();
  const audit = () => {
    const r = o.audit();
    for (const [n, w] of r.bad) violated.set(n, w);
    missing = new Set([...r.missing].filter((n) => !violated.has(n)));
    const all = new Map(r.bad);
    for (const n of r.missing) all.set(n, violated.get(n) ?? [MISSING_TEXT]);
    return all;
  };
  let bad = audit();
  console.log(`═══ 판단 순서 검문 1차 = 받지 않은 행 ${bad.size} ═══`);
  let nextK = o.nextK;
  const resent = new Set<number>();
  const isMissing = (n: number) => missing.has(n);
  for (let round = 1; round <= MISSING_ROUNDS; round++) {
    const orders = [...bad.keys()]
      .filter((n) => isMissing(n) || !resent.has(n))
      .sort((a, b) => a - b);
    if (!orders.length) break;
    for (const n of orders) if (!isMissing(n)) resent.add(n);
    if (orders.some(isMissing))
      await waitHumanCleared("일꾼 단계 = 못 한 행 이어서");
    const per = Math.ceil(orders.length / AGENT_WORKERS);
    const groups = Array.from(
      { length: Math.ceil(orders.length / per) },
      (_, i) => ({
        k: nextK + i,
        from: 0,
        to: 0,
        orders: orders.slice(i * per, (i + 1) * per),
      }),
    );
    nextK += groups.length;
    const retryFile = path.join(o.dir, `retry-${round}.json`);
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
    bad = audit();
    console.log(
      `═══ 판단 순서 검문 ${round + 1}차 = 받지 않은 행 ${bad.size} ═══`,
    );
  }
  return bad;
}

/** 외부 응답값 = 그 행의 구글맵 페이지 기록(엔진이 읽은 것) · 제미니 응답(2차 응답의 그 id · 산출표의 그 항목) · 도시 화폐와 환율. */
export type Evidence = {
  pagePrice: Map<number, number>;
  pageStatus: Map<number, string>;
  geminiPrice: Map<number, number[]>;
  toEurOf: (cur: string, n: number) => number | null;
};

/** 외부 응답값 모으기 = 판정 파일의 값을 대조할 정답 = 구글맵 페이지(최신 읽기) · 제미니 2차 응답 · 산출표(베스트) · 넣기 장부. */
export async function loadEvidence(c: any, cityId: number): Promise<Evidence> {
  const cc =
    (await c.query("SELECT country_code FROM cities WHERE id=$1", [cityId]))
      .rows[0]?.country_code ?? null;
  const eurPer = await loadEurPer(c);
  const cats = new Map<number, string>(
    (
      await c.query(
        "SELECT id, seed_category FROM place_seed_raw WHERE city_id=$1",
        [cityId],
      )
    ).rows.map((r: any) => [r.id, r.seed_category]),
  );
  const pagePrice = new Map<number, number>();
  const pageStatus = new Map<number, string>();
  for (const [id, r] of lastGoogleLogs(cityId)) {
    const p = r?.parsed;
    if (!p) continue;
    if (p.status) pageStatus.set(id, p.status);
    const eur = pagePriceEur(
      cats.get(id),
      pagePrices(String(r.rawText ?? ""), p.category ?? null),
      cc,
      eurPer,
      null,
    );
    if (eur != null) pagePrice.set(id, eur);
  }
  const geminiPrice = new Map<number, number[]>();
  const add = (id: number | null | undefined, n: unknown) => {
    if (id == null || typeof n !== "number") return;
    geminiPrice.set(id, [...(geminiPrice.get(id) ?? []), n]);
  };
  for (const s of savedEnrichRaws(cityId))
    for (const x of s.places) add(x.id, x.price_eur);
  const ledger = readLedger(cityId);
  const diff = latestReport(cityId, "b1-discovery-diff");
  if (diff) {
    const rep = JSON.parse(fs.readFileSync(diff, "utf-8")).report ?? {};
    for (const s of DIFF_SECTIONS)
      for (const n of diffSectionItems(rep, s)) {
        add(n.psrHint?.psrId, n.price);
        add(ledger[ledgerKey(n)]?.rowId, n.price);
      }
  }
  return {
    pagePrice,
    pageStatus,
    geminiPrice,
    toEurOf: (cur, n) =>
      toEur({ cur, lo: n, hi: null }, cc, eurPer).eur ?? null,
  };
}

/** 판정 값 대조 = 값은 외부 응답값 안에서만 = 가격은 구글맵 페이지 값 · 제미니 값 · (근거에 공식 사이트나 구글 검색을 적었으면) 근거.로그에 원문으로 적힌 돈 글자를 환율로 바꾼 값 중 하나 · 영업 상태는 페이지 기록 또는 (근거에 구글맵을 적었으면) 근거.로그 원문의 상태 글자. */
export function checkFixValues(v: any, ev: Evidence): string[] {
  const bad: string[] = [];
  const id = Number(v?.id);
  const f = v?.fix ?? {};
  const e = v?.["근거"] ?? {};
  const log = String(e["로그"] ?? "");
  if (typeof f.price_eur === "number") {
    const p = f.price_eur;
    const ok: number[] = [
      ...(ev.pagePrice.has(id) ? [ev.pagePrice.get(id)!] : []),
      ...(ev.geminiPrice.get(id) ?? []),
    ];
    const outside = e["구글검색"] != null || !!e["공식사이트"];
    if (outside)
      for (const cp of moneyInText(log)) {
        const eur = ev.toEurOf(cp.cur, cp.lo);
        if (eur != null) ok.push(eur);
      }
    if (!ok.some((x) => near(x, p)))
      bad.push(
        `가격 ${p}€ = 외부 응답값에 없다(페이지 ${ev.pagePrice.get(id) ?? "없음"} · 제미니 ${(ev.geminiPrice.get(id) ?? []).join("/") || "없음"}${outside ? " · 근거.로그의 공식 사이트·검색 원문 돈 글자" : ""})`,
      );
  }
  if (typeof f.business_status === "string") {
    const opened = e["구글맵"] != null;
    if (
      ev.pageStatus.get(id) !== f.business_status &&
      !(opened && STATUS_RE[f.business_status]?.test(log))
    )
      bad.push(
        `영업 상태 ${f.business_status} = 페이지 기록(${ev.pageStatus.get(id) ?? "없음"})과 다르고 근거.로그 원문에 그 상태 글자가 없다`,
      );
  }
  return bad;
}

/** 최종 검수(⑦) 고침 항목 검문 = 근거 칸(제미니 원본 · 로그 · 검색 · 구글맵)을 지시문 양식대로 채웠는가. */
export function checkFixItem(v: any, rawDir: string, ev: Evidence): string[] {
  const bad: string[] = [...checkFixValues(v, ev)];
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
  if (e["구글맵"] != null && e["구글검색"] == null)
    bad.push("순서 위반 = 구글 검색 없이 구글맵을 열었다");
  return bad;
}
