// 엘파소 v3 7 카테고리 → consolidated 161 row → DB DELETE + INSERT (직접 pg 연결)
// 사용자 2026-04-27 v4: 1 row × 1 primary category × 1 rank + multi-tag
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

// IPv6 강제 (Supabase 직접 URL = IPv6 만 있는 경우)
import dns from 'dns';
dns.setDefaultResultOrder('ipv6first');

const SUPA_URL = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPA_URL;
if (!SUPA_URL) { console.error('❌ DATABASE_URL 미설정'); process.exit(1); }
console.log('🔌 직접 연결 시도 (IPv6 우선)');

const tmpDir = (process.env.TEMP || process.env.TMP || './').split('\\').join('/');
const FILES = [
  'elpaso-00-delete.sql',
  'elpaso-01-attraction.sql',
  'elpaso-02-restaurant.sql',
  'elpaso-03-healing.sql',
  'elpaso-04-adventure.sql',
  'elpaso-05-hotspot.sql',
  'elpaso-06-heritage.sql',
  'elpaso-07-shopping.sql',
];

const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('✅ DB 연결 OK');

try {
  await db.query('BEGIN');
  console.log('🔒 트랜잭션 시작');

  for (const fname of FILES) {
    const fp = `${tmpDir}/${fname}`;
    if (!fs.existsSync(fp)) { console.log(`⚠️  skip ${fname} (파일 없음)`); continue; }
    const sql = fs.readFileSync(fp, 'utf8');
    const t0 = Date.now();
    const result = await db.query(sql);
    const dt = Date.now() - t0;
    console.log(`   ✓ ${fname}: rowCount=${result.rowCount} (${dt}ms)`);
  }

  await db.query('COMMIT');
  console.log('✅ COMMIT 완료');

  // 검증
  const verify = await db.query(`
    SELECT seed_category, COUNT(*) AS rows,
      COUNT(*) FILTER (WHERE source_type IS NOT NULL) AS source_typed,
      COUNT(*) FILTER (WHERE evidence_verified=true) AS verified,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS has_coord,
      COUNT(*) FILTER (WHERE google_review_count IS NOT NULL) AS has_review_count
    FROM place_seed_raw
    WHERE city_id=101 AND collection_phase='bts2026'
    GROUP BY seed_category ORDER BY seed_category
  `);
  console.log('\n📊 검증 결과:');
  console.table(verify.rows);

} catch (e) {
  await db.query('ROLLBACK');
  console.error('❌ ROLLBACK:', e.message);
  process.exit(1);
} finally {
  await db.end();
}
