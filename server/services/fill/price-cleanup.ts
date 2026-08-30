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
const fixFood = argv["fix-food"] === "true";
if (!cityId) {
  console.error("Usage: --city-id=<N> [--fix-food] [--apply]");
  process.exit(1);
}

const ENTRANCE_CATS = [
  "heritage",
  "attraction",
  "hotspot",
  "healing",
  "adventure",
];
const TOP_N = 20;

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
  console.log(
    `═══ price-cleanup (city ${cityId} ${city.name_en}) ${apply ? "[APPLY]" : "[DRY]"} ═══`,
  );

  const nullRows = (
    await c.query(
      `SELECT seed_category, count(*)::int n FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND price_eur IS NULL AND rank <= $3 GROUP BY 1 ORDER BY 2 DESC`,
      [cityId, ENTRANCE_CATS, TOP_N],
    )
  ).rows;
  const totalNull = nullRows.reduce((s: number, r: any) => s + r.n, 0);
  console.log(
    `\n[A] 비식당 입장료 NULL → 0 (대상: ${ENTRANCE_CATS.join("/")}, rank≤${TOP_N})`,
  );
  for (const r of nullRows) console.log(`  ${r.seed_category}: ${r.n}곳`);
  console.log(`  합계 ${totalNull}곳 → 0(무료) 처리`);
  console.log(
    `  (제외: shopping=입장료 개념 없음 / restaurant=매트릭스 폴백 정당 / rank>${TOP_N}=여정 미노출)`,
  );

  const foodRows = (
    await c.query(
      `SELECT id, name_en, seed_category, rank, price_eur, summary_ko FROM place_seed_raw
     WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND price_eur > 0 AND rank <= $3
       AND (summary_ko ILIKE '%타파스%' OR summary_ko ILIKE '%맛볼%' OR summary_ko ILIKE '%식사%' OR summary_ko ILIKE '%스트리트 푸드%' OR summary_ko ILIKE '%먹거리%')
     ORDER BY seed_category, rank`,
      [cityId, ENTRANCE_CATS, TOP_N],
    )
  ).rows;
  console.log(
    `\n[B] 비식당 식비 오염 의심 (입장료칸에 식비, rank≤${TOP_N}) = ${foodRows.length}곳 ${fixFood ? "(--fix-food = 0 정정)" : "(보고만)"}`,
  );
  for (const r of foodRows)
    console.log(
      `  [${r.seed_category}] rank=${r.rank} €${r.price_eur} | ${r.name_en} — ${(r.summary_ko || "").slice(0, 38)}`,
    );

  if (!apply) {
    console.log("\n=== DRY (--apply 로 실행) ===");
    await c.end();
    return;
  }

  await c.query("BEGIN");
  try {
    const a = await c.query(
      `UPDATE place_seed_raw SET price_eur = 0, updated_at = now()
       WHERE city_id=$1 AND seed_category = ANY($2::text[]) AND price_eur IS NULL AND rank <= $3`,
      [cityId, ENTRANCE_CATS, TOP_N],
    );
    console.log(`\n✓ [A] NULL→0 적용: ${a.rowCount}행`);
    if (fixFood && foodRows.length) {
      const ids = foodRows.map((r: any) => r.id);
      const b = await c.query(
        `UPDATE place_seed_raw SET price_eur = 0, updated_at = now() WHERE id = ANY($1::int[])`,
        [ids],
      );
      console.log(
        `✓ [B] 식비오염 → 0 정정: ${b.rowCount}행 (입장료 = 무료, 식비는 식당 카테고리에서만)`,
      );
    }
    await c.query("COMMIT");
    console.log("✓ COMMIT (DELETE 0, shopping/restaurant 무변경)");
  } catch (e: any) {
    await c.query("ROLLBACK");
    console.error("✗ ROLLBACK:", e.message);
    await c.end();
    process.exit(1);
  }
  await c.end();
})();
