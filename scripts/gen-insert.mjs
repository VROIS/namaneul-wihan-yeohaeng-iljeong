// v3 JSON → INSERT SQL 생성 (no ON CONFLICT, 빈 카테고리 시드용)
import fs from 'fs';
import path from 'path';

const CATEGORY = process.argv[2];
const CITY_ID = parseInt(process.argv[3] || '101', 10);
const CITY_LOWER = process.argv[4] || 'elpaso';

if (!CATEGORY) {
  console.error('Usage: node gen-insert.mjs <category> [cityId] [cityLower]');
  process.exit(1);
}

const inFile = `scripts/${CITY_LOWER}-${CATEGORY}-30-v3.json`;
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
    CITY_ID, esc(CATEGORY), "'bts2026'", r.rank,
    esc(r.nameKo), esc(r.nameEn),
    num(r.latitude), num(r.longitude),
    esc(r.coordSource), esc(r.evidenceUrl), 'TRUE',
    esc(r.googleSearchNote), num(rc),
    esc(r.googleReviewCountNote), esc(r.googleImageCountNote),
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
  'VALUES ' + values.join(', ')
].join('\n');

const tmpDir = (process.env.TEMP || process.env.TMP || './').split('\\').join('/');
const outFile = path.join(tmpDir, `${CITY_LOWER}-${CATEGORY}-insert.sql`).split('\\').join('/');
fs.writeFileSync(outFile, sql);
console.log(`Wrote ${outFile}`);
console.log(`  rows: ${data.rows.length}, size: ${sql.length}`);
