// ⚠️ 수정금지(승인필요) 2026-10-15 사장님 결정 = 필시티 읽은 뒤 탐지 = 구글맵 로그와 DB 로 장소 아님 남음·호텔 페이지·표가 못 정하는 행을 목록으로 뽑는다 · CID 가 다르면 다른 장소라 같은 장소 쌍은 뽑지 않는다(DB 쓰기 없음) (정본 §)
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  ROOT,
  connectDb,
  isLodgingPage,
  lastGoogleLogs,
  loadEnv,
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

  const file = path.join(reportDir(cityId), `${stamp()}_scan.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ cityId, hotelPages, notPlace, undecided }, null, 2),
  );
  console.log(
    `═══ 읽은 뒤 탐지 city ${cityId} = 호텔 페이지 ${hotelPages.length} · 장소 아님 남음 ${notPlace.length} · 표가 못 정하는 행 ${undecided.length} → ${path.relative(ROOT, file)} ═══`,
  );
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 읽은 뒤 탐지 실패:", e?.message || e);
  process.exit(1);
});
