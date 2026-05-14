// DB 중복 행 병합 = 사용자 SSOT 2026-05-14 = AND 조건 (주소 ✓ AND 이름 ✓)
// = 목표: 같은 장소 2-3 행 중복 방지 + pid 있는 행 살리기 + 옛 시드 오류 (= 분류명) 정정
//
// 사용법:
//   node scripts/merge-db-duplicates.mjs                    # 전 도시 dry-run
//   node scripts/merge-db-duplicates.mjs --city-id 19       # 1 도시 dry-run
//   node scripts/merge-db-duplicates.mjs --commit           # 전 도시 실제 적용
//
// 로직:
//   1. 도시별 같은 장소 그룹 빌드 (= AND 조건)
//   2. 그룹 내 대표 행 선정 = 점수 기반:
//      +10 = google_place_id 있음
//      +5  = image_url 있음 + 'storage' 또는 'wikimedia'
//      +3  = name_ko 있음 + '?' 아님
//      +2  = collection_phase = 'gemini3-2026-05' (= 최신 표준)
//      -10 = name_en 이 BAD_NAME (= 도시명/분류명/잘못)
//   3. COALESCE 보강 = 대표 행 NULL 필드 = 그룹 내 보충
//      - image_url = 기존 우선 (= WK 보존) BUT 대표가 NULL = 그룹 채움
//      - summary_ko, editorial_summary, name_ko, name_local = 보충
//   4. archived 태그 추가 = phase_tags += 'archived-merge-2026-05-14'

import pg from 'pg';
import fs from 'fs';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const ALL_CITIES = args.includes('--all');
const cityIdEqArg = args.find(a => a.startsWith('--city-id='))?.split('=')[1];
const cityIdSpaceArg = args.indexOf('--city-id') >= 0 ? args[args.indexOf('--city-id') + 1] : null;
const CITY_ID_ARG = cityIdEqArg || cityIdSpaceArg || null;

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

// === 매칭 알고리즘 (= AND STRICT) ===
const STOP_STREET = new Set([
  'rue', 'av', 'avenue', 'bd', 'blvd', 'boulevard', 'place', 'pl', 'square', 'sq',
  'street', 'st', 'road', 'rd', 'lane', 'ln', 'drive', 'dr', 'court', 'ct',
  'calle', 'plaza', 'paseo', 'pza', 'strasse', 'straße', 'str', 'platz',
  'via', 'piazza', 'corso', 'quai', 'pont', 'cours', 'allée', 'allee',
  'chemin', 'passage', 'sentier', 'esplanade', 'promenade',
  'jardin', 'parc', 'park', 'garden', 'de', 'la', 'le', 'du', 'des',
  'di', 'del', 'das', 'der', 'and', 'the', 'an', 'a',
]);
const STOP_CITY = new Set([
  'paris', 'london', 'madrid', 'munich', 'munchen', 'münchen',
  'brussels', 'busan', 'stanford', 'mexico', 'city', 'vegas', 'las',
  'palo', 'alto', 'francisco', 'berlin', 'rome', 'roma', 'florence',
  'france', 'germany', 'spain', 'italy', 'uk', 'usa', 'cdmx',
]);

// === BAD NAME 감지 (= 옛 시드 오류 = 분류명/도시명/지역명/일반명) ===
// = 사용자 명시 2026-05-14 = "이건 분류이지 식당명이 아님"
// = 강화 = Paris 재측정 발견 패턴 추가
const BAD_NAME_EXACT = new Set([
  // 도시명만 = 옛 시드 오류
  'paris', 'london', 'madrid', 'munich', 'berlin', 'frankfurt',
  'tenerife', 'rome', 'manhattan', 'brooklyn', 'queens', 'polanco',
  // 분류명 (= 음식 종류 = 옛 시드 = name 대신 분류 들어감)
  'halal', 'soul food', 'malagasy cuisine', 'japanese food', 'italian food',
  'indonesian cuisine', 'northern irish cuisine', 'chinese food',
  'mexican food', 'french cuisine', 'thai food', 'vietnamese food',
  'korean food', 'turkish food', 'spanish cuisine', 'german cuisine',
  // 건축/지역 분류
  'architecture of paris', 'architecture of london', 'architecture of madrid',
  'old sacramento state historic park',
  // 동네/지역 (= 도시 + 동네 형식)
  'pigalle, paris', 'crocker-amazon, san francisco',
  'nob hill, san francisco', 'pigalle',
  'financial district, los angeles', 'financial district, new york',
  // 잘못 매핑 = 다른 나라 명소
  'brandenburg gate', 'hearst tower (manhattan)', 'parc merveilleux',
  "a' famosa resort", 'six flags over georgia',
  // 일반 카테고리
  'museum', 'restaurant', 'cafe', 'bar', 'park', 'garden', 'church',
  'fast food', 'fine dining', 'soul food',
]);

const isBadName = (name) => {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  if (BAD_NAME_EXACT.has(lower)) return true;
  // 단일 단어 + 8자 이하 + 분류 가능
  if (lower.split(/\s+/).length === 1 && lower.length <= 8) {
    if (/^(halal|kosher|asian|french|italian|japanese|chinese|mexican|german|spanish|thai)$/.test(lower)) return true;
  }
  // 괄호 안 도시명 (= "Hearst Tower (Manhattan)" 패턴)
  const inParen = name.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
  if (inParen && /^(manhattan|brooklyn|berlin|frankfurt|tokyo|seoul|nyc|sf)$/.test(inParen)) return true;
  // "X cuisine" 또는 "X food" 패턴 (= 분류명)
  if (/^[a-zàâäçèéêëîïôûùüÿñ\s-]+\s+(cuisine|food)$/i.test(lower)) return true;
  // "Architecture of X" 패턴
  if (/^architecture of\s+/i.test(lower)) return true;
  // "동네, 도시" 패턴 (= 광범위 지역 = 구체 장소 아님)
  if (/^[a-z\s-]+,\s+(paris|london|madrid|munich|new york|los angeles|san francisco|berlin|rome|tokyo|seoul|chicago)$/i.test(lower)) return true;
  return false;
};

const extractAddrParts = (addr) => {
  if (!addr) return null;
  const a = addr.toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const number = a.match(/^(\d+(?:[-/]\d+)?)/)?.[1] || null;
  const postal = a.match(/\b(\d{4,5})\b/)?.[1] || null;
  const afterNum = a.replace(/^\d+(?:[-/]\d+)?\s+/, '');
  const street = afterNum.split(',')[0].replace(/\d{4,5}.*/, '').trim();
  return { number, postal, street, raw: a };
};

const addrMatch = (a, b) => {
  const pa = extractAddrParts(a);
  const pb = extractAddrParts(b);
  if (!pa || !pb) return false;
  if (pa.raw === pb.raw) return true;
  if (!pa.number || !pb.number || pa.number !== pb.number) return false;
  if (!pa.postal || !pb.postal || pa.postal !== pb.postal) return false;
  if (!pa.street || !pb.street) return false;
  const aCore = pa.street.split(/\s+/).filter(w => w.length >= 3 && !STOP_STREET.has(w));
  const bCore = pb.street.split(/\s+/).filter(w => w.length >= 3 && !STOP_STREET.has(w));
  if (aCore.length === 0 || bCore.length === 0) return false;
  const [shortCore, longCore] = aCore.length <= bCore.length ? [aCore, bCore] : [bCore, aCore];
  return shortCore.every(w => longCore.includes(w));
};

const nameMatch = (a, b) => {
  if (!a || !b) return false;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  const aCore = na.split(/[\s\-]+/).filter(w => w.length >= 3 && !STOP_CITY.has(w) && !STOP_STREET.has(w));
  const bCore = nb.split(/[\s\-]+/).filter(w => w.length >= 3 && !STOP_CITY.has(w) && !STOP_STREET.has(w));
  if (aCore.length < 2 || bCore.length < 2) return false;
  if (aCore.length <= bCore.length) return aCore.every(w => bCore.includes(w));
  return bCore.every(w => aCore.includes(w));
};

const isSamePlace = (a, b) => {
  const sameAddr = addrMatch(a.address, b.address);
  const sameName =
    nameMatch(a.name_en, b.name_en) ||
    nameMatch(a.name_local, b.name_local) ||
    nameMatch(a.name_en, b.name_local) ||
    nameMatch(a.name_local, b.name_en);
  return sameAddr && sameName;
};

// === 점수 = 대표 행 선정 ===
const scoreRow = (r) => {
  let score = 0;
  if (r.google_place_id) score += 10;
  if (r.image_url) {
    if (r.image_url.includes('storage') || r.image_url.includes('wikimedia')) score += 5;
    else score += 2;
  }
  if (r.name_ko && r.name_ko !== '?' && !r.name_ko.startsWith('?')) score += 3;
  if (r.collection_phase === 'gemini3-2026-05') score += 2;
  if (isBadName(r.name_en)) score -= 10;
  return score;
};

// === 도시 선택 ===
// 기본 = 9 핵심 도시 / --all = 전체 99 도시 / --city-id N = 단일
let cityFilter = '';
let cityParams = [];
if (CITY_ID_ARG) {
  cityFilter = ' AND p.city_id = $1';
  cityParams.push(CITY_ID_ARG);
} else if (ALL_CITIES) {
  cityFilter = ''; // = 전체
} else {
  cityFilter = ` AND LOWER(ci.name_en) IN ('paris','brussels','busan','las vegas','london','madrid','mexico city','munich','stanford')`;
}

const cities = (await c.query(`
  SELECT DISTINCT ci.id, ci.name_en
  FROM cities ci JOIN place_seed_raw p ON p.city_id = ci.id
  WHERE 1=1 ${cityFilter}
  ORDER BY ci.name_en
`, cityParams)).rows;

console.log(`═══ DB 중복 병합 = ${COMMIT ? '⚠️ --commit (실제 적용)' : 'dry-run'} ═══`);
console.log(`대상 도시: ${cities.length}\n`);

let totalGroups = 0, totalArchived = 0, totalRepUpdated = 0, totalBadNames = 0;
const auditLog = [];

for (const city of cities) {
  const rows = (await c.query(`
    SELECT id, name_en, name_local, name_ko, address, latitude::float AS lat, longitude::float AS lng,
      google_place_id, image_url, summary_ko, editorial_summary, seed_category, collection_phase,
      phase_tags
    FROM place_seed_raw
    WHERE city_id = $1
      AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    ORDER BY id
  `, [city.id])).rows;

  // 그룹 빌드
  const groups = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    if (seen.has(i)) continue;
    const group = [rows[i]];
    seen.add(i);
    for (let j = i + 1; j < rows.length; j++) {
      if (seen.has(j)) continue;
      if (isSamePlace(rows[i], rows[j])) {
        group.push(rows[j]);
        seen.add(j);
      }
    }
    if (group.length >= 2) groups.push(group);
  }

  if (groups.length === 0) {
    console.log(`[${city.name_en}] 중복 0`);
    continue;
  }
  console.log(`\n[${city.name_en}] = 중복 그룹 ${groups.length} 개`);

  for (const g of groups) {
    totalGroups++;
    // 대표 = 최고 점수 (= 동점 시 = 가장 낮은 id = 먼저 등록)
    const scored = g.map(r => ({ ...r, score: scoreRow(r) }));
    scored.sort((a, b) => b.score - a.score || a.id - b.id);
    const rep = scored[0];
    const others = scored.slice(1);

    // COALESCE 보강 (= 대표 row NULL 필드를 그룹에서 채움)
    const supplements = {};
    if (!rep.image_url) {
      const wk = others.find(r => r.image_url?.includes('wikimedia'));
      const storage = others.find(r => r.image_url?.includes('storage'));
      const any = others.find(r => r.image_url);
      const fill = wk || storage || any;
      if (fill) supplements.image_url = fill.image_url;
    }
    if (!rep.google_place_id) {
      const pidRow = others.find(r => r.google_place_id);
      if (pidRow) supplements.google_place_id = pidRow.google_place_id;
    }
    if (!rep.name_ko || rep.name_ko === '?' || rep.name_ko.startsWith('?')) {
      const fill = others.find(r => r.name_ko && r.name_ko !== '?' && !r.name_ko.startsWith('?'));
      if (fill) supplements.name_ko = fill.name_ko;
    }
    if (!rep.name_local) {
      const fill = others.find(r => r.name_local);
      if (fill) supplements.name_local = fill.name_local;
    }
    if (!rep.summary_ko) {
      const fill = others.find(r => r.summary_ko);
      if (fill) supplements.summary_ko = fill.summary_ko;
    }
    if (!rep.editorial_summary) {
      const fill = others.find(r => r.editorial_summary);
      if (fill) supplements.editorial_summary = fill.editorial_summary;
    }

    const repBad = isBadName(rep.name_en);
    if (repBad) totalBadNames++;
    console.log(`\n  [그룹] 대표 = id=${rep.id} (score=${rep.score})`);
    console.log(`    ★ ${rep.name_en} ${rep.google_place_id ? '✓pid' : ' '} ${rep.image_url ? '✓img' : ' '} ${repBad ? '⚠️BAD_NAME' : ''}`);
    for (const o of others) {
      console.log(`      id=${o.id} ${o.name_en} (score=${o.score}) ${isBadName(o.name_en) ? '⚠️BAD' : ''}`);
    }
    if (Object.keys(supplements).length > 0) {
      console.log(`    → COALESCE 보강: ${Object.keys(supplements).join(', ')}`);
    }

    auditLog.push({ city: city.name_en, rep_id: rep.id, archived_ids: others.map(o => o.id), supplements });

    if (COMMIT) {
      // 1) 대표 행 UPDATE (보강 필드만)
      if (Object.keys(supplements).length > 0) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(supplements)) {
          sets.push(`${k} = $${i}`);
          vals.push(v);
          i++;
        }
        vals.push(rep.id);
        await c.query(`UPDATE place_seed_raw SET ${sets.join(', ')} WHERE id = $${i}`, vals);
        totalRepUpdated++;
      }
      // 2) 나머지 행 = archived 태그 (= DELETE 절대 X = CLAUDE.md §5)
      for (const o of others) {
        await c.query(`
          UPDATE place_seed_raw SET
            phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['archived-merge-2026-05-14']::text[])))
          WHERE id = $1
        `, [o.id]);
        totalArchived++;
      }
    }
  }
}

console.log(`\n\n═══ 종합 ═══`);
console.log(`도시 = ${cities.length}`);
console.log(`병합 그룹 = ${totalGroups}`);
console.log(`대표 행 보강 = ${COMMIT ? totalRepUpdated : '(dry-run)'}`);
console.log(`archived 행 = ${COMMIT ? totalArchived : '(dry-run)'}`);
console.log(`BAD_NAME 대표 행 = ${totalBadNames} (= 사용자 검토 권장)`);

// audit 로그 저장
fs.mkdirSync('backups', { recursive: true });
const auditPath = `backups/merge-audit-${COMMIT ? 'commit' : 'dryrun'}-${new Date().toISOString().slice(0,10)}.json`;
fs.writeFileSync(auditPath, JSON.stringify(auditLog, null, 2));
console.log(`\n💾 audit 저장: ${auditPath}`);

await c.end();
