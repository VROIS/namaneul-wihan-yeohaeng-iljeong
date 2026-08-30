// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 소속오염 행 격리 = 영구 컴포넌트(§16 fill/ 표준).
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
const onlyCity = Number(argv["city-id"] || 0) || null;
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(정규화) = --ids=a,b,c 수동지정 격리 = 자동탐지(거리·자기모순)로
const manualIds: number[] | null = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite)
  : null;
const TAG = "wrong-city-suspect";

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
  const { distanceKmFromCoords } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts")).href
  );

  const all = (
    await c.query(
      `SELECT p.id, p.city_id, ci.name_en AS city, p.name_en, p.seed_category, p.day_zone,
              p.latitude::float8 AS lat, p.longitude::float8 AS lng,
              p.distance_km_from_center::float8 AS dist_col,
              ci.latitude::float8 AS clat, ci.longitude::float8 AS clng
       FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
       WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
         AND p.latitude <> 0 AND p.longitude <> 0
         AND ci.latitude IS NOT NULL AND ci.longitude IS NOT NULL
         AND p.seed_category NOT LIKE 'bts%'
         ${onlyCity ? "AND p.city_id = $1" : ""}
       ORDER BY p.city_id, p.id`,
      onlyCity ? [onlyCity] : [],
    )
  ).rows;
  const rows = manualIds
    ? (
        await c.query(
          `SELECT p.id, p.city_id, ci.name_en AS city, p.name_en, p.seed_category, p.day_zone,
                  NULL::float8 AS dist_col
           FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
           WHERE p.id = ANY($1::bigint[])`,
          [manualIds],
        )
      ).rows.map((r: any) => {
        r._realKm = 0;
        r._why = "수동지정";
        return r;
      })
    : all.filter((r: any) => {
        const realKm = distanceKmFromCoords(r.clat, r.clng, r.lat, r.lng);
        const farOff = realKm > 100;
        const selfContradiction =
          r.dist_col != null && Math.abs(r.dist_col - realKm) > 100;
        (r as any)._realKm = realKm;
        (r as any)._why = farOff
          ? "소속오염"
          : selfContradiction
            ? "자기모순"
            : "";
        return farOff || selfContradiction;
      });

  console.log(
    `═══ 소속오염 격리 (${onlyCity ? "city " + onlyCity : "전 도시"}) = 대상 ${rows.length}행 ${apply ? "(APPLY)" : "(DRY)"} ═══`,
  );
  for (const r of rows) {
    console.log(
      `  [${(r as any)._why}] ${r.city}(${r.city_id}) id=${r.id} cat=${r.seed_category} zone=${r.day_zone} 거리컬럼=${r.dist_col} 실거리=${Math.round((r as any)._realKm)}km "${r.name_en}"`,
    );
  }
  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 격리 ===");
    await c.end();
    return;
  }

  let done = 0,
    viaSkip = 0,
    failed = 0;
  for (const r of rows) {
    const upd = `UPDATE place_seed_raw SET day_zone = NULL,
        phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['${TAG}'])))
      WHERE id = $1`;
    try {
      await c.query(upd, [r.id]);
      done++;
    } catch (e: any) {
      if (/\[중복차단\]/.test(e.message || "")) {
        try {
          await c.query("BEGIN");
          await c.query("SELECT set_config('app.skip_dup_check','on',true)");
          await c.query(upd, [r.id]);
          await c.query("COMMIT");
          done++;
          viaSkip++;
        } catch (e2: any) {
          await c.query("ROLLBACK").catch(() => {});
          failed++;
          console.log(`  ✗ id=${r.id} 격리 실패: ${e2.message}`);
        }
      } else {
        failed++;
        console.log(`  ✗ id=${r.id} 격리 실패: ${e.message}`);
      }
    }
  }
  console.log(
    `\n═══ 격리 결과 = ${done}행 (검문면제 경유 ${viaSkip}) / 실패 ${failed} ═══`,
  );
  await c.end();
})();
