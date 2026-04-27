// v3 7 카테고리 → name_en 기준 dedupe → 최저 rank 카테고리 = primary
// 사용자 명시 (2026-04-27): "원 카테고리 순위가 최우선 = 노출 순위"
//   - 같은 장소가 여러 카테고리에 있으면 = 최저 rank (가장 상위) 카테고리가 primary
//   - 다른 카테고리들 = category_tags 에 누적
// 출력: 1 row × 1 primary 카테고리 × 1 rank + 해시태그 누적
import fs from 'fs';

const CITY_LOWER = process.argv[2] || 'elpaso';
const CITY_ID = parseInt(process.argv[3] || '101', 10);
const CATEGORIES = ['attraction', 'restaurant', 'healing', 'adventure', 'hotspot', 'heritage', 'shopping'];

// v3 JSON 7 카테고리 로드
const allRows = [];
for (const cat of CATEGORIES) {
  const f = `scripts/${CITY_LOWER}-${cat}-30-v3.json`;
  if (!fs.existsSync(f)) {
    console.error(`⚠️  Missing: ${f}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of data.rows) {
    allRows.push({ ...r, _category: cat });
  }
}

console.log(`📥 Loaded ${allRows.length} rows from ${CATEGORIES.length} categories`);

// dedupe by lower(name_en), keep lowest rank as primary
const map = new Map();
for (const r of allRows) {
  const key = (r.nameEn || '').toLowerCase().trim();
  if (!key) continue;
  if (!map.has(key)) {
    map.set(key, { ...r, _categoryTags: new Set([r._category]) });
  } else {
    const existing = map.get(key);
    existing._categoryTags.add(r._category);
    if (r.rank < existing.rank) {
      // 더 좋은 rank = primary 교체 (이전 카테고리는 tag 으로 보존)
      const oldCat = existing._category;
      const tags = existing._categoryTags;
      map.set(key, { ...r, _categoryTags: tags });
    }
  }
}

const unique = Array.from(map.values()).sort((a, b) => {
  if (a._category !== b._category) return a._category.localeCompare(b._category);
  return a.rank - b.rank;
});

console.log(`🎯 Unique places: ${unique.length} (de-dup ${allRows.length - unique.length} rows)`);

// 카테고리별 통계
const byCat = {};
for (const u of unique) {
  byCat[u._category] = (byCat[u._category] || 0) + 1;
}
console.log(`📊 Primary category 분포:`);
for (const c of CATEGORIES) {
  console.log(`   ${c}: ${byCat[c] || 0}`);
}

// SQL 생성
function reviewNum(s) {
  if (!s) return null;
  const m = s.match(/(\d[\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) || null : null;
}
function esc(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function num(n) {
  return (n == null || isNaN(n)) ? 'NULL' : String(n);
}

const valueRows = unique.map(r => {
  const tags = Array.from(r._categoryTags).sort();
  const tagsArr = `ARRAY[${tags.map(t => `'${t}'`).join(',')}]::text[]`;
  const rc = reviewNum(r.googleReviewCountNote);
  return '(' + [
    CITY_ID, esc(r._category), "'bts2026'", r.rank,
    esc(r.nameKo), esc(r.nameEn),
    num(r.latitude), num(r.longitude),
    esc(r.coordSource), esc(r.evidenceUrl), 'TRUE',
    esc(r.googleSearchNote), num(rc),
    esc(r.googleReviewCountNote), esc(r.googleImageCountNote),
    tagsArr,
    `ARRAY['bts2026']::text[]`
  ].join(',') + ')';
});

// 같은 (seed_category, rank) 충돌 가능 = 카테고리별로 INSERT 시 같은 rank 가 있을 수 있음
// 처리: 각 (seed_category) 안에서 rank 재배열 (1, 2, 3, ...) — 원래 rank 잃지만 user "primary 만 노출" 의도 부합
const byPrimary = {};
for (const u of unique) {
  if (!byPrimary[u._category]) byPrimary[u._category] = [];
  byPrimary[u._category].push(u);
}
for (const cat of Object.keys(byPrimary)) {
  byPrimary[cat].sort((a, b) => a.rank - b.rank);
  byPrimary[cat].forEach((u, i) => { u._finalRank = i + 1; });  // 카테고리 안 1, 2, 3, ...
}
console.log(`🔢 카테고리 안 rank 재배열 완료 (충돌 방지)`);

// SQL 재생성 with _finalRank
const finalRows = unique.map(r => {
  const tags = Array.from(r._categoryTags).sort();
  const tagsArr = `ARRAY[${tags.map(t => `'${t}'`).join(',')}]::text[]`;
  const rc = reviewNum(r.googleReviewCountNote);
  return '(' + [
    CITY_ID, esc(r._category), "'bts2026'", r._finalRank,
    esc(r.nameKo), esc(r.nameEn),
    num(r.latitude), num(r.longitude),
    esc(r.coordSource), esc(r.evidenceUrl), 'TRUE',
    esc(r.googleSearchNote), num(rc),
    esc(r.googleReviewCountNote), esc(r.googleImageCountNote),
    tagsArr,
    `ARRAY['bts2026']::text[]`
  ].join(',') + ')';
});

const tmpDir = (process.env.TEMP || process.env.TMP || './').split('\\').join('/');

// 0. DELETE SQL (한 번만 실행)
const deleteSql = [
  '-- 1 row × 1 primary category × 1 rank + multi-tag (사용자 2026-04-27 v4 SSOT)',
  '-- DELETE 7 vibe 카테고리 row (bts_venue/army/merch 보존)',
  `DELETE FROM place_seed_raw`,
  `WHERE city_id=${CITY_ID} AND collection_phase='bts2026'`,
  `  AND seed_category IN ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping');`
].join('\n');
fs.writeFileSync(tmpDir + `/${CITY_LOWER}-00-delete.sql`, deleteSql);

// 1~7. 카테고리별 INSERT (각각 별도 파일)
const insertHeader = [
  'INSERT INTO place_seed_raw',
  '  (city_id, seed_category, collection_phase, rank,',
  '   name_ko, name_en, latitude, longitude,',
  '   source_type, evidence_url, evidence_verified,',
  '   google_search_note, google_review_count, google_review_count_note, google_image_count_note,',
  '   category_tags, phase_tags)',
  'VALUES'
].join('\n');

let totalSize = 0;
const summary = [];
for (let i = 0; i < CATEGORIES.length; i++) {
  const cat = CATEGORIES[i];
  const catRows = unique.filter(r => r._category === cat);
  if (catRows.length === 0) continue;
  const catValues = catRows.map(r => {
    const tags = Array.from(r._categoryTags).sort();
    const tagsArr = `ARRAY[${tags.map(t => `'${t}'`).join(',')}]::text[]`;
    const rc = reviewNum(r.googleReviewCountNote);
    return '(' + [
      CITY_ID, esc(cat), "'bts2026'", r._finalRank,
      esc(r.nameKo), esc(r.nameEn),
      num(r.latitude), num(r.longitude),
      esc(r.coordSource), esc(r.evidenceUrl), 'TRUE',
      esc(r.googleSearchNote), num(rc),
      esc(r.googleReviewCountNote), esc(r.googleImageCountNote),
      tagsArr,
      `ARRAY['bts2026']::text[]`
    ].join(',') + ')';
  });
  // ON CONFLICT DO NOTHING = bts_venue/army/merch 같은 보존 row 와 이름 충돌 시 무시
  const catSql = `${insertHeader} ${catValues.join(', ')} ON CONFLICT (city_id, (LOWER(TRIM(name_en)))) WHERE name_en IS NOT NULL AND TRIM(name_en) <> '' DO NOTHING;`;
  const fp = `${tmpDir}/${CITY_LOWER}-0${i+1}-${cat}.sql`;
  fs.writeFileSync(fp, catSql);
  totalSize += catSql.length;
  summary.push({ cat, rows: catRows.length, bytes: catSql.length, file: fp });
}

console.log(`💾 SQL files saved (Total: ${totalSize} bytes):`);
for (const s of summary) console.log(`   ${s.cat}: ${s.rows} rows / ${s.bytes} bytes / ${s.file}`);

// JSON snapshot 도 저장 (디버깅)
const jsonOut = {
  city: CITY_LOWER,
  cityId: CITY_ID,
  totalUnique: finalRows.length,
  byPrimary: Object.fromEntries(Object.entries(byPrimary).map(([k, v]) => [k, v.length])),
  consolidatedAt: new Date().toISOString()
};
const jsonFile = `scripts/${CITY_LOWER}-consolidated-summary.json`;
fs.writeFileSync(jsonFile, JSON.stringify(jsonOut, null, 2));
console.log(`📄 Summary: ${jsonFile}`);
