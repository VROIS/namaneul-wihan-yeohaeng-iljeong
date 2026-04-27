// v3 JSON → place_seed_raw UPSERT SQL 빌더 (사용자 v4 컬럼 매핑)
import fs from 'fs';
import path from 'path';

const CATEGORY = process.argv[2] || 'shopping';
const CITY_ID = parseInt(process.argv[3] || '101', 10);
const CITY_LOWER_UNDER = process.argv[4] || 'elpaso';

const inFile = `scripts/${CITY_LOWER_UNDER}-${CATEGORY}-30-v3.json`;
const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));

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

const values = data.rows.map(r => {
  const rc = reviewNum(r.googleReviewCountNote);
  return '(' + [
    CITY_ID,
    esc(CATEGORY),
    esc('bts2026'),
    r.rank,
    esc(r.nameKo),
    esc(r.nameEn),
    num(r.latitude),
    num(r.longitude),
    esc(r.coordSource),
    esc(r.evidenceUrl),
    'TRUE',
    esc(r.googleSearchNote),
    num(rc),
    esc(r.googleReviewCountNote),
    esc(r.googleImageCountNote),
    `ARRAY[${esc(CATEGORY)}]::text[]`,
    `ARRAY['bts2026']::text[]`
  ].join(',') + ')';
});

const sql = [
  'INSERT INTO place_seed_raw',
  '  (city_id, seed_category, collection_phase, rank,',
  '   name_ko, name_en, latitude, longitude,',
  '   source_type, evidence_url, evidence_verified,',
  '   google_search_note, google_review_count, google_review_count_note, google_image_count_note,',
  '   category_tags, phase_tags)',
  'VALUES ' + values.join(', '),
  "ON CONFLICT (city_id, (LOWER(TRIM(name_en))))",
  "WHERE name_en IS NOT NULL AND TRIM(name_en) <> ''",
  'DO UPDATE SET',
  '  name_ko = COALESCE(EXCLUDED.name_ko, place_seed_raw.name_ko),',
  '  latitude = COALESCE(EXCLUDED.latitude, place_seed_raw.latitude),',
  '  longitude = COALESCE(EXCLUDED.longitude, place_seed_raw.longitude),',
  '  source_type = COALESCE(EXCLUDED.source_type, place_seed_raw.source_type),',
  '  evidence_url = COALESCE(EXCLUDED.evidence_url, place_seed_raw.evidence_url),',
  '  evidence_verified = TRUE,',
  '  google_search_note = COALESCE(EXCLUDED.google_search_note, place_seed_raw.google_search_note),',
  '  google_review_count = COALESCE(EXCLUDED.google_review_count, place_seed_raw.google_review_count),',
  '  google_review_count_note = COALESCE(EXCLUDED.google_review_count_note, place_seed_raw.google_review_count_note),',
  '  google_image_count_note = COALESCE(EXCLUDED.google_image_count_note, place_seed_raw.google_image_count_note),',
  '  category_tags = ARRAY(SELECT DISTINCT UNNEST(COALESCE(place_seed_raw.category_tags, ARRAY[]::text[]) || EXCLUDED.category_tags)),',
  '  phase_tags = ARRAY(SELECT DISTINCT UNNEST(COALESCE(place_seed_raw.phase_tags, ARRAY[]::text[]) || EXCLUDED.phase_tags)),',
  '  rank = EXCLUDED.rank'
].join('\n');

const tmpDir = (process.env.TEMP || process.env.TMP || './').replace(/\\/g, '/');
const outFile = path.join(tmpDir, `upsert-${CATEGORY}.sql`);
fs.writeFileSync(outFile, sql);

console.log(`📝 Built UPSERT SQL for ${CATEGORY}`);
console.log(`   rows: ${data.rows.length}`);
console.log(`   bytes: ${sql.length}`);
console.log(`   output: ${outFile}`);
