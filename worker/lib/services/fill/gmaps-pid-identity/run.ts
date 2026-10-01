// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = PID·CID 행 페이지 재확인 루프 1벌 = CLI(gmaps-pid-identity)와 후처리 엔진(gmaps-post = 큐 소비자)이 같은 함수를 부른다. 브라우저는 밖에서 받는다(Node = playwright, Worker = Browser Run). 창 5개 병렬 (정본 §)
import { openWindow } from "./page-reader";
import {
  evaluateRow,
  initResult,
  nameTokens,
  type Result,
  type Row,
} from "./gates";
import {
  clearSuspectTags,
  pageWasRead,
  writeRow,
  type WriteCtx,
} from "./apply";

export const PID_PARALLEL = 5;
// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 제한 보기가 세트 안에 이만큼이면 채널 막힘 = 남은 행은 열지 않고 멈춘다(빈 등록으로 오인해 지우는 사고 차단) (정본 §)
export const LIMITED_STOP = 1;
export const limitedCount = (rs: Result[]) =>
  rs.filter((r) => r.gate === "limited-view").length;

export type VerifyPidOpts = {
  browser: any;
  rows: Row[];
  city: { name_en: string | null; lat: number | null; lng: number | null };
  lang: string;
  photoWidth: number;
  distanceKmFromCoords: (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ) => number;
  upsertPlace: any;
  client: { query: (q: string, v?: unknown[]) => Promise<unknown> };
  cityId: number;
  apply: boolean;
  onResult?: (r: Result) => void;
  writeCtx?: WriteCtx;
  parallel?: number; // 창 수(기본 5). 제한 보기가 잦으면 1로 천천히
};

// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 세트 단위 = 창이 행 하나씩 동시에 읽고(한 세트) → 그 세트의 원본 JSON 을 도시 폴더에 저장 → 저장 확인 뒤에만 덮어쓰기 → 다음 세트 · 세트 안에 문제(제한 보기·오류·동의창)가 있으면 그 자리에서 멈춘다 (정본 §)
export async function verifyPidRows(o: VerifyPidOpts): Promise<Result[]> {
  const results: Result[] = [];
  const cityStop = nameTokens(o.city.name_en, new Set());
  const queue = [...o.rows];
  const windows = Math.max(
    1,
    Math.min(o.parallel ?? PID_PARALLEL, queue.length),
  );
  const wins: { page: any; close: () => Promise<unknown> }[] = [];
  let fatal: string | null = null;
  try {
    for (let i = 0; i < windows; i++) wins.push(await openWindow(o.browser));
    for (let n = 1; queue.length; n++) {
      const set = queue.splice(0, windows);
      const done = await Promise.all(
        set.map((row, i) => readOne(o, wins[i].page, row, cityStop)),
      );
      const saved = await savePageLog(o, done, n);
      console.log(
        `  ▣ 세트 ${n} = ${coverage(done)} · 원본 ${saved ?? "저장 실패"}`,
      );
      if (saved && o.apply)
        for (let i = 0; i < done.length; i++)
          await applyOne(o, set[i], done[i]);
      results.push(...done);
      done.forEach((r) => o.onResult?.(r));
      if (!saved) {
        fatal = "원본 JSON 저장 실패 = 덮어쓰지 않고 멈춘다";
        break;
      }
      if (done.some(isProblem)) {
        if (!done.every((r) => r.gate === "limited-view" || !isProblem(r)))
          fatal = `세트 ${n} 에 오류·동의창 = 여기서 멈춘다`;
        break;
      }
    }
  } finally {
    for (const w of wins) await w.close();
  }
  if (fatal) throw new Error(fatal);
  return results;
}

const isProblem = (r: Result) =>
  r.gate === "limited-view" ||
  r.gate === "consent-blocked" ||
  r.gate.startsWith("error");

async function readOne(
  o: VerifyPidOpts,
  page: any,
  row: Row,
  cityStop: Set<string>,
): Promise<Result> {
  const r = initResult(row);
  try {
    await evaluateRow(
      {
        page,
        lang: o.lang,
        photoWidth: o.photoWidth,
        cityLat: o.city.lat,
        cityLng: o.city.lng,
        cityStop,
        distanceKmFromCoords: o.distanceKmFromCoords,
      },
      row,
      r,
    );
  } catch (e: any) {
    r.gate = `error:${String(e?.message || e).slice(0, 80)}`;
  }
  return r;
}

async function applyOne(o: VerifyPidOpts, row: Row, r: Result): Promise<void> {
  if (r.gate === "limited-view") return;
  await writeRow(o.upsertPlace, o.cityId, row, r, o.writeCtx);
  const up = String(r.upsert || "");
  if (pageWasRead(r) && !up.startsWith("error") && !up.startsWith("deleted"))
    await clearSuspectTags(o.client, row.id);
}

// 9요소 = 이름·주소·좌표·리뷰수·영업상태·사진·CID·분류·가격 (세트마다 몇 행에 있었는지)
function coverage(done: Result[]): string {
  const has = (f: (r: Result) => unknown) =>
    done.filter((r) => f(r) != null && f(r) !== "").length;
  const price = done.filter((r) => r.price || r.admission || r.perPerson);
  return `${done.length}행 · 이름 ${has((r) => r.name_local)} 주소 ${has((r) => r.address)} 좌표 ${has((r) => r.page_lat)} 리뷰 ${has((r) => r.rc_page)} 상태 ${has((r) => r.status)} 사진 ${has((r) => r.photo_url)} CID ${has((r) => r.maps_uri)} 분류 ${has((r) => r.category)} 가격 ${price.length} · 제한 ${limitedCount(done)}`;
}

const state = (v: unknown, limited: boolean) =>
  limited ? "못 읽음" : v ? "있음" : "없음";
async function savePageLog(
  o: VerifyPidOpts,
  results: Result[],
  set: number,
): Promise<string | null> {
  const { saveRaw } = await import("../../shared/save-raw");
  return saveRaw({
    source: "gmaps",
    contextId: o.cityId,
    tag: `page-read-${set}`,
    request: {
      cityId: o.cityId,
      lang: o.lang,
      apply: o.apply,
      set,
      rows: results.map((r) => ({ id: r.id, pid: r.pid })),
    },
    raw: {
      rows: results.map((r) => ({
        id: r.id,
        pid: r.pid,
        gate: r.gate,
        limited: r.limited,
        upsert: r.upsert ?? null,
        parsed: {
          name: r.name_local,
          address: r.address,
          category: r.category,
          lat: r.page_lat,
          lng: r.page_lng,
          reviewCount: r.rc_page,
          rating: r.rating,
          status: r.status,
          photoUrl: r.photo_url,
          mapsUri: r.maps_uri,
          headerPrice: r.price,
          admission: r.admission,
          perPerson: r.perPerson,
        },
        priceState: {
          headerPrice: state(r.price, r.limited),
          admission: state(r.admission, r.limited),
          perPerson: state(r.perPerson, r.limited),
        },
        rawText: r.rawText,
      })),
    },
  } as any);
}

// PID·CID 행 조회 SQL 1벌 = 기준은 CID(있으면 CID 로 열고, 없을 때만 PID) · 사진은 구글(R2)만 사진으로 친다
export const PID_ROWS_SELECT = `SELECT id, seed_category, name_en, COALESCE('cid:' || substring(google_maps_uri from 'cid=([0-9]+)'), NULLIF(google_place_id, '')) AS pid,
              latitude::float8 AS lat, longitude::float8 AS lng,
              google_review_count AS rc, price_eur::float8 AS price, (best_rank IS NOT NULL) AS best,
              (image_url IS NOT NULL AND image_url LIKE ($2 || '%')) AS has_image
         FROM place_seed_raw`;
export const PID_ROWS_WHERE = `city_id=$1 AND ((google_place_id IS NOT NULL AND google_place_id <> '') OR google_maps_uri LIKE '%cid=%')
       AND seed_category NOT LIKE 'bts_%'`;
