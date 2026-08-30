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

const MOVES: Record<number, { name: string; to: string }[]> = {
  37: [
    { name: "Movistar Arena", to: "attraction" },
    { name: "La Chinata", to: "shopping" },
  ],
};

const EXCLUDE_BTS = ["bts_venue", "bts_army_zone", "bts_merch_store"];

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

  const moves = MOVES[cityId] || [];
  console.log(
    `═══ category-move (city ${cityId} ${city.name_en}) = 이동 후보 ${moves.length}건 ${apply ? "[APPLY]" : "[DRY]"} ═══`,
  );
  if (!moves.length) {
    console.log("  이동 목록 없음 (= MOVES 에 도시 미등록)");
    await c.end();
    return;
  }

  if (apply) await c.query("BEGIN");
  try {
    for (const mv of moves) {
      if (EXCLUDE_BTS.includes(mv.to)) {
        console.warn(
          `  ✗ skip: ${mv.name} → ${mv.to} (BTS 카테고리 이동 금지)`,
        );
        continue;
      }
      const rows = (
        await c.query(
          `SELECT id, seed_category, rank, google_place_id, google_review_count FROM place_seed_raw
         WHERE city_id=$1 AND seed_category NOT IN (${EXCLUDE_BTS.map((_, i) => `$${i + 3}`).join(",")}) AND LOWER(TRIM(name_en)) = LOWER(TRIM($2))`,
          [cityId, mv.name, ...EXCLUDE_BTS],
        )
      ).rows;
      if (!rows.length) {
        console.warn(
          `  ✗ 미발견: "${mv.name}" (= 이미 이동됐거나 이름 불일치)`,
        );
        continue;
      }
      for (const r of rows) {
        if (r.seed_category === mv.to) {
          console.log(`  = 이미 ${mv.to}: ${mv.name} (id=${r.id}) skip`);
          continue;
        }
        const maxRank = (
          await c.query(
            `SELECT COALESCE(MAX(rank), 0)::int AS m FROM place_seed_raw WHERE city_id=$1 AND seed_category=$2`,
            [cityId, mv.to],
          )
        ).rows[0].m;
        const newRank = maxRank + 1;
        console.log(
          `  ${apply ? "✓" : "·"} ${mv.name} (id=${r.id}) : ${r.seed_category}#${r.rank} → ${mv.to}#${newRank} (RC=${r.google_review_count ?? "NULL"})`,
        );
        if (apply) {
          await c.query(
            `UPDATE place_seed_raw SET seed_category=$1, rank=$2,
               phase_tags = (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(phase_tags, '{}') || ARRAY['recat-2026-06-12']) t),
               updated_at = now()
             WHERE id=$3`,
            [mv.to, newRank, r.id],
          );
        }
      }
    }
    if (apply) {
      await c.query("COMMIT");
      console.log("✓ 이동 완료 (DELETE 0 = 데이터 보존)");
    } else
      console.log(
        "\n=== DRY (--apply 로 실행). 이동 후 rc-rerank 권장 (이동처 RC 반영) ===",
      );
  } catch (e: any) {
    if (apply) await c.query("ROLLBACK");
    console.error("✗ ROLLBACK:", e.message);
    await c.end();
    process.exit(1);
  }
  await c.end();
})();
