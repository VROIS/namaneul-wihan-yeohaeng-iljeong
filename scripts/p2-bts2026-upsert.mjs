import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

const CITY_SLUG = process.argv[2] || "elpaso";
const SUPA_URL =
  process.env.SUPA_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL;
if (!SUPA_URL) {
  console.error("❌ SUPA_URL/DATABASE_URL 미설정");
  process.exit(1);
}

const sqlDir = `scripts/sql/${CITY_SLUG}-bts2026`;
if (!fs.existsSync(sqlDir)) {
  console.error(`❌ ${sqlDir} 미존재`);
  process.exit(1);
}

const files = fs
  .readdirSync(sqlDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
console.log(`📂 ${sqlDir}: ${files.length} files`);
files.forEach((f) => console.log(`   - ${f}`));

const db = new pg.Client({
  connectionString: SUPA_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();
console.log("✅ DB 연결 OK");

try {
  await db.query("BEGIN");
  console.log("🔒 트랜잭션 시작\n");

  for (const f of files) {
    const sql = fs.readFileSync(path.join(sqlDir, f), "utf8");
    const t0 = Date.now();
    const result = await db.query(sql);
    const dt = Date.now() - t0;
    console.log(`   ✓ ${f}: rowCount=${result.rowCount} (${dt}ms)`);
  }

  await db.query("COMMIT");
  console.log("\n✅ COMMIT 완료\n");

  const verify = await db.query(
    `
    SELECT seed_category, COUNT(*) AS rows,
      COUNT(*) FILTER (WHERE source_type IS NOT NULL) AS source_typed,
      COUNT(*) FILTER (WHERE evidence_verified=true) AS verified,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS has_coord,
      COUNT(*) FILTER (WHERE google_review_count IS NOT NULL) AS has_review_count
    FROM place_seed_raw
    WHERE city_id=(SELECT id FROM cities WHERE LOWER(REPLACE(name_en,' ','')) = $1 LIMIT 1)
      AND collection_phase='bts2026'
    GROUP BY seed_category ORDER BY seed_category
  `,
    [CITY_SLUG.toLowerCase()],
  );
  console.log("📊 검증 결과:");
  console.table(verify.rows);
} catch (e) {
  await db.query("ROLLBACK");
  console.error("❌ ROLLBACK:", e.message);
  process.exit(1);
} finally {
  await db.end();
}
