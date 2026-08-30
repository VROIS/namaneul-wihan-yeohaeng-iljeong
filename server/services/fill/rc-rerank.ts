import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
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

const EXCLUDE = `seed_category NOT IN ('bts_army_zone','bts_merch_store')`;
const ORDER = `google_review_count DESC NULLS LAST, id`;

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  if (!city) {
    await c.end();
    console.error(`✗ city ${cityId} 미존재`);
    process.exit(1);
  }

  const prev = (
    await c.query(
      `
    WITH ranked AS (
      SELECT id, rank AS old_rank,
             ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY ${ORDER}) AS new_rank
      FROM place_seed_raw WHERE city_id=$1 AND ${EXCLUDE}
    )
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE old_rank IS DISTINCT FROM new_rank)::int AS changed FROM ranked`,
      [cityId],
    )
  ).rows[0];
  console.log(
    `═══ rc-rerank (city ${cityId} ${city.name_en}) = 대상 ${prev.total} / 변경예정 ${prev.changed} ═══`,
  );

  if (!apply) {
    const sample = (
      await c.query(
        `
      WITH ranked AS (
        SELECT id, seed_category, name_en, rank AS old_rank, google_review_count AS rc,
               ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY ${ORDER}) AS new_rank
        FROM place_seed_raw WHERE city_id=$1 AND ${EXCLUDE}
      )
      SELECT seed_category, new_rank, name_en, rc, old_rank FROM ranked
      WHERE seed_category IN ('hotspot','heritage') AND new_rank <= 8 ORDER BY seed_category, new_rank`,
        [cityId],
      )
    ).rows;
    console.log(
      "[DRY 미리보기 = hotspot/heritage TOP8 (새rank ← 옛rank | RC)]",
    );
    for (const r of sample)
      console.log(
        `  ${r.seed_category} #${r.new_rank} ← ${r.old_rank} | ${r.name_en} | RC ${r.rc ?? "NULL"}`,
      );
    console.log("\n=== DRY (--apply 로 실행) ===");
    await c.end();
    return;
  }

  await c.query("BEGIN");
  try {
    await c.query(
      `UPDATE place_seed_raw SET rank = -id WHERE city_id=$1 AND ${EXCLUDE}`,
      [cityId],
    );
    await c.query(
      `
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY ${ORDER}) AS rk
        FROM place_seed_raw WHERE city_id=$1 AND ${EXCLUDE}
      )
      UPDATE place_seed_raw SET rank = ranked.rk FROM ranked WHERE place_seed_raw.id = ranked.id`,
      [cityId],
    );
    await c.query("COMMIT");
    console.log(`✓ rerank 완료 = ${prev.total} 행 = 순수 RC DESC NULLS LAST`);
  } catch (e: any) {
    await c.query("ROLLBACK");
    console.error("✗ ROLLBACK:", e.message);
    await c.end();
    process.exit(1);
  }
  await c.end();
})();
