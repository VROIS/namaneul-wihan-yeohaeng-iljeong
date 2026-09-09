// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 구글맵으로 창고를 채우는 방법 1벌(§16·§19) = ④ 신규 입력과 재확인·최신화가 같은 이 파일을 쓴다. 옛 refresh 자체 검색(이름+주소 붙여 첫 결과 = Cordano 오염 원인) 폐기 §19.
import path from "path";
import { pathToFileURL } from "url";
import { LANGS } from "../../server/services/shared/language-instruction";
import type { Candidate } from "../../server/services/fill/gmaps-pid-identity/page-reader";
import {
  categoriesOfLabel,
  resolveCategory,
} from "../../server/services/shared/place-category-map";
import {
  bestRankCode,
  writeBestRankUnion,
} from "../../server/services/shared/best-rank";
import { distanceMetersFromCoords } from "../../server/services/shared/geo-distance";

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
  psrHint?: { psrId: number; psrName: string; psrCat: string; by: string };
}
export type Read = {
  n: NewEntry;
  d: any;
  why: string | null;
  imageUrl?: string;
  cat?: string;
};
export type Stat = {
  absorbedHint: number;
  absorbedOther: number;
  insertedNew: number;
  pageOpens: number;
  noMatch: number;
  closed: number;
  skipped: number;
};
export const newStat = (): Stat => ({
  absorbedHint: 0,
  absorbedOther: 0,
  insertedNew: 0,
  pageOpens: 0,
  noMatch: 0,
  closed: 0,
  skipped: 0,
});

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

export async function upsertTranslations(
  c: any,
  placeId: number,
  copies: CopyEntry[],
) {
  for (const t of otherCopiesOf(copies)) {
    if (!t.summary && !t.editorial) continue;
    await c.query(
      `INSERT INTO place_translations (place_id, language, summary, editorial_summary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (place_id, language) DO UPDATE
           SET summary = EXCLUDED.summary, editorial_summary = EXCLUDED.editorial_summary`,
      [placeId, t.lang, t.summary || null, t.editorial || null],
    );
  }
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
// 카드 글자 "4.5(1,234) · Peruvian restaurant · $$ · 주소" 에서 분류 조각만 읽어 대응표에 댄다. 0 = 맞음/모름, 1 = 다른 분류(식당·쇼핑 확실 불일치).
const catRank = (n: NewEntry, x: Candidate) => {
  const seg = x.snippet.match(/\(\d[\d.,]*\)\s*·\s*([^·]+?)\s*(?:·|$)/)?.[1];
  return resolveCategory(seg, n.cat).mismatch ? 1 : 0;
};
export function pickFrom(n: NewEntry, cands: Candidate[]) {
  const withCid = cands.filter((x) => x.cid);
  if (!withCid.length) return null;
  return withCid.sort(
    (a, b) =>
      catRank(n, a) - catRank(n, b) ||
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
  rawRows: any[];
};

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 밖에서 7요소(이름·주소·좌표·리뷰수·영업상태·사진·cid)를 다 갖춘 곳만 창고에 넣는다. 못 갖추면 raw 에 이유만 남기고 안 넣는다.
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
  try {
    let r1 = await t.listCandidates(page, q1, "en");
    picked = pickFrom(n, r1.candidates);
    if (!picked && n.address) {
      q = n.address;
      r1 = await t.listCandidates(page, q, "en");
      picked = pickFrom(n, r1.candidates);
    }
    if (!picked) {
      why = r1.candidates.length
        ? `목록:후보${r1.candidates.length}/일치없음`
        : "없음";
    } else {
      d = await t.readPlacePage(
        page,
        `cid:${picked.cid}`,
        "en",
        true,
        t.photoMaxWidthPx,
      );
      if (d.consentBlocked) why = "동의창";
      else if (!d.h1) why = "빈페이지";
      else if (resolveCategory(d.category, n.cat).mismatch)
        why = `분류불일치:${d.category}`;
    }
  } catch (e: any) {
    why = `오류:${String(e?.message || e).slice(0, 40)}`;
  }
  // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 페이지 분류가 대응표에 있으면 그것이 우리 카테고리(제미니 분류 덮음). 없으면 제미니 그대로. 갖고 온 분류 글자는 google_primary_type 에 그대로 쓴다.
  const cat = d?.category ? resolveCategory(d.category, n.cat).cat : n.cat;
  let imageUrl: string | undefined;
  if (!why && d.photoUrl) {
    try {
      const pres = await fetch(d.photoUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (pres.ok) {
        const cid = String(d.mapsUri || "").match(/cid=(\d+)/)?.[1];
        const up = await t.uploadToR2(
          `place-images/${t.cityId}/${cat}/${cid || encodeURIComponent(n.name)}.jpg`,
          Buffer.from(await pres.arrayBuffer()),
          "image/jpeg",
        );
        imageUrl = up.publicUrl;
      }
    } catch {
      /* 사진 실패 = 아래 요소부족으로 잡힌다 */
    }
  }
  if (!why) {
    const missing: string[] = [];
    if (!d.h1) missing.push("이름");
    if (!d.address) missing.push("주소");
    if (d.urlLat == null || d.urlLng == null) missing.push("좌표");
    if (d.reviewCount == null) missing.push("리뷰수");
    if (!d.status) missing.push("영업상태");
    if (!imageUrl) missing.push("사진");
    if (!d.mapsUri) missing.push("cid");
    if (missing.length) why = `요소부족:${missing.join(",")}`;
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
        }
      : null,
    verdict: { 확인: !why, 이유: why },
  });
  return { n, d, why, imageUrl, cat };
}

// ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 구글맵 열기 = 창 5개 병렬(실측 곳당 6.2초→4.5초, 10개는 8.8초로 느려짐). 창고 쓰기는 뒤에서 한 줄로(트랜잭션 1연결).
export async function readAll(
  browser: any,
  browserUa: string,
  items: NewEntry[],
  t: PageTools,
  stat: Stat,
): Promise<Read[]> {
  const PARALLEL = 5;
  const queue = [...items];
  const reads: Read[] = [];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      const bctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: browserUa,
        locale: "en-US",
      });
      const page = await bctx.newPage();
      for (;;) {
        const n = queue.shift();
        if (!n) break;
        stat.pageOpens++;
        reads.push(await readOne(page, n, t));
      }
      await bctx.close();
    }),
  );
  return reads;
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 읽어온 것을 창고에 쓰는 길 1벌 = ④(새로 넣기)와 재확인(그 행에 쓰기)이 같은 함수를 쓰고 targetRowId 만 다르다.
export async function writeRead(
  c: any,
  upsertPlace: any,
  r: Read,
  opts: { cityId: number; provenanceTag: string; targetRowId?: number | null },
  stat: Stat,
): Promise<void> {
  const { n, d, why, imageUrl, cat } = r;
  if (why) {
    stat.noMatch++;
    console.log(`  ✗ ${why}: ${n.name}`);
    return;
  }
  if (d.status !== "OPERATIONAL") {
    stat.closed++;
    console.log(`  [${d.status}] ${n.name} = 넣되 손님상 관문이 거른다`);
  }
  const ko = koCopyOf(n.copies);
  const res = await upsertPlace({
    // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 재확인은 그 창고 행에 쓴다(새 행을 만들지 않는다 = 프랑스 가게 4행 사고). ④ 신규는 targetRowId 없이 새로 넣는다.
    ...(opts.targetRowId != null
      ? { targetRowId: opts.targetRowId, followTriggerDup: true }
      : {}),
    cityId: opts.cityId,
    seedCategory: cat ?? n.cat,
    googlePrimaryType: d.category ?? null,
    nameEn: d.h1,
    nameKo: n.nameKo,
    nameLocal: n.nameLocal,
    address: d.address,
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
    priceEur: n.avgPrice ?? null,
    selectionReasonKo: ko?.summary || null,
    shortformKo: ko?.editorial || null,
    categoryTags: [cat ?? n.cat],
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

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 구글맵 도구(브라우저·페이지 읽기·사진 올리기) 여는 길 1벌.
export async function openGmapsTools(ROOT: string) {
  const { chromium } = await import("playwright");
  const { BROWSER_UA, readPlacePage, listCandidates } = await import(
    pathToFileURL(
      path.join(ROOT, "server/services/fill/gmaps-pid-identity/page-reader.ts"),
    ).href
  );
  const { PHOTO_MAX_WIDTH_PX } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  const { uploadToR2 } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );
  const browser = await chromium.launch({ headless: true });
  return {
    browser,
    browserUa: BROWSER_UA as string,
    readPlacePage,
    listCandidates,
    photoMaxWidthPx: PHOTO_MAX_WIDTH_PX as number,
    uploadToR2,
  };
}
