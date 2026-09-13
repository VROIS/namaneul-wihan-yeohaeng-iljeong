// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = PID·CID 행 페이지 재확인 루프 1벌 = CLI(gmaps-pid-identity)와 후처리 엔진(gmaps-post = 큐 소비자)이 같은 함수를 부른다. 브라우저는 밖에서 받는다(Node = playwright, Worker = Browser Run). 창 5개 병렬 (정본 §)
import { BROWSER_UA } from "./page-reader";
import {
  evaluateRow,
  initResult,
  nameTokens,
  type Result,
  type Row,
} from "./gates";
import { clearSuspectTags, pageWasRead, writeRow } from "./apply";

export const PID_PARALLEL = 5;

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
};

export async function verifyPidRows(o: VerifyPidOpts): Promise<Result[]> {
  const results: Result[] = [];
  const cityStop = nameTokens(o.city.name_en, new Set());
  const queue = [...o.rows];
  await Promise.all(
    Array.from({ length: Math.min(PID_PARALLEL, queue.length) }, async () => {
      const ctx = await o.browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: BROWSER_UA,
      });
      const page = await ctx.newPage();
      try {
        for (;;) {
          const row = queue.shift();
          if (!row) break;
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
          if (o.apply) {
            await writeRow(o.upsertPlace, o.cityId, row, r);
            if (pageWasRead(r) && !String(r.upsert || "").startsWith("error"))
              await clearSuspectTags(o.client, row.id);
          }
          results.push(r);
          o.onResult?.(r);
        }
      } finally {
        await ctx.close().catch(() => {});
      }
    }),
  );
  return results;
}

// PID·CID 행 조회 SQL 1벌 = 기준은 CID(있으면 CID 로 열고, 없을 때만 PID) · 사진은 구글(R2)만 사진으로 친다
export const PID_ROWS_SELECT = `SELECT id, seed_category, name_en, COALESCE('cid:' || substring(google_maps_uri from 'cid=([0-9]+)'), NULLIF(google_place_id, '')) AS pid,
              latitude::float8 AS lat, longitude::float8 AS lng,
              google_review_count AS rc,
              (image_url IS NOT NULL AND image_url LIKE ($2 || '%')) AS has_image
         FROM place_seed_raw`;
export const PID_ROWS_WHERE = `city_id=$1 AND ((google_place_id IS NOT NULL AND google_place_id <> '') OR google_maps_uri LIKE '%cid=%')
       AND seed_category NOT LIKE 'bts_%'`;
