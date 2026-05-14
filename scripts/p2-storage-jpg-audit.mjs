// 엘파소 Storage JPG 보관 상태 감사 (읽기 전용, DB 변경 0)
// 사용자 2026-04-28: 39 JPG가 place-images/101/ 에 있다고 보고됐으나 미확인
// 본 스크립트 = Storage 실파일 vs DB image_url 컬럼 대조
//
// 확인 항목:
//   1) Storage place-images/101/*/*.jpg 실제 파일 수
//   2) 카테고리별 분포
//   3) 각 파일이 DB image_url 에 연결됐는지 (orphan = 파일 있음, DB NULL)
//   4) DB image_url 이 채워진 것 중 실제 파일 없는 것 (broken link)

import 'dotenv/config';
import pg from 'pg';

const SUPA_URL = process.env.SUPA_URL || process.env.DATABASE_URL;
if (!SUPA_URL) { console.error('❌ SUPA_URL 미설정'); process.exit(1); }

const CITY_ID = 101;
const BUCKET = 'place-images';

const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('✅ DB 연결 OK\n');

try {
  // 1) Storage 파일 목록 (storage.objects 테이블 직접 쿼리)
  console.log(`📦 Storage bucket=${BUCKET}, prefix=${CITY_ID}/ 파일 목록`);
  console.log('─'.repeat(70));
  const sf = await db.query(`
    SELECT name, metadata->>'size' AS size, metadata->>'mimetype' AS mime, created_at
    FROM storage.objects
    WHERE bucket_id = $1
      AND name LIKE $2
    ORDER BY name
  `, [BUCKET, `${CITY_ID}/%`]);

  console.log(`총 파일 수: ${sf.rows.length}`);
  if (sf.rows.length === 0) {
    console.log('⚠️  파일 0건 — 선임 보고 "39 JPG 저장됨" = 거짓이거나 다른 버킷');
  }

  // 2) 카테고리별 분포 (path 패턴: 101/{category}/{row_id}.jpg)
  const byCategory = {};
  for (const r of sf.rows) {
    const m = r.name.match(/^101\/([^/]+)\/(.+)\.jpg$/);
    if (!m) continue;
    const cat = m[1];
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ row_id: m[2], size_kb: Math.round(parseInt(r.size || '0') / 1024) });
  }
  console.log('\n📊 카테고리별 JPG 파일 수:');
  for (const [cat, files] of Object.entries(byCategory).sort()) {
    console.log(`   ${cat.padEnd(14)} ${String(files.length).padStart(3)} 개 (총 ${files.reduce((a, b) => a + b.size_kb, 0)} KB)`);
  }

  // 3) DB place_seed_raw image_url 상태 (city_id=101)
  const dbr = await db.query(`
    SELECT seed_category,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> '') AS with_url,
      COUNT(*) FILTER (WHERE image_url LIKE '%storage/v1/object/public/place-images%') AS storage_linked,
      COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') AS null_url
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
    GROUP BY seed_category ORDER BY seed_category
  `, [CITY_ID]);
  console.log('\n📊 DB place_seed_raw image_url 상태:');
  console.table(dbr.rows);

  // 4) Orphan 검출: Storage 파일 있는데 DB image_url NULL
  console.log('\n🔍 Orphan 검출 (Storage 파일 있음 + DB image_url NULL):');
  const orphans = [];
  const dbRows = await db.query(`
    SELECT id, seed_category, name_en, image_url
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
  `, [CITY_ID]);
  const dbById = new Map(dbRows.rows.map(r => [String(r.id), r]));

  for (const r of sf.rows) {
    const m = r.name.match(/^101\/([^/]+)\/(.+)\.jpg$/);
    if (!m) continue;
    const rowId = m[2];
    const dbRow = dbById.get(rowId);
    if (!dbRow) {
      orphans.push({ file: r.name, status: '❌ DB row 없음', name_en: '?' });
      continue;
    }
    if (!dbRow.image_url) {
      orphans.push({ file: r.name, status: '⚠️ DB image_url NULL', name_en: dbRow.name_en });
    }
  }
  if (orphans.length === 0) {
    console.log('   (orphan 0건)');
  } else {
    console.log(`   총 ${orphans.length} 건 — DB 백필 필요:`);
    for (const o of orphans) console.log(`   - ${o.file} | ${o.status} | ${o.name_en}`);
  }

  // 5) Broken link: DB image_url 에 storage URL 있는데 실제 파일 없음
  console.log('\n🔍 Broken link 검출 (DB 가 가리키는 storage URL 의 파일 없음):');
  const fileSet = new Set(sf.rows.map(r => r.name));
  const linkedRows = await db.query(`
    SELECT id, seed_category, name_en, image_url
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
      AND image_url LIKE '%storage/v1/object/public/place-images/%'
  `, [CITY_ID]);
  const broken = [];
  for (const r of linkedRows.rows) {
    const m = r.image_url.match(/place-images\/(.+)$/);
    if (!m) continue;
    const path = m[1];
    if (!fileSet.has(path)) {
      broken.push({ id: r.id, name_en: r.name_en, path });
    }
  }
  if (broken.length === 0) {
    console.log('   (broken 0건)');
  } else {
    console.log(`   총 ${broken.length} 건:`);
    for (const b of broken) console.log(`   - row ${b.id} | ${b.name_en} | ${b.path}`);
  }

  // 6) 종합
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 종합 결과');
  console.log('═'.repeat(70));
  console.log(`Storage place-images/101/ 실파일      : ${sf.rows.length} 개`);
  console.log(`DB image_url storage URL 연결        : ${linkedRows.rows.length} 개`);
  console.log(`Orphan (파일O DB NULL = 백필 필요)   : ${orphans.length} 개`);
  console.log(`Broken link (DB O 파일X)             : ${broken.length} 개`);
  console.log('═'.repeat(70));

  if (sf.rows.length === 0) {
    console.log('\n결론: 선임 "39 JPG 저장" 보고 = 거짓 (Storage 비어있음)');
  } else if (orphans.length > 0) {
    console.log('\n결론: Storage 에 파일 있음 + DB 미연결 → 백필 워크플로 필요');
  } else if (broken.length > 0) {
    console.log('\n결론: DB 가 잘못된 URL 가리킴 → 정정 필요');
  } else {
    console.log('\n결론: Storage 와 DB 일관성 OK');
  }

} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
} finally {
  await db.end();
}
