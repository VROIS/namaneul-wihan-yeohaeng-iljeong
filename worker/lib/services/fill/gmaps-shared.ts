// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 이 파일은 worker/lib 정본(필시티·후처리 큐 소비자가 같은 1벌을 부른다). 브라우저는 밖에서 받는다(Node = playwright, Worker = Browser Run) (정본 §)
import { LANGS } from "../shared/language-instruction";
import {
  BROWSER_UA,
  launchBrowser,
  openWindow,
  coordsFromUrl,
  listCandidates,
  readPlacePage,
  type Candidate,
} from "./gmaps-pid-identity/page-reader";
import {
  categoryTagsOf,
  categoriesOfLabel,
  finalCategory,
  resolveCategory,
} from "../shared/place-category-map";
import { toEur, type EurPer } from "../shared/price-eur";
import { bestRankCode, writeBestRankUnion } from "../shared/best-rank";
import { upsertTranslationWith } from "../place-upsert";
import {
  distanceKmFromCoords,
  distanceMetersFromCoords,
  MOVE_MAX_KM,
} from "../shared/geo-distance";
import {
  coversName,
  exactName,
  placeStop,
  sameName,
} from "./gmaps-pid-identity/gates";
import { PHOTO_MAX_WIDTH_PX } from "../shared/ts-client";
import { uploadToR2 } from "../shared/r2-client";
import { placeImageKey } from "../../../../shared/r2-paths";

export interface CopyEntry {
  lang: string;
  summary?: string;
  editorial?: string;
}
export interface NewEntry {
  name: string;
  nameLocal: string | null;
  nameKo: string | null;
  langs: number;
  cat: string;
  avgPrice: number | null;
  avgRank: number | null;
  copies: CopyEntry[];
  lat: number | null;
  lng: number | null;
  address: string | null;
  aliases?: string[];
  isBest?: boolean;
  noXY?: boolean;
  psrHint?: {
    psrId: number;
    psrName: string;
    psrCat: string;
    psrTags?: string[] | null;
    by: string;
  };
}
export type Read = {
  n: NewEntry;
  d: any;
  why: string | null;
  imageUrl?: string;
  cat?: string;
  hotspotTag?: boolean; // 핫스팟이 구글 사실 분류로 바뀌며 태그로 남는 경우
};
export type Stat = {
  absorbedHint: number;
  absorbedOther: number;
  insertedNew: number;
  pageOpens: number;
  noMatch: number;
  closed: number;
  skipped: number;
  limited: number; // 구글 제한 보기로 못 읽은 수
  blocked: boolean; // 연속 제한 보기 = 채널 막힘 = 남은 것 안 엶
};
export const newStat = (): Stat => ({
  absorbedHint: 0,
  absorbedOther: 0,
  insertedNew: 0,
  pageOpens: 0,
  noMatch: 0,
  closed: 0,
  skipped: 0,
  limited: 0,
  blocked: false,
});
// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 제한 보기 = 채널 막힘(빈 등록 아님) = 그 행은 "다음 판에", 연속 3행이면 남은 행을 열지 않는다 (정본 §)
export const LIMITED_WHY = "제한보기";
export const LIMITED_STOP = 3;
export type PriceCtx = { eurPer: EurPer; countryCode: string | null };
/** 환율표 + 그 도시 나라 코드 = 페이지 가격을 유로로 바꾸는 재료 1벌 */
export async function loadPriceCtx(
  c: { query: (q: string, v?: unknown[]) => Promise<any> },
  cityId: number,
  fx?: string,
): Promise<PriceCtx> {
  const { loadEurPer } = await import("../shared/price-eur");
  const row = (
    await c.query("SELECT country_code FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  return {
    eurPer: await loadEurPer(c, fx),
    countryCode: row?.country_code ?? null,
  };
}

/** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = best_rank = 카피에 든 언어들의 7자리 언어코드(bestRankCode 1벌). */
export function codeOf(
  name: string,
  langs: number,
  copies: CopyEntry[],
): number | null {
  const known = new Set(
    copies
      .map((c) => c.lang)
      .filter((l) => (LANGS as readonly string[]).includes(l)),
  );
  if (known.size !== langs)
    console.warn(
      `  ⚠️ 언어수 불일치: ${name} B1 langs=${langs} ≠ 카피 언어 ${known.size}개(${[...known].join(",")})`,
    );
  return bestRankCode(copies.map((c) => c.lang));
}

export const koCopyOf = (copies: CopyEntry[]) =>
  copies.find((x) => x.lang === "ko");
export const otherCopiesOf = (copies: CopyEntry[]) =>
  copies.filter(
    (x) => x.lang !== "ko" && (LANGS as readonly string[]).includes(x.lang),
  );

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = BEGIN/skip_dup_check/COMMIT 트랜잭션 래퍼 1벌(병합·신규 두 호출부)
export async function inTxn<T>(c: any, fn: () => Promise<T>): Promise<T> {
  await c.query("BEGIN");
  try {
    await c.query(`SELECT set_config('app.skip_dup_check', 'on', true)`);
    const result = await fn();
    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 통과증(skip_dup_check)은 쓰고 나서 반드시 손으로 반납(RESET) = 풀 백엔드에 켜진 채 남아 검문 전체가 꺼졌던 사고.
    await c.query("RESET app.skip_dup_check");
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}

// 번역행 갱신 SQL = place-upsert 1벌(upsertTranslationWith). 실행기 = 지금 열린 트랜잭션의 클라이언트
export async function upsertTranslations(
  c: any,
  placeId: number,
  copies: CopyEntry[],
) {
  for (const t of otherCopiesOf(copies))
    await upsertTranslationWith(
      (text, params) => c.query(text, params),
      placeId,
      t.lang,
      t.summary,
      t.editorial,
    );
}

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지적 = 출처표식은 병합·신규 양쪽 다 phase_tags 에 반드시 남긴다
export const provenanceTag = (today: string) => `discover-perlang-${today}`;

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 검색 = 이름 한 번(+부류 단어 식당 restaurant · 쇼핑 shopping mall + 도시), 못 찾으면 주소 한 번. 둘을 붙이지 않는다(제미니 주소는 번지를 지어낸다).
//   후보가 여럿이면 = **분류가 맞는 것 먼저**(카드의 분류 글자 → 대응표, 식당·쇼핑은 확실) → 제미니 좌표에 가까운 것 → 리뷰수. 고른 후보는 cid 로 정확히 연다.
const CAT_WORD: Record<string, string> = {
  restaurant: "restaurant",
  shopping: "shopping mall",
};
const distM = (n: NewEntry, x: Candidate) =>
  n.lat != null && n.lng != null && x.lat != null && x.lng != null
    ? distanceMetersFromCoords(n.lat, n.lng, x.lat, x.lng)
    : Number.POSITIVE_INFINITY;
// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 페이지 관문(이름 별칭이 있을 때 = ④ 시드·사전 정제 검색) = 대표 이름(영어·현지)과 똑같은 후보 → 별칭과 일부만 겹치는 후보 순(일부만 겹치면 다른 별칭 이름으로 두 번까지 더 찾음 · 짧은 별칭과 똑같은 것은 인정 안 함) · 그중 2km 안에선 리뷰 많은 등록 먼저 · 고른 페이지 이름이 별칭과 맞고 합의 좌표에서 500km 안(베스트는 100km 제한 없음 = 넓은 나라 외곽 · 500km 밖 = 딴 대륙 같은 이름 가게, 산티아고 El Rápido 10,926km 실측) · 리뷰수로는 거르지 않는다 · 이름 → 별칭 → 주소 검색은 따로(붙이지 않음 = 9-08 결정), 주소가 한 곳을 가리키면 그 위치에서 이름으로 한 번 더(사람이 주소로 찾는 방식) · 그래도 아니면 넣지 않는다 = 환각 의심 (정본 §)
const exactMain = (n: NewEntry, label: string, stop: Set<string>) =>
  !n.aliases?.length || exactName([n.name, n.nameLocal], [label], stop);
const pageName = (n: NewEntry, label: string, stop: Set<string>) =>
  sameName(n.aliases ?? [], [label], stop) ||
  coversName(n.aliases ?? [], [label], stop);
const nameRank = (n: NewEntry, x: Candidate, stop: Set<string>) =>
  exactMain(n, x.label, stop) ? 0 : pageName(n, x.label, stop) ? 1 : 2;
const popRank = (n: NewEntry, x: Candidate) =>
  n.aliases?.length && (n.noXY || distM(n, x) <= 2000)
    ? -(x.reviewCount ?? 0)
    : 0;
function seedGate(n: NewEntry, d: any, stop: Set<string>): string | null {
  if (!n.aliases?.length) return null;
  if (!pageName(n, d.h1, stop)) return `환각의심:이름다름(${d.h1})`;
  const km =
    !n.noXY &&
    n.lat != null &&
    n.lng != null &&
    d.urlLat != null &&
    d.urlLng != null
      ? distanceKmFromCoords(n.lat, n.lng, d.urlLat, d.urlLng)
      : 0;
  if (km > MOVE_MAX_KM) return `환각의심:거리${Math.round(km)}km(${d.h1})`;
  return null;
}
// 카드 글자 "4.5(1,234) · Peruvian restaurant ·" / "4.6(35) · $10–20 Restaurant ·" / "4.5 Restaurant ·"(리뷰수 없이) 에서 분류 조각만 읽어 대응표에 댄다. 0 = 맞음/모름, 1 = 다른 분류(식당·쇼핑 확실 불일치).
const catRank = (n: NewEntry, x: Candidate) => {
  const seg = x.snippet.match(
    /\d\.\d(?:\(\d[\d.,]*\))?\s*(?:·\s*)?(?:[$€£¥₩][^\s·]*\s+)?([^·]+?)\s*·/,
  )?.[1];
  return resolveCategory(seg, n.cat).mismatch ? 1 : 0;
};
export function pickFrom(n: NewEntry, cands: Candidate[]) {
  const withCid = cands.filter((x) => x.cid);
  if (!withCid.length) return null;
  const stop = placeStop(null, [n.address]);
  return withCid.sort(
    (a, b) =>
      nameRank(n, a, stop) - nameRank(n, b, stop) ||
      catRank(n, a) - catRank(n, b) ||
      popRank(n, a) - popRank(n, b) ||
      distM(n, a) - distM(n, b) ||
      (b.reviewCount ?? -1) - (a.reviewCount ?? -1),
  )[0];
}

export type PageTools = {
  readPlacePage: any;
  listCandidates: any;
  photoMaxWidthPx: number;
  uploadToR2: any;
  cityId: number;
  cityNameEn?: string | null;
  cityOf?: (lat: number, lng: number) => number | null;
  preclean?: boolean;
  rawRows: any[];
  priceCtx?: PriceCtx; // 있으면 페이지 가격을 유로로 바꿔 식당 가격에 쓴다
  parallel?: number; // 창 수(기본 5). 제한 보기가 잦으면 1로 천천히
};

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 7요소(이름·주소·좌표·리뷰수·영업상태·cid·사진)를 다 갖춘 곳만 창고에 넣는다(못 갖추면 raw 에 이유만). 베스트(제미니 별칭 있는 시드)는 모두 면제 = 이름·좌표·cid 만 있으면 넣고, 구글에 없는 것은 없는 대로(주소는 제미니 것) (pool-radius 2026-09-01 원칙 확장). 사진은 장소가 붙을 도시 폴더에 올린다 (정본 §)
export async function readOne(
  page: any,
  n: NewEntry,
  t: PageTools,
): Promise<Read> {
  const catWord = CAT_WORD[n.cat] ?? "";
  const q1 = [n.nameLocal || n.name, catWord, t.cityNameEn]
    .filter(Boolean)
    .join(" ");
  let d: any = null;
  let why: string | null = null;
  let q = q1;
  let picked: Candidate | null = null;
  const near =
    n.lat != null && n.lng != null ? { lat: n.lat, lng: n.lng } : null;
  const stop = placeStop(t.cityNameEn, [n.address]);
  const exact = (h1: string) => exactMain(n, h1, stop);
  const more = [...new Set(n.aliases ?? [])]
    .filter((a) => a !== (n.nameLocal || n.name))
    .slice(0, 2);
  let partial: {
    d: any;
    why: string | null;
    picked: Candidate | null;
    q: string;
  } | null = null;
  type Step = { q: string; near: typeof near; alias?: true; addr?: true };
  const steps: Step[] = [
    { q: q1, near },
    ...more.map((a): Step => ({ q: a, near, alias: true })),
    ...(n.address ? [{ q: n.address, near, addr: true } as Step] : []),
  ];
  try {
    for (const s of steps) {
      if (s.alias && !partial) continue;
      q = s.q;
      const r1 = await t.listCandidates(page, s.q, "en", s.near);
      if (r1.limited) {
        why = LIMITED_WHY;
        break;
      }
      const at = s.addr && page.url().includes("/maps/place/");
      const xy = at ? coordsFromUrl(page.url()) : null;
      if (xy) steps.push({ q: q1, near: { lat: xy[0], lng: xy[1] } });
      picked = pickFrom(n, r1.candidates);
      if (!picked) {
        if (!why?.startsWith("환각의심"))
          why = r1.candidates.length
            ? `목록:후보${r1.candidates.length}/일치없음`
            : "없음";
        continue;
      }
      d = await t.readPlacePage(
        page,
        `cid:${picked.cid}`,
        "en",
        true,
        t.photoMaxWidthPx,
      );
      if (d.limited) {
        why = LIMITED_WHY;
        break;
      }
      if (d.consentBlocked) why = "동의창";
      else if (!d.h1) why = "빈페이지";
      else if (!t.preclean && resolveCategory(d.category, n.cat).mismatch)
        why = `분류불일치:${d.category}`;
      else why = seedGate(n, d, stop);
      if (why?.startsWith("환각의심")) continue;
      if (why || exact(d.h1)) break;
      partial ??= { d, why, picked, q };
    }
  } catch (e: any) {
    why = `오류:${String(e?.message || e).slice(0, 40)}`;
  }
  if (partial && (why || !d?.h1 || !exact(d.h1)))
    ({ d, why, picked, q } = partial);
  // ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 우리 분류 확정 = finalCategory 1벌(구글 최우선 · 장소 아님 = 안 넣음/삭제 · 베스트는 리뷰 수와 상관없이 면제 · 핫스팟은 태그로) (정본 §)
  const fc = finalCategory(n.cat, d?.category, {
    reviewCount: d?.reviewCount,
    best: n.isBest || (!!n.aliases?.length && !t.preclean),
  });
  const cat = fc.cat;
  if (!why && fc.notPlace) why = `장소아님:${d.category}`;
  const best = !!n.aliases?.length && !t.preclean;
  if (!why) {
    const missing: string[] = [];
    if (!d.h1) missing.push("이름");
    if (!d.address && !best) missing.push("주소");
    if (d.urlLat == null || d.urlLng == null) missing.push("좌표");
    if (d.reviewCount == null && !best) missing.push("리뷰수");
    if (!d.status && !best) missing.push("영업상태");
    if (!d.photoUrl && !best) missing.push("사진");
    if (!d.mapsUri) missing.push("cid");
    if (missing.length) why = `요소부족:${missing.join(",")}`;
  }
  const photoCity = why
    ? null
    : t.cityOf
      ? t.cityOf(d.urlLat, d.urlLng)
      : t.cityId;
  if (!why && photoCity == null) why = "붙을 도시 없음(500km)";
  let imageUrl: string | undefined;
  if (!why && d.photoUrl) {
    try {
      const pres = await fetch(d.photoUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (pres.ok) {
        const cid = String(d.mapsUri || "").match(/cid=(\d+)/)?.[1];
        const up = await t.uploadToR2(
          placeImageKey(
            photoCity!,
            cat,
            `${cid || encodeURIComponent(n.name)}.jpg`,
          ),
          Buffer.from(await pres.arrayBuffer()),
          "image/jpeg",
        );
        imageUrl = up.publicUrl;
      }
    } catch {
      /* 사진 받기 실패 = 바로 아래 일시 오류로 잡힌다 */
    }
    if (!imageUrl) why = "오류:사진받기";
  }
  t.rawRows.push({
    request: {
      name: n.name,
      nameLocal: n.nameLocal,
      nameKo: n.nameKo,
      address: n.address,
      lat: n.lat,
      lng: n.lng,
      cat: n.cat,
      avgPrice: n.avgPrice,
      langs: n.langs,
      searchQuery: q,
      picked: picked
        ? {
            label: picked.label,
            cid: picked.cid,
            distM: Math.round(distM(n, picked)),
            reviewCount: picked.reviewCount,
          }
        : null,
    },
    page: d
      ? {
          nameEn: d.h1,
          address: d.address,
          category: d.category,
          ourCategory: cat,
          categoriesOfLabel: categoriesOfLabel(d.category),
          latitude: d.urlLat,
          longitude: d.urlLng,
          googleReviewCount: d.reviewCount,
          businessStatus: d.status,
          googleMapsUri: d.mapsUri,
          photoUrl: d.photoUrl,
          imageUrl: imageUrl ?? null,
          price: d.price ?? null,
        }
      : null,
    verdict: { 확인: !why, 이유: why },
  });
  return { n, d, why, imageUrl, cat, hotspotTag: fc.hotspotTag };
}

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 구글맵 열기 = 창 5개 병렬(실측 곳당 6.2초→4.5초, 10개는 8.8초로 느려짐). 창고 쓰기는 뒤에서 한 줄로(트랜잭션 1연결).
export async function readAll(
  browser: any,
  browserUa: string,
  items: NewEntry[],
  t: PageTools,
  stat: Stat,
): Promise<Read[]> {
  const PARALLEL = Math.max(1, t.parallel ?? 5);
  const queue = [...items];
  const reads: Read[] = [];
  let limitedRun = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      const { page, close: closeWin } = await openWindow(
        browser,
        browserUa,
        "en-US",
      );
      for (;;) {
        const n = queue.shift();
        if (!n) break;
        stat.pageOpens++;
        const r = await readOne(page, n, t);
        reads.push(r);
        if (r.why === LIMITED_WHY) {
          stat.limited++;
          if (++limitedRun >= LIMITED_STOP && !stat.blocked) {
            stat.blocked = true;
            for (const left of queue.splice(0))
              reads.push({ n: left, d: null, why: LIMITED_WHY });
          }
        } else limitedRun = 0;
      }
      await closeWin();
    }),
  );
  return reads;
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 읽어온 것을 창고에 쓰는 길 1벌 = ④(새로 넣기)와 재확인(그 행에 쓰기)이 같은 함수를 쓰고 targetRowId 만 다르다.
export async function writeRead(
  c: any,
  upsertPlace: any,
  r: Read,
  opts: {
    cityId: number;
    provenanceTag: string;
    targetRowId?: number | null;
    priceCtx?: PriceCtx;
  },
  stat: Stat,
): Promise<void> {
  const { n, d, why, imageUrl, cat } = r;
  if (why) {
    stat.noMatch++;
    console.log(`  ✗ ${why}: ${n.name}`);
    return;
  }
  // 식당 가격 = 페이지 머리줄 가격(상한 규칙, 유로) > 제미니 값
  const pagePrice =
    cat === "restaurant" && d.price && opts.priceCtx
      ? (toEur(d.price, opts.priceCtx.countryCode, opts.priceCtx.eurPer).eur ??
        null)
      : null;
  if (d.status !== "OPERATIONAL") {
    stat.closed++;
    console.log(`  [${d.status}] ${n.name} = 넣되 손님상 관문이 거른다`);
  }
  const ko = koCopyOf(n.copies);
  const res = await upsertPlace({
    // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 그 행에 새 CID 를 쓸 때는 검문(트리거)을 통과시킨다 = 같은 CID 행이 있으면 그 원행으로 흡수하고 진 행은 삭제 = 쌍둥이 원천 차단 ③ (정본 §)
    ...(opts.targetRowId != null
      ? {
          targetRowId: opts.targetRowId,
          followTriggerDup: true,
          dupCheckOnWrite: true,
        }
      : {}),
    cityId: opts.cityId,
    seedCategory: cat ?? n.cat,
    overwriteSeedCategory: !!opts.targetRowId, // 페이지로 확정한 분류 = 옛 분류를 덮는다(§14 2026-09-30)
    googlePrimaryType: d.category ?? null,
    nameEn: d.h1,
    nameKo: n.nameKo,
    nameLocal: n.nameLocal,
    address: d.address ?? (n.aliases?.length ? n.address : null),
    latitude: d.urlLat,
    longitude: d.urlLng,
    googlePlaceId: null,
    googleMapsUri: d.mapsUri,
    googleReviewCount: d.reviewCount,
    imageUrl,
    // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 페이지가 준 영업상태도 PSR 로(옛 = 폐업판정에만 쓰고 버림) (정본 §⑥)
    businessStatus: d.status,
    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 페이지를 실제로 열어 확인했으면 그 기록을 남긴다(찍힌 것 = 확인됨 / 안 찍힌 것 = 다음 대상).
    verifySource: "gmaps-search-page",
    priceEur: pagePrice ?? n.avgPrice ?? null,
    selectionReasonKo: ko?.summary || null,
    shortformKo: ko?.editorial || null,
    categoryTags: [
      ...new Set([
        ...categoryTagsOf(cat ?? n.cat, d.category),
        n.cat,
        ...(r.hotspotTag ? ["hotspot"] : []),
      ]),
    ],
    phaseTags: [opts.provenanceTag],
  });
  if (res.action !== "inserted" && res.action !== "updated") {
    stat.skipped++;
    console.log(
      `  ⚠️ upsert 결과 이상(${res.action}${res.reason ? `: ${res.reason}` : ""}): ${n.name}`,
    );
    return;
  }
  const rowId = res.rowId!;
  const outcome =
    res.action === "inserted"
      ? "신규행"
      : n.psrHint && rowId === n.psrHint.psrId
        ? "힌트행 흡수"
        : "다른 행 흡수";
  if (outcome === "신규행") stat.insertedNew++;
  else if (outcome === "힌트행 흡수") stat.absorbedHint++;
  else stat.absorbedOther++;
  const code = codeOf(n.name, n.langs, n.copies);
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 병합 경로와 동일한 inTxn() + writeBestRankUnion() 공용 사용
  const br = await inTxn(c, async () => {
    const x = await writeBestRankUnion(c, rowId, code);
    await upsertTranslations(c, rowId, n.copies);
    return x;
  });
  console.log(
    `  ✅ #${rowId} ${d.h1} (${res.action}${res.reason ? `/${res.reason}` : ""}, ${outcome}, langs=${n.langs}, best_rank ${br.cur} ∪ ${code} → ${br.result})`,
  );
}

// ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 알아보는 문이 "있음"으로 본 곳 = 구글맵은 안 열고 그 행에 흡수 = 제미니 몫(한국어·현지어 이름·한국어 요약·분류 태그·출처, 가격은 행에 가격이 없을 때만) + 베스트 언어 합치기 + 번역. 구글 페이지 몫(영어 이름·주소·좌표·리뷰수·사진·CID·가격)은 안 건드린다. 식당·비식당이 엇갈리면 흡수 안 함 (정본 §)
export const crossKind = (n: NewEntry): boolean =>
  !n.psrHint?.psrTags?.includes(n.cat) &&
  (n.cat === "restaurant") !== (n.psrHint?.psrCat === "restaurant");
export async function absorbInto(
  c: any,
  upsertPlace: any,
  n: NewEntry,
  opts: { cityId: number; provenanceTag: string },
  stat: Stat,
): Promise<void> {
  const hint = n.psrHint!;
  if (crossKind(n)) {
    stat.skipped++;
    console.log(
      `  ⏭ 식당·비식당 엇갈림 = 흡수 안 함: ${n.name}(${n.cat}) ↛ #${hint.psrId} ${hint.psrName}(${hint.psrCat})`,
    );
    return;
  }
  const ko = koCopyOf(n.copies);
  const hasPrice =
    (
      await c.query("SELECT price_eur FROM place_seed_raw WHERE id=$1", [
        hint.psrId,
      ])
    ).rows[0]?.price_eur != null;
  const res = await upsertPlace({
    targetRowId: hint.psrId,
    followTriggerDup: true,
    cityId: opts.cityId,
    seedCategory: n.cat,
    nameEn: hint.psrName,
    nameKo: n.nameKo,
    nameLocal: n.nameLocal,
    priceEur: hasPrice ? null : (n.avgPrice ?? null),
    selectionReasonKo: ko?.summary || null,
    shortformKo: ko?.editorial || null,
    phaseTags: [opts.provenanceTag],
  });
  if (res.action !== "updated") {
    stat.skipped++;
    console.log(
      `  ⚠️ 흡수 이상(${res.action}${res.reason ? `: ${res.reason}` : ""}): ${n.name} → #${hint.psrId}`,
    );
    return;
  }
  const code = codeOf(n.name, n.langs, n.copies);
  const br = await inTxn(c, async () => {
    const x = await writeBestRankUnion(c, hint.psrId, code);
    await upsertTranslations(c, hint.psrId, n.copies);
    return x;
  });
  stat.absorbedHint++;
  console.log(
    `  🧲 #${hint.psrId} ${hint.psrName} ← ${n.name} (흡수, langs=${n.langs}, best_rank ${br.cur} ∪ ${code} → ${br.result})`,
  );
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 구글맵 도구(브라우저·페이지 읽기·사진 올리기) 여는 길 1벌.
export const pageTools = () => ({
  readPlacePage,
  listCandidates,
  photoMaxWidthPx: PHOTO_MAX_WIDTH_PX as number,
  uploadToR2,
});
export async function openGmapsTools(_root?: string) {
  const { chromium } = await import("playwright");
  const browser = await launchBrowser(chromium);
  return { browser, browserUa: BROWSER_UA as string, ...pageTools() };
}
