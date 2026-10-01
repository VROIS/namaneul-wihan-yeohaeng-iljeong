// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = v3 ⑤ 검수 = 도시 상태표 1벌(임시 점검 스크립트 대신) = 분류별 칸 채움 · DB-only 전환 기준(손님상 120곳 + 베스트) · 손님상 구성(랜드마크·식당) · 식당 상·중·하(그 도시 분포 1벌) · 튀는 가격 · 결손(사진·CID·구글맵 도장)·같은 CID 쌍둥이 = 손님상 관문·전환 기준·분포는 엔진 1벌을 그대로 부른다 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const env = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
if (!cityId) {
  console.error("Usage: --city-id=<N>");
  process.exit(1);
}

(async () => {
  // 환경(.env)을 읽은 뒤에 엔진 DB·관문을 불러온다
  const { db } = await import("../worker/lib/db");
  if (!db) throw new Error("DB 연결 없음(SUPA_URL)");
  const { sql } = await import("drizzle-orm");
  const { placeSeedRaw } = await import("../shared/schema");
  const { READY_MIN_SERVABLE, readySql, servingGateSql } = await import(
    "../worker/lib/services/shared/pool-radius"
  );
  const { cityMealTiers } = await import(
    "../worker/lib/services/shared/meal-budget-tiers"
  );
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  console.log(`=== ${city?.name_en || "?"}(${cityId}) 현재 상태 ===\n`);

  const cat = (
    await c.query(
      `
    SELECT seed_category AS cat, COUNT(*) AS n,
      COUNT(*) FILTER (WHERE google_maps_uri LIKE '%cid=%') AS cid,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS coord,
      COUNT(*) FILTER (WHERE google_review_count IS NOT NULL) AS rc,
      COUNT(*) FILTER (WHERE price_eur IS NOT NULL) AS price,
      COUNT(*) FILTER (WHERE image_url ~ '/[0-9]+/images/') AS img,
      COUNT(*) FILTER (WHERE summary_ko IS NOT NULL AND summary_ko<>'') AS sumko
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND status='active'
    GROUP BY seed_category ORDER BY seed_category`,
      [cityId],
    )
  ).rows;
  const cols = ["cid", "coord", "rc", "price", "img", "sumko"];
  console.log(
    [
      "활성".padEnd(12),
      "n".padStart(4),
      ...cols.map((k) => k.padStart(6)),
    ].join(" "),
  );
  for (const r of cat)
    console.log(
      [
        String(r.cat).padEnd(12),
        String(r.n).padStart(4),
        ...cols.map((k) => String(r[k]).padStart(6)),
      ].join(" "),
    );

  const [mix] = await db
    .select({
      servable: sql<number>`COUNT(*)::int`,
      ready: sql<boolean>`${readySql()}`,
      best: sql<number>`COUNT(${placeSeedRaw.bestRank})::int`,
      lm: sql<number>`COUNT(*) FILTER (WHERE ${placeSeedRaw.seedCategory} <> 'restaurant')::int`,
      lmBest: sql<number>`COUNT(${placeSeedRaw.bestRank}) FILTER (WHERE ${placeSeedRaw.seedCategory} <> 'restaurant')::int`,
      rest: sql<number>`COUNT(*) FILTER (WHERE ${placeSeedRaw.seedCategory} = 'restaurant')::int`,
      restBest: sql<number>`COUNT(${placeSeedRaw.bestRank}) FILTER (WHERE ${placeSeedRaw.seedCategory} = 'restaurant')::int`,
    })
    .from(placeSeedRaw)
    .where(sql`${placeSeedRaw.cityId} = ${cityId} AND ${servingGateSql()}`);
  console.log(
    `\nDB-only 기준(손님상 ${READY_MIN_SERVABLE}곳 이상 + 베스트) = 손님상 ${mix.servable} · 베스트 ${mix.best} → ${mix.ready ? "통과" : "미달(MIX)"}`,
  );
  console.log(
    `손님상 구성 = 랜드마크 ${mix.lm}(베스트 ${mix.lmBest}) · 식당 ${mix.rest}(베스트 ${mix.restBest})`,
  );

  const tiers = await cityMealTiers(db, cityId);
  const prices: (number | null)[] = (
    await db
      .select({ p: sql<number | null>`${placeSeedRaw.priceEur}::float` })
      .from(placeSeedRaw)
      .where(
        sql`${placeSeedRaw.cityId} = ${cityId} AND ${placeSeedRaw.seedCategory} = 'restaurant' AND ${servingGateSql()}`,
      )
  ).map((r: { p: number | null }) => r.p);
  const priced = prices.filter((p): p is number => p != null && p > 0);
  const sorted = [...priced].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  if (tiers) {
    const lo = priced.filter((p) => p <= tiers.lo).length;
    const hi = priced.filter((p) => p > tiers.hi).length;
    console.log(
      `식당 상·중·하(그 도시 분포) = 하 €${Math.round(tiers.lo)} 이하 ${lo} · 중 ${priced.length - lo - hi} · 상 €${Math.round(tiers.hi)} 초과 ${hi} · 가격없음 ${prices.length - priced.length} · 튀는 가격(가운데값 €${Math.round(median)}의 3배 초과) ${priced.filter((p) => p > median * 3).length}`,
    );
  } else console.log("식당 상·중·하 = 분포 없음(가격 있는 식당 5곳 미만)");

  const def = (
    await c.query(
      `
    SELECT COUNT(*) FILTER (WHERE image_url IS NULL OR image_url !~ '/[0-9]+/images/') AS no_img,
           COUNT(*) FILTER (WHERE google_maps_uri IS NULL OR google_maps_uri NOT LIKE '%cid=%') AS no_cid,
           COUNT(*) FILTER (WHERE verify_source IS NULL OR verify_source NOT LIKE 'gmaps%') AS no_stamp,
           (SELECT COUNT(*) FROM (SELECT substring(google_maps_uri from 'cid=([0-9]+)') k FROM place_seed_raw
              WHERE city_id=$1 AND status='active' AND google_maps_uri LIKE '%cid=%' GROUP BY 1 HAVING COUNT(*) > 1) t) AS twins
    FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND status='active'`,
      [cityId],
    )
  ).rows[0];
  console.log(
    `결손(활성) = 구글사진없음 ${def.no_img} · CID없음 ${def.no_cid} · 구글맵도장없음 ${def.no_stamp} · 같은CID쌍둥이 ${def.twins}`,
  );
  // ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 검수에 가격·분류 칸 = 구글 분류 없음(페이지 안 연 행) · 표에 없는 글자 · 장소 아님 남음 · 식당 가격 없음 (정본 §)
  const { finalCategory } = await import(
    "../worker/lib/services/shared/place-category-map"
  );
  const labels: { g: string | null; cat: string; n: number }[] = (
    await c.query(
      `SELECT google_primary_type AS g, seed_category AS cat, COUNT(*)::int AS n FROM place_seed_raw
        WHERE city_id=$1 AND seed_category NOT LIKE 'bts%' AND status='active' GROUP BY 1,2`,
      [cityId],
    )
  ).rows;
  let noLabel = 0,
    unknown = 0,
    notPlace = 0,
    misaligned = 0;
  const unknownSet = new Set<string>();
  for (const r of labels) {
    if (!r.g) {
      noLabel += r.n;
      continue;
    }
    const fc = finalCategory(r.cat, r.g);
    if (fc.notPlace) notPlace += r.n;
    else if (fc.unknownLabel) {
      unknown += r.n;
      unknownSet.add(r.g);
    } else if (fc.changed) misaligned += r.n;
  }
  console.log(
    `분류(활성) = 구글 분류 없음(페이지 안 연 행) ${noLabel} · 표에 없는 글자 ${unknown}행/${unknownSet.size}종 · 장소 아님 남음 ${notPlace} · 정렬 안 된 행 ${misaligned}`,
  );
  // ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 구글맵 읽기 로그 대조 = 도시 폴더 로그(행마다 가장 나중 것)와 활성 행을 맞춰 빠진 행·읽기가 막힌 행을 센다(누락 0 확인)
  {
    const dir = path.join(ROOT, "docs", "raw", String(cityId));
    const last = new Map<number, any>();
    if (fs.existsSync(dir))
      for (const f of fs
        .readdirSync(dir)
        .filter((f) => /_gmaps-page-read-\d+\.json$/.test(f))
        .sort())
        for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"))
          ?.raw?.rows ?? [])
          last.set(Number(r.id), r);
    const ids: number[] = (
      await c.query(
        "SELECT id FROM place_seed_raw WHERE city_id=$1 AND status='active' AND seed_category NOT LIKE 'bts_%'",
        [cityId],
      )
    ).rows.map((r: any) => r.id);
    const missing = ids.filter((id) => !last.has(id));
    const bad = ids.filter((id) =>
      /^(limited-view|h1-empty|consent-blocked|error)/.test(
        String(last.get(id)?.gate ?? ""),
      ),
    );
    console.log(
      `구글맵 읽기 로그 대조 = 활성 ${ids.length}행 · 로그 없는 행 ${missing.length} · 마지막 읽기가 막힌 행 ${bad.length}`,
    );
    if (missing.length)
      console.log(`  로그 없는 행 = ${missing.slice(0, 40).join(",")}`);
    if (bad.length) console.log(`  막힌 행 = ${bad.slice(0, 40).join(",")}`);
  }
  await c.end();
  process.exit(0);
})();
