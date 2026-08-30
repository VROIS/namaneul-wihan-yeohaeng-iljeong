// ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = day_zone 결손 백필 = 신규 영구 컴포넌트(§16 fill/ 표준).
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
const env = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
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
const apply = argv["apply"] === "true";
if (!cityId) {
  console.error("Usage: --city-id=<N> [--apply]");
  process.exit(1);
}

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString:
      process.env.SUPA_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const rows = (
    await c.query(
      `SELECT id, seed_category, name_en, distance_km_from_center::float8 AS dist
       FROM place_seed_raw
       WHERE city_id=$1 AND day_zone IS NULL AND distance_km_from_center IS NOT NULL
         AND seed_category NOT LIKE 'bts%'
       ORDER BY seed_category, id`,
      [cityId],
    )
  ).rows;

  console.log(`═══ day_zone 백필 (city ${cityId}) ═══`);
  console.log(`대상(day_zone NULL + 거리있음) = ${rows.length}행`);
  const byCat: Record<string, number> = {};
  for (const r of rows)
    byCat[r.seed_category] = (byCat[r.seed_category] || 0) + 1;
  console.log("카테고리별:", byCat);

  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 반영 ===");
    await c.end();
    return;
  }

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  const { zoneForDistanceKm } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts")).href
  );
  let done = 0,
    failed = 0,
    outOfRange = 0;
  for (const r of rows) {
    // ⚠️ 2026-08-18 사장님 승인 = 100km 초과 = zone 부여 안 함(zoneForDistanceKm null = 오염의심 행 노출 차단).
    const zone = zoneForDistanceKm(r.dist);
    if (!zone) {
      outOfRange++;
      console.log(
        `  ⏭️ id=${r.id} "${r.name_en}" 거리 ${r.dist}km = 100km 초과 = 구역 미부여(오염의심)`,
      );
      continue;
    }
    try {
      await upsertPlace({
        targetRowId: r.id,
        cityId,
        seedCategory: r.seed_category,
        nameEn: r.name_en,
        dayZone: zone,
      });
      done++;
    } catch (e: any) {
      failed++;
      console.log(`  ✗ id=${r.id} 실패: ${e.message}`);
    }
  }
  console.log(
    `\n═══ 결과 = ${done}행 반영 / ${failed}행 실패 / ${outOfRange}행 100km초과 미부여 ═══`,
  );
  await c.end();
})();
