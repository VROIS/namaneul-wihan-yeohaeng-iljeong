// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = MIX·발굴·재검증 공통 후처리 엔진 1벌 = "아직 구글맵 페이지로 검증 안 된 행"을 골라 구글맵을 직접 열어 7요소(이미지·이름·주소·리뷰수·분류·영업상태·좌표)+CID+검증 스탬프를 채운다. PID/CID 있으면 페이지 직행, 없거나 직행 페이지가 빈 등록이면 이름·주소 검색. 새 CID 쓰기는 검문 통과 = 같은 CID 행이 있으면 원행 흡수. 브라우저·DB 연결은 밖에서 받는다(Node CLI = playwright+pg / Worker 큐 소비자 = Browser Run+Hyperdrive). 유료 0 (정본 §)
import { distanceKmFromCoords } from "../shared/geo-distance";
import { PHOTO_MAX_WIDTH_PX } from "../shared/ts-client";
import { BROWSER_UA } from "./gmaps-pid-identity/page-reader";
import type { Result, Row } from "./gmaps-pid-identity/gates";
import {
  limitedCount,
  PID_ROWS_SELECT,
  verifyPidRows,
} from "./gmaps-pid-identity/run";
import { absorbInto } from "./gmaps-absorb";
import {
  LIMITED_WHY,
  loadPriceCtx,
  newStat,
  pageTools,
  provenanceTag,
  readAll,
  writeRead,
  type NewEntry,
  type Read,
  type Stat,
} from "./gmaps-shared";

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
  onRead?: (r: Read) => Promise<void> | void; // 읽은 결과를 창고에 쓴 직후 호출(넣은 행 번호는 r.rowId) = ④ 판정 장부 재료
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
  for (const r of reads) {
    await writeRead(
      c,
      o.upsertPlace,
      r,
      { cityId, provenanceTag: tag, priceCtx },
      stat,
    );
    if (o.onRead) await o.onRead(r);
  }
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

export const HOLLOW = `verify_source = 'gmaps-pid-page' AND COALESCE(google_review_count, 0) = 0 AND google_primary_type IS NULL`;
// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 대기 조건 1벌 = 워커 큐는 "검증 뒤 행이 바뀜(updated_at)" 조건 포함, 필시티 목록 후처리(한 판 안에서 돌고 인증 뒤 같은 단계를 다시 돈다)는 그 조건 없이 구글맵 도장이 없는 행(+사진 없음·빈 등록)만 = 이어 읽기는 남은 행만 (정본 §)
const pendingWhere = (withUpdated: boolean) =>
  `status = 'active' AND seed_category NOT LIKE 'bts_%'
  AND (verify_source IS NULL OR verify_source NOT LIKE 'gmaps%' OR verified_at IS NULL${withUpdated ? " OR updated_at > verified_at + interval '10 seconds'" : ""}
       OR (verify_source <> 'gmaps-search-nomatch' AND (image_url IS NULL OR image_url NOT LIKE ($1 || '%') OR (${HOLLOW}))))`;
export const PENDING_WHERE = pendingWhere(true);
export const PENDING_WHERE_FILL = pendingWhere(false);

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
  parallel?: number; // 창 수(기본 5) = 큐 소비자는 1로 천천히
  fill?: boolean; // 필시티 한 판 안(목록 후처리) = PENDING_WHERE_FILL(갱신 시각 조건 없음 = 이어 읽기는 남은 행만)
  log?: (line: string) => void;
}): Promise<PostSummary> {
  const t0 = Date.now();
  const log = o.log ?? ((l: string) => console.log(l));
  const { client: c, cityId, r2Prefix } = o;
  const PENDING = o.fill ? PENDING_WHERE_FILL : PENDING_WHERE;
  const city = (
    await c.query(
      "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  if (!city) throw new Error(`city ${cityId} 미존재`);
  const rows = (
    await c.query(
      `SELECT ${ROW_COLS} FROM place_seed_raw WHERE city_id = $2 AND ${PENDING} ORDER BY id ${o.limit ? "LIMIT " + o.limit : ""}`,
      [r2Prefix, cityId],
    )
  ).rows;
  const directIds: number[] = rows
    .filter((r: any) => r.direct)
    .map((r: any) => r.id);
  log(
    `▶ city ${cityId} ${city.name_en}: 대기 ${rows.length}행 (직행 ${directIds.length} · 검색 ${rows.length - directIds.length})`,
  );

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
      parallel: o.parallel,
      onResult: (r) =>
        log(
          `   ${r.gate} #${r.id} ${r.name_en} rc=${r.rc_page ?? "-"} ${r.upsert || ""}`,
        ),
    });
    // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 필시티 한 판 안(fill)에서만 사람 인증(제한 보기)을 위로 던진다(종료 코드 3 → 알림 → 1분 → 같은 단계 재실행 = 남은 행부터) · 워커 후처리 큐는 제한 보기 행을 건너뛰고 검색 경로까지 계속 돈다(도시 전체가 멈추지 않는다) (정본 §)
    if (o.fill && pidResults.some((r) => r.gate === "limited-view"))
      throw new Error(
        `${LIMITED_WHY}: 구글맵 제한 보기 = 사람 인증 = 남은 ${rows.length - pidResults.length + limitedCount(pidResults)}행은 인증 뒤 이어 읽기`,
      );
  }
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
        parallel: o.parallel,
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
  const { purgeMergedRows } = await import("../place-upsert");
  const purged = await purgeMergedRows(cityId);
  if (purged.purged)
    log(`   병합 행 삭제 ${purged.purged} (${purged.ids.join(",")})`);
  const left = (
    await c.query(
      `SELECT count(*)::int n FROM place_seed_raw WHERE city_id = $2 AND ${PENDING}`,
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
