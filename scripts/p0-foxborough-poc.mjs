// ⚠️ 수정금지(승인필요) — Foxborough 6 카테고리 PoC (사용자 2026-04-25 명시 승인)
//
// 목표: Foxborough (cityId=107, 0 rows) 6 카테고리 × 상위 30곳 + Wikipedia 이미지/좌표 자동 매칭 + DB INSERT
// 카테고리: shopping, heritage, restaurant, healing, hotspot, adventure (attraction 폐기)
// 데이터 소스: Wikipedia REST API page summary (장소명 → 이미지 + 좌표 + 설명)
// 100km 반경 검증: Foxborough 좌표 기준 Haversine 거리

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';
const FOXBOROUGH_CITY_ID = 107;
const FOXBOROUGH_LAT = 42.0654;
const FOXBOROUGH_LNG = -71.2478;
const RADIUS_KM = 100;
const TARGET_PER_CATEGORY = 30;
const REQUEST_DELAY_MS = 150;

// ═══════════════════════════════════════════════════════════════════════════
// 후보 리스트 (Foxborough 100km 반경 = 보스턴 광역 + 일부 NH/RI)
// WebSearch + 사용자 분석 결과 기반 (2026-04-25 PoC)
// ═══════════════════════════════════════════════════════════════════════════

const PLACES = {
  shopping: [
    'Patriot Place',
    'Wrentham Village Premium Outlets',
    'Assembly Row',
    'Prudential Center',
    'Copley Place',
    'Faneuil Hall Marketplace',
    'Quincy Market',
    'Newbury Street',
    'CambridgeSide',
    'Natick Mall',
    'South Shore Plaza',
    'Burlington Mall',
    'Solomon Pond Mall',
    'Square One Mall',
    'Northshore Mall',
    'Liberty Tree Mall',
    'Emerald Square Mall',
    'Westgate Mall (Brockton, Massachusetts)',
    'Legacy Place',
    'MarketStreet Lynnfield',
    'Atrium Mall',
    'Chestnut Hill Square',
    'Watertown Mall',
    'Pheasant Lane Mall',
    'North Shore Mall',
    'Mall at Chestnut Hill',
    'Boston Public Market',
    'SoWa Vintage Market',
    'Garment District (Cambridge, Massachusetts)',
    'Hanover Mall',
  ],
  heritage: [
    'Patriots Hall of Fame',
    'Freedom Trail',
    'Old State House (Boston)',
    'Boston Tea Party Ships and Museum',
    'USS Constitution Museum',
    'Museum of Science (Boston)',
    'Isabella Stewart Gardner Museum',
    'Museum of Fine Arts, Boston',
    'Bunker Hill Monument',
    'Old North Church',
    'Paul Revere House',
    'Faneuil Hall',
    'Granary Burying Ground',
    "King's Chapel",
    'Old South Meeting House',
    'Massachusetts State House',
    'Harvard Art Museums',
    'MIT Museum',
    'Harvard Museum of Natural History',
    'Concord Museum',
    'Plimoth Patuxet Museums',
    'Lexington Battle Green',
    'Trinity Church (Boston)',
    'Boston Public Library',
    'New England Holocaust Memorial',
    'USS Constitution',
    'Massachusetts Historical Society',
    'John F. Kennedy Presidential Library and Museum',
    'Salem Witch Museum',
    'House of the Seven Gables',
  ],
  restaurant: [
    "Davio's Northern Italian Steakhouse",
    'Neptune Oyster',
    "Mike's Pastry",
    'Modern Pastry Shop',
    'Union Oyster House',
    'Legal Sea Foods',
    'No. 9 Park',
    'Atlantic Fish Company',
    "Yvonne's",
    'Mooo Restaurant',
    "Toro (restaurant)",
    'Oleana (restaurant)',
    "Craigie on Main",
    "L'Espalier",
    'O Ya',
    'Coppa (restaurant)',
    'The Daily Catch',
    'Carmelina\'s',
    'Bricco',
    'Mamma Maria',
    'Giacomo\'s',
    'Regina Pizzeria',
    'Pizzeria Regina',
    'James Hook & Co.',
    'Anna\'s Taqueria',
    'Flour Bakery + Cafe',
    "Tatte Bakery & Cafe",
    'Sweet Cheeks Q',
    'Eastern Standard Kitchen',
    'Row 34',
  ],
  healing: [
    'Boston Common',
    'Public Garden (Boston)',
    'Arnold Arboretum',
    'Emerald Necklace',
    'Boston Harbor Islands National and State Park',
    'Castle Island (Massachusetts)',
    'Franklin Park (Boston)',
    'Jamaica Pond',
    'Charles River Esplanade',
    'Mount Auburn Cemetery',
    'Walden Pond',
    'Crane Beach',
    'Revere Beach',
    'Nahant Beach',
    'Singing Beach',
    'Plum Island (Massachusetts)',
    'Halibut Point State Park',
    'Wachusett Mountain',
    'Mount Greylock',
    'Blue Hills Reservation',
    'Middlesex Fells Reservation',
    'Hammond Pond Reservation',
    'Hopkinton State Park',
    'World\'s End (reservation)',
    'Chesterwood (museum)',
    'Garden in the Woods',
    'Tower Hill Botanic Garden',
    'Heritage Museums and Gardens',
    'Long Hill (Beverly, Massachusetts)',
    'Naumkeag (Stockbridge, Massachusetts)',
  ],
  hotspot: [
    'Beacon Hill, Boston',
    'North End, Boston',
    'South End, Boston',
    'Back Bay',
    'Seaport District',
    'Cambridge, Massachusetts',
    'Harvard Square',
    'Davis Square',
    'Inman Square',
    'Salem, Massachusetts',
    'Provincetown, Massachusetts',
    'Cape Ann',
    'Marblehead, Massachusetts',
    'Concord, Massachusetts',
    'Lexington, Massachusetts',
    'Wellesley, Massachusetts',
    'Brookline, Massachusetts',
    'Somerville, Massachusetts',
    'Allston',
    'Jamaica Plain',
    'Chinatown, Boston',
    'Theatre District, Boston',
    'Charlestown, Boston',
    'Dorchester, Boston',
    'Roxbury, Boston',
    'Fenway–Kenmore',
    'Fenway Park',
    'TD Garden',
    'Boston Tea Party',
    'Charlestown Navy Yard',
  ],
  adventure: [
    "Southwick's Zoo",
    'Franklin Park Zoo',
    'New England Aquarium',
    'LEGOLAND Discovery Center Boston',
    'Canobie Lake Park',
    'Edaville Family Theme Park',
    'Six Flags New England',
    'Kimball Farm',
    'Battleship Cove',
    "Boston Children's Museum",
    'Davis Mega Maze',
    'Stone Zoo',
    'EcoTarium',
    'Capron Park Zoo',
    'Roger Williams Park Zoo',
    'Buttonwood Park Zoo',
    'Wachusett Mountain Ski Area',
    'Blue Hills Ski Area',
    'Whale watching in New England',
    'Boston Duck Tours',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 헬퍼 함수
// ═══════════════════════════════════════════════════════════════════════════

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchWikipediaSummary(name) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NubiBot/1.0 (vibetrip; contact@vibetrip.app)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === 'disambiguation') return null;
    return data;
  } catch {
    return null;
  }
}

async function processCategory(category, names) {
  console.log(`\n=== ${category.toUpperCase()} (${names.length} 후보) ===`);
  const results = [];
  for (const name of names) {
    if (results.length >= TARGET_PER_CATEGORY) break;

    const summary = await fetchWikipediaSummary(name);
    if (!summary) {
      console.log(`  ❌ ${name}: Wikipedia 페이지 없음`);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      continue;
    }

    const lat = summary.coordinates?.lat;
    const lng = summary.coordinates?.lon;
    const imageUrl = summary.thumbnail?.source || summary.originalimage?.source;

    if (!imageUrl) {
      console.log(`  ⏭️ ${summary.title}: 이미지 없음`);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      continue;
    }

    if (lat && lng) {
      const dist = distanceKm(FOXBOROUGH_LAT, FOXBOROUGH_LNG, lat, lng);
      if (dist > RADIUS_KM) {
        console.log(`  📍 ${summary.title}: ${dist.toFixed(1)}km > 100km — skip`);
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        continue;
      }
    }

    results.push({
      nameEn: summary.title,
      imageUrl,
      lat: lat || null,
      lng: lng || null,
      extract: summary.extract ? summary.extract.slice(0, 200) : null,
      wikipediaUrl: summary.content_urls?.desktop?.page || null,
    });
    const distStr = lat && lng ? `${distanceKm(FOXBOROUGH_LAT, FOXBOROUGH_LNG, lat, lng).toFixed(1)}km` : 'no-coord';
    console.log(`  ✅ ${summary.title.padEnd(45)} ${distStr}`);
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }
  console.log(`  → ${results.length} 수집 (목표 ${TARGET_PER_CATEGORY})`);
  return results;
}

async function main() {
  console.log(`\n🚀 [Foxborough PoC] 시작 (cityId=${FOXBOROUGH_CITY_ID}, 좌표 ${FOXBOROUGH_LAT}, ${FOXBOROUGH_LNG}, 반경 ${RADIUS_KM}km)`);

  const allResults = {};
  for (const [cat, names] of Object.entries(PLACES)) {
    allResults[cat] = await processCategory(cat, names);
  }

  // DB INSERT
  console.log(`\n📥 [DB INSERT] place_seed_raw 저장`);
  const pool = new pg.Pool({ connectionString: SUPA_URL });

  let totalInserted = 0;
  for (const [cat, places] of Object.entries(allResults)) {
    let insertedInCat = 0;
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      try {
        await pool.query(
          `
          INSERT INTO place_seed_raw (
            city_id, seed_category, collection_phase, rank,
            name_en, image_url, latitude, longitude,
            nubi_reason, evidence_url, source, source_type, evidence_verified
          ) VALUES ($1, $2, 'bts2026', $3, $4, $5, $6, $7, $8, $9, 'claude_websearch_2026-04-25', null, false)
          ON CONFLICT (city_id, seed_category, rank) DO UPDATE SET
            name_en = EXCLUDED.name_en,
            image_url = EXCLUDED.image_url,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            nubi_reason = EXCLUDED.nubi_reason,
            evidence_url = EXCLUDED.evidence_url,
            source = EXCLUDED.source
        `,
          [
            FOXBOROUGH_CITY_ID,
            cat,
            i + 1,
            p.nameEn,
            p.imageUrl,
            p.lat,
            p.lng,
            p.extract,
            p.wikipediaUrl,
          ]
        );
        insertedInCat++;
        totalInserted++;
      } catch (err) {
        console.error(`  ❌ INSERT 오류 (${p.nameEn}): ${err.message}`);
      }
    }
    console.log(`  ${cat.padEnd(12)} ${insertedInCat} rows INSERTED`);
  }

  // 최종 검증
  console.log(`\n🔍 [Verify] Foxborough place_seed_raw 최종 상태`);
  const final = await pool.query(
    `
    SELECT seed_category,
      COUNT(*) AS total,
      COUNT(image_url) AS with_img,
      COUNT(latitude) AS with_coord,
      MIN(rank) AS min_rank,
      MAX(rank) AS max_rank
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
    GROUP BY seed_category
    ORDER BY seed_category
  `,
    [FOXBOROUGH_CITY_ID]
  );
  console.table(final.rows);

  // 샘플 5개
  console.log(`\n=== 샘플 (각 카테고리 rank 1-2) ===`);
  const sample = await pool.query(
    `
    SELECT seed_category, rank, name_en,
      SUBSTRING(image_url, 1, 80) AS img_preview,
      latitude, longitude
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026' AND rank <= 2
    ORDER BY seed_category, rank
  `,
    [FOXBOROUGH_CITY_ID]
  );
  console.table(sample.rows);

  console.log(`\n✅ 총 ${totalInserted} rows INSERTED into place_seed_raw (Foxborough)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
