// 1 회용 = 603 BAD_NAME 행 일괄 archive (= 사용자 SSOT 2026-05-14)
// = phase_tags 에 'archived-bad-name-2026-05-14' 추가
// = DELETE 절대 X (= CLAUDE.md §5)
// = 운영 SELECT 시 = WHERE NOT (archived-bad-name) 으로 자연스럽게 제외

import pg from "pg";
import fs from "fs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");

const raw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// BAD_NAME 패턴 (= merge 스크립트와 동일)
const BAD_NAME_EXACT = new Set([
  "paris",
  "london",
  "madrid",
  "munich",
  "berlin",
  "frankfurt",
  "tenerife",
  "rome",
  "manhattan",
  "brooklyn",
  "queens",
  "polanco",
  "halal",
  "soul food",
  "malagasy cuisine",
  "japanese food",
  "italian food",
  "indonesian cuisine",
  "northern irish cuisine",
  "chinese food",
  "mexican food",
  "french cuisine",
  "thai food",
  "vietnamese food",
  "korean food",
  "turkish food",
  "spanish cuisine",
  "german cuisine",
  "architecture of paris",
  "architecture of london",
  "architecture of madrid",
  "old sacramento state historic park",
  "pigalle, paris",
  "crocker-amazon, san francisco",
  "nob hill, san francisco",
  "pigalle",
  "financial district, los angeles",
  "financial district, new york",
  "brandenburg gate",
  "hearst tower (manhattan)",
  "parc merveilleux",
  "a' famosa resort",
  "six flags over georgia",
  "museum",
  "restaurant",
  "cafe",
  "bar",
  "park",
  "garden",
  "church",
  "fast food",
  "fine dining",
]);

const isBadName = (name) => {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  if (BAD_NAME_EXACT.has(lower)) return true;
  if (lower.split(/\s+/).length === 1 && lower.length <= 8) {
    if (
      /^(halal|kosher|asian|french|italian|japanese|chinese|mexican|german|spanish|thai)$/.test(
        lower,
      )
    )
      return true;
  }
  const inParen = name.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
  if (
    inParen &&
    /^(manhattan|brooklyn|berlin|frankfurt|tokyo|seoul|nyc|sf)$/.test(inParen)
  )
    return true;
  if (/^[a-zàâäçèéêëîïôûùüÿñ\s-]+\s+(cuisine|food)$/i.test(lower)) return true;
  if (/^architecture of\s+/i.test(lower)) return true;
  if (
    /^[a-z\s-]+,\s+(paris|london|madrid|munich|new york|los angeles|san francisco|berlin|rome|tokyo|seoul|chicago)$/i.test(
      lower,
    )
  )
    return true;
  return false;
};

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const rows = (
  await c.query(`
  SELECT id, name_en, city_id, phase_tags
  FROM place_seed_raw
  WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
`)
).rows;

const badRows = rows.filter((r) => isBadName(r.name_en));
console.log(`═══ BAD_NAME archive ${COMMIT ? "⚠️ --commit" : "dry-run"} ═══`);
console.log(`전체 활성 행 = ${rows.length}`);
console.log(`BAD_NAME 행 = ${badRows.length}`);

if (!COMMIT) {
  console.log(`\n샘플 (첫 5):`);
  for (const r of badRows.slice(0, 5))
    console.log(`  id=${r.id} "${r.name_en}"`);
  console.log(`\n... --commit 으로 실행 시 = ${badRows.length} 행 archive`);
} else {
  console.log(`\n진행 중...`);
  // 트랜잭션 = 한 번에 처리
  await c.query("BEGIN");
  try {
    let count = 0;
    for (const r of badRows) {
      await c.query(
        `
        UPDATE place_seed_raw SET
          phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['archived-bad-name-2026-05-14']::text[])))
        WHERE id = $1
      `,
        [r.id],
      );
      count++;
      if (count % 100 === 0)
        process.stdout.write(`\r  ${count}/${badRows.length}`);
    }
    await c.query("COMMIT");
    console.log(`\n  ✅ COMMIT = ${count} 행 archived`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("  ❌ ROLLBACK:", e.message);
    throw e;
  }
}

// 검증 = 도시별 archived 분포
const after = (
  await c.query(`
  SELECT ci.name_en AS city, COUNT(*) AS archived
  FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
  WHERE 'archived-bad-name-2026-05-14' = ANY(COALESCE(p.phase_tags, ARRAY[]::text[]))
  GROUP BY 1 ORDER BY 2 DESC LIMIT 15
`)
).rows;
console.log("\n검증 = 도시별 BAD_NAME archived (상위 15):");
console.table(after);

const total = (
  await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE 'archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AS archived,
    COUNT(*) FILTER (WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store') AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))) AS active
  FROM place_seed_raw
`)
).rows[0];
console.log("\n전체:");
console.log(`  archived-bad-name = ${total.archived}`);
console.log(`  활성 (= 오늘 archived 모두 제외) = ${total.active}`);

await c.end();
