// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = MIX·발굴·재검증 공통 후처리 엔진 1벌 = "아직 구글맵 페이지로 검증 안 된 행"을 골라 구글맵을 직접 열어 7요소(이미지·이름·주소·리뷰수·분류·영업상태·좌표)+CID+검증 스탬프를 채운다. PID/CID 있으면 페이지 직행, 없거나 직행 페이지가 빈 등록이면 이름·주소 검색. 새 CID 쓰기는 검문 통과 = 같은 CID 행이 있으면 원행 흡수. 브라우저·DB 연결은 밖에서 받는다(Node CLI = playwright+pg / Worker 큐 소비자 = Browser Run+Hyperdrive). 유료 0 (정본 §)
import { distanceKmFromCoords } from "../shared/geo-distance";
import { PHOTO_MAX_WIDTH_PX } from "../shared/ts-client";
import { BROWSER_UA } from "./gmaps-pid-identity/page-reader";
import type { Result, Row } from "./gmaps-pid-identity/gates";
import { PID_ROWS_SELECT, verifyPidRows } from "./gmaps-pid-identity/run";
import {
  absorbInto,
  LIMITED_WHY,
  loadPriceCtx,
  newStat,
  pageTools,
  provenanceTag,
  readAll,
  writeRead,
  type NewEntry,
  type Stat,
} from "./gmaps-shared";

// 장소 아님 = 삭제(껍데기 0). 엔진 1벌(place-upsert)을 늦게 불러 순환 참조를 피한다.
const deleteRow = async (id: number) =>
  (await import("../place-upsert")).deletePlaceRow(id);

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 시드발굴 v3 ④(구글맵 확정·입력)도 이 엔진에서 돈다 = B1 산출표(R2)의 "있음"은 구글맵을 안 열고 그 행에 흡수(베스트·번역·제미니 몫), "신규"만 구글맵으로 7요소 갖춰 넣고, 발굴 한 판 raw 1파일(§18) (정본 §)
export async function insertSeedEntries(o: {
  client: Client;
  browser: any;
  cityId: number;
  report: any;
  reportKey: string;
  upsertPlace: any;
  log?: (line: string) => void;
}): Promise<Stat> {
  const log = o.log ?? ((l: string) => console.log(l));
  const { client: c, cityId, report } = o;
  const sections = [report.report?.landmarks, report.report?.restaurants];
  if (!sections.every((s) => Array.isArray(s?.confirm)))
    throw new Error("B1 산출표에 confirm 목록 없음");
  const nowCount = Number(
    (
      await c.query(
        "SELECT count(*)::int AS n FROM place_seed_raw WHERE city_id=$1",
        [cityId],
      )
    ).rows[0].n,
  );
  if (Number(report.psrCountBefore ?? -1) !== nowCount)
    throw new Error(
      `B1 산출표가 낡음(창고 ${report.psrCountBefore}행 시점, 지금 ${nowCount}행) = discovery-merge-diff 재실행 필요`,
    );
  const 있음: NewEntry[] = sections.flatMap((s) => s.confirm);
  const 신규: NewEntry[] = sections.flatMap((s) => s.new);
  log(
    `▶ v3 ④ city ${cityId}: 있음 ${있음.length}(안 엶 = 그 행에 흡수) · 신규 ${신규.length} → 구글맵 열기 (유료 0)`,
  );
  const stat = newStat();
  const tag = provenanceTag(new Date().toISOString().slice(0, 10));
  for (const n of 있음)
    await absorbInto(c, o.upsertPlace, n, { cityId, provenanceTag: tag }, stat);
  if (!신규.length) return stat;
  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  const rawRows: any[] = [];
  const priceCtx = await loadPriceCtx(c, cityId);
  const reads = await readAll(
    o.browser,
    BROWSER_UA,
    신규,
    { ...pageTools(), cityId, cityNameEn: city?.name_en, rawRows, priceCtx },
    stat,
  );
  for (const r of reads)
    await writeRead(
      c,
      o.upsertPlace,
      r,
      { cityId, provenanceTag: tag, priceCtx },
      stat,
    );
  const { saveRaw } = await import("../shared/save-raw");
  await saveRaw({
    source: "gmaps",
    contextId: cityId,
    tag: "discovery-insert",
    request: {
      cityId,
      reportKey: o.reportKey,
      generatedAt: report.generatedAt,
      restaurantMinLangs: report.restaurantMinLangs ?? null,
      landmarkMinLangs: report.landmarkMinLangs ?? null,
    },
    raw: { summary: stat, report: report.report, rows: rawRows },
  } as any);
  log(
    `   ④ 완료: 신규 ${신규.length} → 확인·입력 ${stat.insertedNew + stat.absorbedHint + stat.absorbedOther}(신규행 ${stat.insertedNew} / 흡수 ${stat.absorbedHint + stat.absorbedOther}) · 못 갖춤 ${stat.noMatch} · 폐업 ${stat.closed} · 쓰기이상 ${stat.skipped} · 페이지 ${stat.pageOpens} · 제한보기 ${stat.limited}`,
  );
  if (stat.blocked)
    throw new Error(
      `${LIMITED_WHY}: 구글맵 제한 보기 연속 = 채널 막힘 = 남은 신규는 다음 판에`,
    );
  return stat;
}

// 대기 조건 = 페이지 검증이 없거나, 검증 뒤(10초 이후)에 행이 바뀌었거나, (검색까지 해봤는데 못 찾은 행이 아닌데) 사진이 구글(R2)이 아니거나 직행 페이지가 빈 등록(리뷰수·분류 없음)이었던 행 (bts_* 제외, active 만). $1 = R2 공개주소 접두
export const HOLLOW = `verify_source = 'gmaps-pid-page' AND COALESCE(google_review_count, 0) = 0 AND google_primary_type IS NULL`;
export const PENDING_WHERE = `status = 'active' AND seed_category NOT LIKE 'bts_%'
  AND (verify_source IS NULL OR verify_source NOT LIKE 'gmaps%' OR verified_at IS NULL OR updated_at > verified_at + interval '10 seconds'
       OR (verify_source <> 'gmaps-search-nomatch' AND (image_url IS NULL OR image_url NOT LIKE ($1 || '%') OR (${HOLLOW}))))`;

type Client = { query: (q: string, v?: unknown[]) => Promise<any> };
export type PostSummary = {
  cityId: number;
  pending: number;
  direct: number;
  search: number;
  pidResults: Result[];
  searchStat: Stat;
  left: number;
  ms: number;
};

export const r2PrefixOf = (r2PublicUrl: string | undefined) =>
  (r2PublicUrl || "").replace(/\/+$/, "") + "/";

// 창고 행 → 구글맵 이름·주소 검색 항목 1벌 = 후처리와 사전 정제가 같이 쓴다(__rowId = 그 행에 쓴다)
export const ROW_COLS = `id, name_en, name_local, name_ko, address, latitude::float AS lat, longitude::float AS lng, seed_category, price_eur, summary_ko, editorial_summary, (google_place_id IS NOT NULL OR google_maps_uri LIKE '%cid=%') AS direct, (best_rank IS NOT NULL) AS best`;
export const entryOfRow = (r: any): NewEntry =>
  ({
    name: r.name_en,
    nameLocal: r.name_local,
    nameKo: r.name_ko,
    langs: 1,
    cat: r.seed_category,
    avgPrice: r.price_eur,
    avgRank: null,
    copies: [
      { lang: "ko", summary: r.summary_ko, editorial: r.editorial_summary },
    ],
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    isBest: !!r.best,
    __rowId: r.id,
  }) as any;

export async function pendingByCity(
  c: Client,
  r2Prefix: string,
  onlyCity = 0,
): Promise<{ city_id: number; n: number; direct: number }[]> {
  return (
    await c.query(
      `SELECT city_id, count(*)::int n, count(*) FILTER (WHERE google_place_id IS NOT NULL OR google_maps_uri LIKE '%cid=%')::int direct FROM place_seed_raw WHERE ${PENDING_WHERE} ${onlyCity ? "AND city_id = $2" : ""} GROUP BY city_id ORDER BY n DESC`,
      onlyCity ? [r2Prefix, onlyCity] : [r2Prefix],
    )
  ).rows;
}

export async function runGmapsPost(o: {
  client: Client;
  browser: any;
  cityId: number;
  r2Prefix: string;
  upsertPlace: any;
  limit?: number;
  log?: (line: string) => void;
}): Promise<PostSummary> {
  const t0 = Date.now();
  const log = o.log ?? ((l: string) => console.log(l));
  const { client: c, cityId, r2Prefix } = o;
  const city = (
    await c.query(
      "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  if (!city) throw new Error(`city ${cityId} 미존재`);
  const rows = (
    await c.query(
      `SELECT ${ROW_COLS} FROM place_seed_raw WHERE city_id = $2 AND ${PENDING_WHERE} ORDER BY id ${o.limit ? "LIMIT " + o.limit : ""}`,
      [r2Prefix, cityId],
    )
  ).rows;
  const directIds: number[] = rows
    .filter((r: any) => r.direct)
    .map((r: any) => r.id);
  log(
    `▶ city ${cityId} ${city.name_en}: 대기 ${rows.length}행 (직행 ${directIds.length} · 검색 ${rows.length - directIds.length})`,
  );

  // ① PID/CID 행 = 페이지 직행(창 5개)
  let pidResults: Result[] = [];
  const priceCtx = await loadPriceCtx(c, cityId);
  if (directIds.length) {
    const pidRows: Row[] = (
      await c.query(
        `${PID_ROWS_SELECT} WHERE city_id=$1 AND id = ANY($3::int[]) ORDER BY id`,
        [cityId, r2Prefix, directIds],
      )
    ).rows;
    pidResults = await verifyPidRows({
      browser: o.browser,
      rows: pidRows,
      city,
      lang: "en",
      photoWidth: PHOTO_MAX_WIDTH_PX,
      distanceKmFromCoords,
      upsertPlace: o.upsertPlace,
      client: c,
      cityId,
      apply: true,
      writeCtx: { ...priceCtx, deleteRow },
      onResult: (r) =>
        log(
          `   ${r.gate} #${r.id} ${r.name_en} rc=${r.rc_page ?? "-"} ${r.upsert || ""}`,
        ),
    });
  }
  // ② 검색 경로 = PID·CID 없는 행 + 직행 페이지가 빈 등록이었던 행 = PID 는 지름길일 뿐, 진짜 등록의 CID 를 이름·주소로 찾는다
  const hollow: number[] = rows.length
    ? (
        await c.query(
          `SELECT id FROM place_seed_raw WHERE city_id = $1 AND id = ANY($2::int[]) AND status = 'active' AND ${HOLLOW}`,
          [cityId, rows.map((r: any) => r.id)],
        )
      ).rows.map((r: any) => r.id)
    : [];
  const search = rows.filter((r: any) => !r.direct || hollow.includes(r.id));
  const stat = newStat();
  if (search.length) {
    log(`▶ city ${cityId} 이름·주소 검색 ${search.length}행`);
    const reads = await readAll(
      o.browser,
      BROWSER_UA,
      search.map(entryOfRow),
      {
        ...pageTools(),
        cityId,
        cityNameEn: city.name_en,
        rawRows: [],
        priceCtx,
      },
      stat,
    );
    for (const rd of reads) {
      const targetRowId = (rd.n as any).__rowId;
      if (rd.why?.startsWith("장소아님")) {
        await deleteRow(targetRowId);
        log(`   🗑 #${targetRowId} ${rd.n.name} 삭제(${rd.why})`);
        continue;
      }
      await writeRead(
        c,
        o.upsertPlace,
        rd,
        { cityId, provenanceTag: "gmaps-post", targetRowId, priceCtx },
        stat,
      );
      // 검색으로도 못 찾은 행 = 그 사실을 스탬프로 남긴다(안 남기면 매 회 같은 검색을 반복) = 행이 바뀌면(updated_at) 다시 대상이 된다. 제한 보기는 못 찾은 것이 아니다 = 스탬프 없이 다음 판에
      if (rd.why && rd.why !== LIMITED_WHY)
        await o.upsertPlace({
          targetRowId,
          cityId,
          seedCategory: rd.n.cat,
          nameEn: rd.n.name,
          verifySource: "gmaps-search-nomatch",
        });
    }
    log(`   ${JSON.stringify(stat)}`);
  }
  // ③ 병합 행 정리 = 흡수로 남은 merged 행은 원행으로 옮기고 삭제(유령 0)
  const { purgeMergedRows } = await import("../place-upsert");
  const purged = await purgeMergedRows(cityId);
  if (purged.purged)
    log(`   병합 행 삭제 ${purged.purged} (${purged.ids.join(",")})`);
  const left = (
    await c.query(
      `SELECT count(*)::int n FROM place_seed_raw WHERE city_id = $2 AND ${PENDING_WHERE}`,
      [r2Prefix, cityId],
    )
  ).rows[0].n;
  const ms = Date.now() - t0;
  log(
    `═══ city ${cityId} 후처리 완료 ${(ms / 1000).toFixed(1)}s · 직행 ${pidResults.length} · 검색 ${search.length} · 남은 대기 ${left}행 ═══`,
  );
  return {
    cityId,
    pending: rows.length,
    direct: directIds.length,
    search: search.length,
    pidResults,
    searchStat: stat,
    left,
    ms,
  };
}
