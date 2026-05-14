/**
 * place_seed_raw = DROP 예정 43 컬럼 = 데이터 보유 row 만 JSON 백업
 * = 추후 복구 가능 (= 컬럼 ADD + UPDATE SQL 작성)
 */
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

function convertToPoolerUrl(u) {
  const m = u.match(/postgresql:\/\/postgres:([^@]+)@db\.([^.]+)\.supabase\.co:5432\/postgres/);
  if (m) return `postgresql://postgres.${m[2]}:${m[1]}@aws-1-eu-west-3.pooler.supabase.com:6543/postgres`;
  return u;
}

const DROP_COLS = [
  'delivery', 'dine_in', 'takeout', 'curbside_pickup', 'reservable',
  'serves_beer', 'serves_wine', 'serves_breakfast', 'serves_brunch', 'serves_lunch',
  'serves_dinner', 'serves_vegetarian_food', 'serves_coffee', 'serves_dessert',
  'good_for_children', 'good_for_groups', 'good_for_watching_sports', 'live_music',
  'outdoor_seating', 'restroom', 'menu_for_children', 'allows_dogs',
  'accessibility_options', 'parking_options', 'payment_options',
  'instagram_photo_urls', 'instagram_hashtags', 'instagram_post_count',
  'celeb_mention', 'names_i18n', 'type', 'cuisine_type', 'cuisine_origin_country',
  'short_address', 'display_name_ko', 'aliases', 'price_fetched_at', 'last_data_sync',
  'price_level', 'business_status', 'website_uri', 'phone_number', 'google_maps_uri',
];

const c = new pg.Client({ connectionString: convertToPoolerUrl(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } });
await c.connect();

// 각 컬럼별 = 데이터 보유 row 만 = id + 컬럼값 추출
const backup = {
  timestamp: new Date().toISOString(),
  table: 'place_seed_raw',
  drop_columns_count: DROP_COLS.length,
  data_by_column: {},
};

let totalRows = 0;
for (const col of DROP_COLS) {
  try {
    const r = await c.query(`
      SELECT id, ${col}
      FROM place_seed_raw
      WHERE ${col} IS NOT NULL
      ORDER BY id
    `);
    if (r.rows.length > 0) {
      backup.data_by_column[col] = r.rows;
      totalRows += r.rows.length;
      console.log(`  ✅ ${col}: ${r.rows.length} row 백업`);
    }
  } catch (e) {
    console.log(`  ⚠️ ${col}: 미존재 또는 오류 = SKIP`);
  }
}

const outPath = `backups/place_seed_raw_pre_drop43_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(outPath, JSON.stringify(backup, null, 2));

console.log(`\n총 ${totalRows} row 데이터 백업`);
console.log(`저장: ${outPath}`);
console.log(`파일 크기: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

// 복구 SQL 템플릿도 함께 생성
const restorePath = `backups/RESTORE_INSTRUCTIONS.md`;
const restoreContent = `# 복구 방법 (= 만약 필요 시)

## 백업 파일
- ${outPath}

## 컬럼 추가 + 데이터 복구 SQL

\`\`\`sql
-- 1. 컬럼 추가
ALTER TABLE place_seed_raw ADD COLUMN <컬럼명> <타입>;

-- 2. 데이터 UPDATE
UPDATE place_seed_raw SET <컬럼명> = <값> WHERE id = <id>;
\`\`\`

## Node 자동 복구 스크립트 (= 필요 시 작성)
\`\`\`js
const backup = JSON.parse(fs.readFileSync('${outPath}'));
for (const [col, rows] of Object.entries(backup.data_by_column)) {
  await db.query(\`ALTER TABLE place_seed_raw ADD COLUMN \${col} <type>\`);
  for (const r of rows) {
    await db.query(\`UPDATE place_seed_raw SET \${col} = $1 WHERE id = $2\`, [r[col], r.id]);
  }
}
\`\`\`
`;
fs.writeFileSync(restorePath, restoreContent);
console.log(`복구 가이드: ${restorePath}`);

await c.end();
