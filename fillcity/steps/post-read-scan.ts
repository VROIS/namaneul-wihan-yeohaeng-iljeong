// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 읽은 뒤 탐지 = 구글맵 로그와 DB 로 장소 아님 남음·같은 장소 두 행·호텔 페이지·표가 못 정하는 행을 목록으로 뽑는다(DB 쓰기 없음) (정본 §)
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  ROOT,
  connectDb,
  isLodgingPage,
  lastGoogleLogs,
  loadEnv,
  nameTokens,
  parseArgs,
  reportDir,
  roomRateEur,
  stamp,
} from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N>");
    process.exit(1);
  }
  const { finalCategory, categoriesOfLabel } = await import(
    pathToFileURL(
      path.join(ROOT, "worker/lib/services/shared/place-category-map.ts"),
    ).href
  );
  const { distanceKmFromCoords } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/geo-distance.ts"))
      .href
  );
  const c = await connectDb();
  const rows = (
    await c.query(
      `SELECT id, name_en, name_local, name_ko, seed_category AS cat, google_primary_type AS label,
              latitude::float8 AS lat, longitude::float8 AS lng, price_eur::float8 AS price,
              summary_ko, editorial_summary, google_review_count AS rc, best_rank,
              substring(google_maps_uri from 'cid=([0-9]+)') AS cid, phase_tags
         FROM place_seed_raw
        WHERE city_id=$1 AND status='active' AND seed_category NOT LIKE 'bts%'
          AND (business_status IS NULL OR business_status NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY'))`,
      [cityId],
    )
  ).rows;
  const logs = lastGoogleLogs(cityId);

  // ① 호텔 페이지 = 숙박 위젯 + 숙소 분류 글자 · 로그 글 맨 위 객실 요금과 저장 가격 · 제미니 묘사 유무
  const hotelPages = rows
    .filter((r: any) => r.cat !== "hotel")
    .map((r: any) => ({ r, raw: String(logs.get(r.id)?.rawText || "") }))
    .filter(({ raw }: any) => raw && isLodgingPage(raw))
    .map(({ r, raw }: any) => ({
      id: r.id,
      name: r.name_en,
      cat: r.cat,
      price: r.price,
      roomRate: roomRateEur(raw),
      descEmpty: ![r.summary_ko, r.editorial_summary].some(
        (x) => x && String(x).trim(),
      ),
      curated: (r.phase_tags || []).some((t: string) =>
        /discover-perlang/.test(t),
      ),
    }));

  // ② 장소 아님이 남은 행 = 표가 장소 아님으로 보는 글자(인기라 안 지워진 것 포함)
  const notPlace = rows
    .filter(
      (r: any) =>
        r.label &&
        finalCategory(r.cat, r.label, { best: r.best_rank != null }).notPlace,
    )
    .map((r: any) => ({
      id: r.id,
      name: r.name_en,
      label: r.label,
      rc: r.rc,
    }));

  // ③ 표가 못 정하는 행 = 구글 분류 글자가 없거나 표에 없는 글자(에이전트가 읽을 몫)
  const undecided = rows
    .filter(
      (r: any) =>
        r.cat !== "hotel" &&
        (!r.label || categoriesOfLabel(r.label).length === 0),
    )
    .map((r: any) => ({
      id: r.id,
      name: r.name_en,
      label: r.label,
      cat: r.cat,
    }));

  // ④ 같은 장소 두 행(다른 CID) = 이름 낱말이 거의 같고 150m 안, 또는 좌표 20m 안 + 이름 낱말 하나 이상 겹침
  const dup: any[] = [];
  const sorted = rows
    .filter((r: any) => r.lat != null && r.lng != null)
    .sort((a: any, b: any) => a.lat - b.lat);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if ((b.lat - a.lat) * 111.32 > 0.15) break;
      if (a.cid && b.cid && a.cid === b.cid) continue;
      const km = distanceKmFromCoords(a.lat, a.lng, b.lat, b.lng);
      if (km > 0.15) continue;
      const ta = new Set(nameTokens(a.name_en));
      const tb = nameTokens(b.name_en);
      if (!ta.size || !tb.length) continue;
      const common = tb.filter((w) => ta.has(w)).length;
      const ratio = common / Math.max(ta.size, tb.length);
      if (ratio >= 0.6 || (km <= 0.02 && common >= 1))
        dup.push({
          a: { id: a.id, name: a.name_en, cat: a.cat },
          b: { id: b.id, name: b.name_en, cat: b.cat },
          meters: Math.round(km * 1000),
        });
    }
  }

  const file = path.join(reportDir(cityId), `${stamp()}_scan.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ cityId, hotelPages, notPlace, undecided, dup }, null, 2),
  );
  console.log(
    `═══ 읽은 뒤 탐지 city ${cityId} = 호텔 페이지 ${hotelPages.length} · 장소 아님 남음 ${notPlace.length} · 표가 못 정하는 행 ${undecided.length} · 같은 장소 두 행 ${dup.length}쌍 → ${path.relative(ROOT, file)} ═══`,
  );
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 읽은 뒤 탐지 실패:", e?.message || e);
  process.exit(1);
});
