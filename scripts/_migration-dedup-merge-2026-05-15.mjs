// 1 회 마이그 = 5 단계 매칭 중복 1,054 쌍 통합 (2026-05-15)
// 사용자 SSOT:
//   - 매칭 5 단계 (PID > 풀주소 > google_maps_uri > 좌표 10m > 이름 9 조합)
//   - keep 우선순위 (PID 보유 > 상세 이름 > 풍부도)
//   - 통합 패턴 = COALESCE 옛 우선 (검증) + GREATEST 가격 + UNION tags
//   - merge 행 = archive (= phase_tags ||= 'archived-merge-2026-05-15')
//   - 보조 테이블 = place_images.place_seed_raw_id = merge → keep 재연결
//
// DRY_RUN=true 면 = ROLLBACK = 실제 변경 0

import pg from 'pg';
import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log('═══════════════════════════════════════════════════════════');
console.log(`5 단계 매칭 중복 통합 마이그 (${DRY_RUN ? 'DRY RUN' : 'REAL COMMIT'})`);
console.log('═══════════════════════════════════════════════════════════\n');

const startTime = Date.now();

// ━━━━━━ 1. 5 단계 매칭 쌍 SELECT ━━━━━━
console.log('▶ 1. 중복 쌍 SELECT (= 5 단계 누적)...');
const pairsSql = `
  WITH n AS (
    SELECT id, city_id, google_place_id, google_maps_uri,
      latitude, longitude,
      LOWER(TRIM(regexp_replace(regexp_replace(COALESCE(address, ''), '[.,;:!?''"()\\[\\]{}]', ' ', 'g'), '\\s+', ' ', 'g'))) AS na,
      LOWER(TRIM(name_en)) AS n_en,
      LOWER(TRIM(name_local)) AS n_local,
      LOWER(TRIM(name_ko)) AS n_ko,
      name_en, name_local, name_ko, phase_tags
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
      AND NOT ('archived-merge-2026-05-15' = ANY(COALESCE(phase_tags, '{}')))
  )
  SELECT
    a.id AS id_a, b.id AS id_b, a.city_id,
    a.google_place_id AS pid_a, b.google_place_id AS pid_b,
    a.name_en AS name_en_a, b.name_en AS name_en_b,
    a.name_local AS name_local_a, b.name_local AS name_local_b,
    a.name_ko AS name_ko_a, b.name_ko AS name_ko_b
  FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
  WHERE
       (a.google_place_id IS NOT NULL AND b.google_place_id IS NOT NULL AND a.google_place_id = b.google_place_id)
    OR (LENGTH(a.na) >= 20 AND LENGTH(b.na) >= 20 AND a.na = b.na)
    OR (a.google_maps_uri IS NOT NULL AND b.google_maps_uri IS NOT NULL AND a.google_maps_uri = b.google_maps_uri)
    OR (a.latitude IS NOT NULL AND b.latitude IS NOT NULL
        AND abs(a.latitude - b.latitude) < 0.0001 AND abs(a.longitude - b.longitude) < 0.0001)
    OR (
         (a.n_en IS NOT NULL AND b.n_en IS NOT NULL AND a.n_en = b.n_en)
      OR (a.n_en IS NOT NULL AND b.n_local IS NOT NULL AND a.n_en = b.n_local)
      OR (a.n_en IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_en = b.n_ko)
      OR (a.n_local IS NOT NULL AND b.n_en IS NOT NULL AND a.n_local = b.n_en)
      OR (a.n_local IS NOT NULL AND b.n_local IS NOT NULL AND a.n_local = b.n_local)
      OR (a.n_local IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_local = b.n_ko)
      OR (a.n_ko IS NOT NULL AND b.n_en IS NOT NULL AND a.n_ko = b.n_en)
      OR (a.n_ko IS NOT NULL AND b.n_local IS NOT NULL AND a.n_ko = b.n_local)
      OR (a.n_ko IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_ko = b.n_ko)
    )
`;
const pairs = (await c.query(pairsSql)).rows;
console.log(`  쌍 수: ${pairs.length}`);

// ━━━━━━ 2. keep 우선순위 결정 (= 사용자 SSOT) ━━━━━━
// 1) PID 보유 > 미보유
// 2) 둘 다 PID 있음 = 상세 이름 (= 길이)
// 3) 둘 다 PID 없음 = 상세 이름 (= 길이)
function pickKeep(p) {
  const a = { id: p.id_a, pid: p.pid_a, name: p.name_en_a || p.name_local_a || p.name_ko_a || '' };
  const b = { id: p.id_b, pid: p.pid_b, name: p.name_en_b || p.name_local_b || p.name_ko_b || '' };
  if (a.pid && !b.pid) return { keep: a.id, merge: b.id };
  if (!a.pid && b.pid) return { keep: b.id, merge: a.id };
  // 둘 다 PID 있거나 둘 다 없음 → 상세 이름 (= 길이 긴 쪽)
  if (a.name.length >= b.name.length) return { keep: a.id, merge: b.id };
  return { keep: b.id, merge: a.id };
}

// ━━━━━━ 3. transitive 그룹화 (= A=B, B=C 면 한 그룹) ━━━━━━
// Union-Find
const parent = new Map();
function find(x) {
  if (!parent.has(x)) parent.set(x, x);
  if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
  return parent.get(x);
}
function union(x, y) {
  const px = find(x), py = find(y);
  if (px !== py) parent.set(px, py);
}
for (const p of pairs) union(p.id_a, p.id_b);

// ━━━━━━ 4. 각 그룹 내에서 = keep 결정 (= 사용자 우선순위 반복 적용) ━━━━━━
// 그룹별로 = 모든 행 SELECT + PID 보유 행이 있으면 keep, 아니면 가장 긴 이름
const groupMembers = new Map();
for (const p of pairs) {
  const root = find(p.id_a);
  if (!groupMembers.has(root)) groupMembers.set(root, new Set());
  groupMembers.get(root).add(p.id_a);
  groupMembers.get(root).add(p.id_b);
}

const allMemberIds = [...new Set(pairs.flatMap((p) => [p.id_a, p.id_b]))];
const memberData = new Map();
if (allMemberIds.length > 0) {
  const memberRows = (await c.query(`
    SELECT id, google_place_id,
      COALESCE(LENGTH(name_en), 0) + COALESCE(LENGTH(name_local), 0) + COALESCE(LENGTH(name_ko), 0) AS name_len,
      (CASE WHEN google_place_id IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN address IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN photo_urls IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN editorial_summary IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN summary_ko IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN google_maps_uri IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN google_review_count IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN opening_hours IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN price_eur IS NOT NULL THEN 1 ELSE 0 END
      ) AS richness
    FROM place_seed_raw
    WHERE id = ANY($1::int[])
  `, [allMemberIds])).rows;
  for (const m of memberRows) memberData.set(m.id, m);
}

const groupKeepMerge = [];
for (const [root, idsSet] of groupMembers) {
  const ids = [...idsSet];
  const members = ids.map((id) => memberData.get(id)).filter(Boolean);
  // 정렬 = PID 보유 우선 (desc) → 이름 길이 (desc) → 풍부도 (desc) → id (asc)
  members.sort((x, y) => {
    if ((y.google_place_id ? 1 : 0) !== (x.google_place_id ? 1 : 0)) {
      return (y.google_place_id ? 1 : 0) - (x.google_place_id ? 1 : 0);
    }
    if (y.name_len !== x.name_len) return y.name_len - x.name_len;
    if (y.richness !== x.richness) return y.richness - x.richness;
    return x.id - y.id;
  });
  const keepId = members[0].id;
  for (let i = 1; i < members.length; i++) {
    groupKeepMerge.push({ keep_id: keepId, merge_id: members[i].id });
  }
}
console.log(`\n▶ 2. 그룹화 + keep 결정:`);
console.log(`  중복 그룹: ${groupMembers.size}`);
console.log(`  merge 대상 행: ${groupKeepMerge.length}`);

// ━━━━━━ 5. 통합 + archive ━━━━━━
await c.query('BEGIN');
const stats = { mergedRows: 0, imagesReconnected: 0, errors: 0 };

try {
  for (const { keep_id, merge_id } of groupKeepMerge) {
    try {
      // keep 행 = merge 행 데이터 COALESCE/GREATEST/UNION 흡수
      await c.query(`
        UPDATE place_seed_raw keep
        SET
          name_en             = COALESCE(keep.name_en, m.name_en),
          name_ko             = COALESCE(keep.name_ko, m.name_ko),
          name_local          = COALESCE(keep.name_local, m.name_local),
          address             = COALESCE(keep.address, m.address),
          latitude            = COALESCE(keep.latitude, m.latitude),
          longitude           = COALESCE(keep.longitude, m.longitude),
          google_place_id     = COALESCE(keep.google_place_id, m.google_place_id),
          google_maps_uri     = COALESCE(keep.google_maps_uri, m.google_maps_uri),
          google_review_count = GREATEST(COALESCE(keep.google_review_count, 0), COALESCE(m.google_review_count, 0)),
          google_rating       = COALESCE(keep.google_rating, m.google_rating),
          image_url           = COALESCE(keep.image_url, m.image_url),
          photo_urls          = COALESCE(keep.photo_urls, m.photo_urls),
          opening_hours       = COALESCE(keep.opening_hours, m.opening_hours),
          editorial_summary   = COALESCE(keep.editorial_summary, m.editorial_summary),
          summary_ko          = COALESCE(keep.summary_ko, m.summary_ko),
          nubi_reason         = COALESCE(keep.nubi_reason, m.nubi_reason),
          price_eur           = CASE
            WHEN keep.seed_category = 'shopping' THEN NULL
            ELSE GREATEST(COALESCE(keep.price_eur, 0), COALESCE(m.price_eur, 0))
          END,
          naver_blog_count    = GREATEST(COALESCE(keep.naver_blog_count, 0), COALESCE(m.naver_blog_count, 0)),
          category_tags       = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(keep.category_tags, '{}') || COALESCE(m.category_tags, '{}')))),
          phase_tags          = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(keep.phase_tags, '{}') || COALESCE(m.phase_tags, '{}')))),
          updated_at          = NOW()
        FROM place_seed_raw m
        WHERE keep.id = $1 AND m.id = $2
      `, [keep_id, merge_id]);

      // place_images.place_seed_raw_id = merge_id → keep_id 재연결
      const imgUpdate = await c.query(`
        UPDATE place_images SET place_seed_raw_id = $1 WHERE place_seed_raw_id = $2
      `, [keep_id, merge_id]);
      stats.imagesReconnected += imgUpdate.rowCount;

      // merge 행 archive = phase_tags 에 'archived-merge-2026-05-15' 추가
      await c.query(`
        UPDATE place_seed_raw
        SET phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, '{}') || ARRAY['archived-merge-2026-05-15']::text[]))),
            updated_at = NOW()
        WHERE id = $1
      `, [merge_id]);

      stats.mergedRows++;
    } catch (e) {
      stats.errors++;
      console.warn(`  ❌ merge 실패 (keep=${keep_id}, merge=${merge_id}): ${e.message.slice(0, 80)}`);
    }
  }

  if (DRY_RUN) {
    await c.query('ROLLBACK');
    console.log('\n🔵 DRY RUN ROLLBACK (= 실제 변경 0)');
  } else {
    await c.query('COMMIT');
    console.log('\n✅ COMMIT 완료');
  }

  console.log(`\n▶ 결과:`);
  console.log(`  소요: ${((Date.now() - startTime) / 1000).toFixed(1)} 초`);
  console.table([stats]);
} catch (e) {
  await c.query('ROLLBACK');
  console.error('\n❌ ROLLBACK:', e.message);
  process.exit(1);
}

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`${DRY_RUN ? 'DRY RUN' : 'REAL'} 완료`);
console.log('═══════════════════════════════════════════════════════════');
