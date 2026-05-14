// 1 회용 = 외로운 BAD_NAME 행 측정 (= 그룹 외 단독 = 운영 매칭 시 잘못 매칭 위험)
import pg from 'pg';
import fs from 'fs';

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

// BAD_NAME 패턴 (= merge 스크립트와 동일)
const BAD_NAME_EXACT = new Set([
  'paris', 'london', 'madrid', 'munich', 'berlin', 'frankfurt',
  'tenerife', 'rome', 'manhattan', 'brooklyn', 'queens', 'polanco',
  'halal', 'soul food', 'malagasy cuisine', 'japanese food', 'italian food',
  'indonesian cuisine', 'northern irish cuisine', 'chinese food',
  'mexican food', 'french cuisine', 'thai food', 'vietnamese food',
  'korean food', 'turkish food', 'spanish cuisine', 'german cuisine',
  'architecture of paris', 'architecture of london', 'architecture of madrid',
  'old sacramento state historic park',
  'pigalle, paris', 'crocker-amazon, san francisco',
  'nob hill, san francisco', 'pigalle',
  'financial district, los angeles', 'financial district, new york',
  'brandenburg gate', 'hearst tower (manhattan)', 'parc merveilleux',
  "a' famosa resort", 'six flags over georgia',
  'museum', 'restaurant', 'cafe', 'bar', 'park', 'garden', 'church',
  'fast food', 'fine dining',
]);

const isBadName = (name) => {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  if (BAD_NAME_EXACT.has(lower)) return true;
  if (lower.split(/\s+/).length === 1 && lower.length <= 8) {
    if (/^(halal|kosher|asian|french|italian|japanese|chinese|mexican|german|spanish|thai)$/.test(lower)) return true;
  }
  const inParen = name.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
  if (inParen && /^(manhattan|brooklyn|berlin|frankfurt|tokyo|seoul|nyc|sf)$/.test(inParen)) return true;
  if (/^[a-zàâäçèéêëîïôûùüÿñ\s-]+\s+(cuisine|food)$/i.test(lower)) return true;
  if (/^architecture of\s+/i.test(lower)) return true;
  if (/^[a-z\s-]+,\s+(paris|london|madrid|munich|new york|los angeles|san francisco|berlin|rome|tokyo|seoul|chicago)$/i.test(lower)) return true;
  return false;
};

// 전체 활성 행 SELECT
const allRows = (await c.query(`
  SELECT p.id, p.name_en, p.name_ko, p.address, p.city_id, ci.name_en AS city, p.google_place_id, p.image_url
  FROM place_seed_raw p
  JOIN cities ci ON ci.id = p.city_id
  WHERE p.seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(p.phase_tags, ARRAY[]::text[])))
`)).rows;

const badRows = allRows.filter(r => isBadName(r.name_en));
console.log(`═══ 외로운 BAD_NAME 행 측정 ═══`);
console.log(`전체 활성 행 = ${allRows.length}`);
console.log(`BAD_NAME 행 = ${badRows.length} (${(badRows.length * 100 / allRows.length).toFixed(1)}%)`);

// 도시별 분포
const byCity = {};
for (const r of badRows) {
  byCity[r.city] = (byCity[r.city] || 0) + 1;
}
const cityList = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
console.log('\n도시별 BAD_NAME (상위 20):');
console.table(cityList.slice(0, 20).map(([c, n]) => ({ city: c, count: n })));

// 패턴별 분류
const byPattern = { '도시명': 0, '분류명_cuisine': 0, '분류명_food': 0, '동네_도시': 0, 'Architecture': 0, '괄호_도시': 0, '일반_명사': 0, '기타': 0 };
for (const r of badRows) {
  const lower = r.name_en.toLowerCase().trim();
  if (/^(paris|london|madrid|munich|berlin|frankfurt|rome|polanco|manhattan|tenerife)$/.test(lower)) byPattern['도시명']++;
  else if (/cuisine$/.test(lower)) byPattern['분류명_cuisine']++;
  else if (/food$/.test(lower)) byPattern['분류명_food']++;
  else if (/^[a-z\s-]+,\s+/.test(lower)) byPattern['동네_도시']++;
  else if (/^architecture of/.test(lower)) byPattern['Architecture']++;
  else if (r.name_en.match(/\([^)]+\)/)) byPattern['괄호_도시']++;
  else byPattern['기타']++;
}
console.log('\n패턴별:');
console.table(byPattern);

// 샘플 = 첫 30 개
console.log('\nBAD_NAME 행 샘플 (= 첫 30):');
console.table(badRows.slice(0, 30).map(r => ({
  id: r.id, city: r.city, name_en: r.name_en,
  pid: r.google_place_id ? '✓' : '✗',
  img: r.image_url ? '✓' : '✗',
})));

console.log(`\n= ${badRows.length} 행 = archive 권장 (= 운영 시 잘못 매칭 차단)`);

// JSON 저장
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync('backups/bad-name-orphan-rows.json', JSON.stringify(badRows, null, 2));
console.log('💾 저장: backups/bad-name-orphan-rows.json');

await c.end();
