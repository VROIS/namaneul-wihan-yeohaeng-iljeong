// ⚠️ 수정금지(승인필요) — 2026-04-26 BTS 96 row 시드 (32 도시 × 3 종)
//
// 목적: D-Day 카드 1번 자리(venue) + 메인앱 지도뷰 핀(venue/army_zone/merch_store) 데이터 확보
// 사용자 결정 A1 (2026-04-26): BTS row 만 우선 시드 (일반 places 동기화는 별도 트랙)
//
// 데이터 흐름:
//   1. cities.bts_rank 보유 + bts_archived=false 32 도시 대상
//   2. Wikipedia REST API → venue 좌표 + 이미지 URL (32 호출, 무료)
//   3. INSERT 96 row INTO places (venue 32 + army_zone 32 + merch_store 32)
//      - type = 'landmark' (enum)
//      - seed_category = 'bts_venue' | 'bts_army_zone' | 'bts_merch_store'
//      - 좌표 = army_zone/merch = venue 좌표 공유 (정확 좌표는 추후 별도 트랙)
//      - 이미지 = venue Wikipedia 이미지 (3종 공유)
//      - name = 사용자 표 + 딥서치 결과 통합
//   4. UPDATE cities.bts_fan_zone / bts_merch_info JSON (메타데이터 + places.id 연결)
//
// 트랜잭션 원자성 (메모리 feedback_transaction_atomicity 적용):
//   BEGIN → DELETE 기존 BTS row → INSERT 96 → 검증 (>=96) → UPDATE cities 메타 → COMMIT/ROLLBACK
//
// 모드:
//   --dry-run  : Wikipedia 호출 + INSERT/UPDATE 시뮬레이션 (DB 변경 X)
//   --commit   : 실제 트랜잭션 COMMIT
//
// 실행: node --env-file=.env scripts/p0-bts-96row-seed.mjs --dry-run

import pg from 'pg';
import fs from 'fs';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━ 안전장치 ━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUPA_URL = process.env.SUPA_URL || process.env.DATABASE_URL;
if (!SUPA_URL) {
  console.error('❌ SUPA_URL/DATABASE_URL 환경변수 미설정. node --env-file=.env 사용 필요');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const COMMIT_MODE = process.argv.includes('--commit');
const SQL_FILE_ARG = process.argv.find((a) => a.startsWith('--sql-file='));
const SQL_FILE = SQL_FILE_ARG ? SQL_FILE_ARG.split('=')[1] : null;
if (!DRY_RUN && !COMMIT_MODE && !SQL_FILE) {
  console.error('❌ --dry-run 또는 --commit 또는 --sql-file=path 명시 필요');
  process.exit(1);
}

const UA = 'VibeTrip/1.0 (contact@vibetrip.app) Expo/54';

// ━━━━━━━━━━━━━━━━━━━━━━━━━ 32 도시 BTS 데이터 ━━━━━━━━━━━━━━━━━━━━━━━━━
// Plan Sub 0a 사용자 제공 표 + 2026-04-25 딥서치 검증 결과 통합
// [city_id, venue_query (Wikipedia 검색), army_zone_name, army_zone_status, merch_store_name, merch_store_status, active_from, active_until, sources]

const BTS_CITIES = [
  // 5월 공연 (5 도시)
  [100, 'Raymond James Stadium',     '남측 광장 ARMY 대기존',                          'provisional', 'Tampa Bay Boulevard Merchandise Stand',                'confirmed',   '2026-04-22', '2026-04-29', 'tampabay+baynews9+wtsp'],
  [101, 'Sun Bowl Stadium',          'ARMY Fan Plaza (Glory Field + GR2 Lot)',         'confirmed',   'Official BTS Merch Booths + Weverse Pickup',           'confirmed',   '2026-05-01', '2026-05-04', 'utep+ktsm+kfoxtv+kisselpaso+weverse'],
  [102, 'Estadio GNP Seguros',       'Puerta 6 대형 아미존',                           'provisional', 'VIP 사전 머치 + 일반 부스 미공개',                      'provisional', '2026-05-06', '2026-05-11', 'user+x_official_map'],
  [103, 'Stanford Stadium',          '캠퍼스 내 체험형 이벤트존',                       'provisional', 'Official BTS Merch Booths',                            'provisional', '2026-05-15', '2026-05-20', 'user+stanford_live'],
  [104, 'Allegiant Stadium',         'Lot B/C 보랏빛 시티 연계',                        'provisional', 'Off-Day Merch Booths (5/25, 5/26 사전 운영)',          'confirmed',   '2026-05-22', '2026-05-29', 'user+lasvegasweekly+allegiant'],

  // 6월 공연 (2 도시)
  [105, 'Busan Asiad Main Stadium',  'ARMY ZONE Membership Verification (External Plaza)', 'confirmed', 'Official Merch & Pickup Booths (Amazon Just Walk Out)', 'confirmed',   '2026-06-11', '2026-06-14', 'kpopworldtour+pollstar'],
  [37,  'Riyadh Air Metropolitano',  '경기장 외부 메인 팬 플라자',                      'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-06-25', '2026-06-28', 'user'],

  // 7월 공연 (4 도시)
  [41,  'King Baudouin Stadium',     '아토미움 인근 굿즈 수령처',                       'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-06-30', '2026-07-03', 'user'],
  [24,  'Tottenham Hotspur Stadium', '하이 로드 공식샵',                                'provisional', 'Official BTS Merch + VIP Access',                      'provisional', '2026-07-05', '2026-07-08', 'user+spurs_official'],
  [39,  'Allianz Arena',             'Esplanade 구역 아미존',                           'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-07-10', '2026-07-13', 'user+allianz_arena'],
  [19,  'Stade de France',           '경기장 외부 광장',                                'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-07-16', '2026-07-19', 'user+stadefrance'],

  // 8월 공연 (6 도시)
  [106, 'MetLife Stadium',           '주차장 내 대형 팬 빌리지',                        'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-07-31', '2026-08-03', 'user+metlife'],
  [107, 'Gillette Stadium',          '패트리어트 플레이스 야외 굿즈샵',                 'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-08-04', '2026-08-07', 'user+gillette'],
  [108, 'M&T Bank Stadium',          '경기장 메인 입구 전면 부스',                      'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-08-09', '2026-08-12', 'user+visitbaltimore'],
  [109, 'AT&T Stadium',              '밀러 라이트 하우스 광장 팬존',                    'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-08-14', '2026-08-17', 'user+att_stadium'],
  [110, 'Rogers Centre',             '보행자 전용 구역 굿즈 라인',                      'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-08-21', '2026-08-24', 'user'],
  [111, 'Soldier Field',             '뮤지엄 캠퍼스 인근 대기존',                       'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-08-26', '2026-08-29', 'user+soldierfield'],

  // 9월 공연 (1 도시, 4일)
  [124, 'SoFi Stadium',              '레이크 파크 공식 팝업스토어',                     'provisional', 'Official Pop-up Store',                                'provisional', '2026-08-31', '2026-09-07', 'user+sofistadium'],

  // 10월 공연 (5 도시 — 남미)
  [125, 'Estadio El Campin',         'VIP 전용 사전 머치',                              'provisional', 'VIP only Merch (일반 부스 미공개)',                    'provisional', '2026-10-01', '2026-10-04', 'user+ticketmaster_co'],
  [114, 'Estadio San Marcos',        'VIP 전용 사전 머치',                              'provisional', 'VIP only Merch (일반 부스 미공개)',                    'provisional', '2026-10-06', '2026-10-11', 'user+infobae_pe'],
  [115, 'Estadio Nacional Santiago', 'VIP 전용 사전 머치',                              'provisional', 'VIP only Merch (일반 부스 미공개)',                    'provisional', '2026-10-13', '2026-10-18', 'user+ticketmaster_cl'],
  [116, 'Estadio Monumental Buenos Aires', 'River Plate 메인 진입로 굿즈샵',           'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-10-22', '2026-10-25', 'user+df_entertainment'],
  [126, 'Allianz Parque',            '도로 통제 후 팬 대기존',                          'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-10-27', '2026-11-01', 'user+gazetasp'],

  // 11월 공연 (1 도시)
  [118, 'Kaohsiung National Stadium', '입구 광장 360도 체험존',                         'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-11-18', '2026-11-23', 'user'],

  // 12월 공연 (5 도시)
  [26,  'Rajamangala Stadium',       '야외 시장 형태 대형 굿즈샵',                      'provisional', 'Rajamangala Merch + Weverse Shop Pickup',              'confirmed',   '2026-12-02', '2026-12-07', 'user+thriftyexplorers+weverse'],
  [119, 'Bukit Jalil National Stadium', '중앙 광장 멤버십 전용 아미존',                 'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-12-11', '2026-12-14', 'user+livenationmy'],
  [27,  'Singapore National Stadium', 'Kallang Wave Mall (역사적 팬 모임 장소)',        'provisional', 'Pre-Show Playground + Official Merch',                 'provisional', '2026-12-16', '2026-12-23', 'user+thekallang+getgo'],
  [120, 'Gelora Bung Karno Main Stadium', '단지 내 대형 스크린 팬 이벤트',              'provisional', 'Official BTS Merch Stalls',                            'provisional', '2026-12-25', '2026-12-28', 'user'],

  // 2027년 공연 (4 도시) — 사용자 표 일정 (2027 확정)
  [121, 'Marvel Stadium',            '도크랜드 인근 팬 이벤트',                         'provisional', 'Official BTS Merch Stalls',                            'provisional', '2027-01-15', '2027-01-20', 'user'],
  [122, 'Accor Stadium',             '올림픽 파크 내 아미존',                           'provisional', 'Official BTS Merch Stalls',                            'provisional', '2027-02-19', '2027-02-22', 'user+austadiums'],
  [28,  'Kai Tak Stadium',           '신축 경기장 내 최첨단 팬존',                      'provisional', 'Official BTS Merch Stalls',                            'provisional', '2027-03-01', '2027-03-05', 'user'],
  [123, 'Philippine Arena',          '아레나 외부 대형 대기 구역',                      'provisional', 'Official BTS Merch Stalls',                            'provisional', '2027-03-12', '2027-03-15', 'user+billboardph'],
];

// ━━━━━━━━━━━ 좌표 수동 fallback (Wikipedia summary API 누락 도시) ━━━━━━━━━━━
// 사용자 승인 2026-04-26: Philippine Arena 좌표 수동 보강
const VENUE_COORD_FALLBACK = {
  123: { lat: 14.7903, lng: 121.0800 },  // Philippine Arena (Bocaue, Bulacan, PH)
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━ Wikipedia REST API ━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function wikipediaSummary(query) {
  const search = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=1`;
  try {
    const sRes = await fetch(search, { headers: { 'User-Agent': UA } });
    if (!sRes.ok) return { lat: null, lng: null, image: null, title: null };
    const sData = await sRes.json();
    if (!sData.pages?.[0]) return { lat: null, lng: null, image: null, title: null };
    const title = sData.pages[0].key;

    const summary = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sumRes = await fetch(summary, { headers: { 'User-Agent': UA } });
    if (!sumRes.ok) return { lat: null, lng: null, image: null, title };
    const sumData = await sumRes.json();

    return {
      title: sumData.title || title,
      lat: sumData.coordinates?.lat ?? null,
      lng: sumData.coordinates?.lon ?? null,
      image: sumData.originalimage?.source || sumData.thumbnail?.source || null,
      summary: sumData.extract?.slice(0, 200) || null,
    };
  } catch (e) {
    return { lat: null, lng: null, image: null, title: null, error: e.message };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━ 메인 ━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log(`\n=== BTS 96 row 시드 (${DRY_RUN ? 'DRY-RUN' : 'COMMIT'} 모드) ===\n`);
  console.log(`대상 도시: ${BTS_CITIES.length}`);
  console.log(`예상 row: ${BTS_CITIES.length * 3} (venue + army_zone + merch_store)\n`);

  // Phase 1: Wikipedia → venue 좌표/이미지
  console.log('━━━ Phase 1: Wikipedia venue 매핑 ━━━');
  const venueData = [];
  for (let i = 0; i < BTS_CITIES.length; i++) {
    const [city_id, venue_query] = BTS_CITIES[i];
    const wiki = await wikipediaSummary(venue_query);
    // 좌표 fallback 적용 (Wikipedia summary API 누락 시)
    if (!wiki.lat && VENUE_COORD_FALLBACK[city_id]) {
      wiki.lat = VENUE_COORD_FALLBACK[city_id].lat;
      wiki.lng = VENUE_COORD_FALLBACK[city_id].lng;
    }
    venueData.push({ city_id, venue_query, ...wiki });
    const status = wiki.lat ? '✓' : '✗';
    console.log(`  ${status} [${i+1}/${BTS_CITIES.length}] city_id=${city_id} "${venue_query}" → lat=${wiki.lat}, image=${wiki.image ? 'yes' : 'no'}`);
    await new Promise((r) => setTimeout(r, 200)); // Wikipedia rate-limit 보수
  }

  const successCount = venueData.filter((v) => v.lat !== null).length;
  console.log(`\n  결과: ${successCount}/${venueData.length} 좌표 확보 (${venueData.length - successCount} 실패)`);
  if (successCount < venueData.length) {
    console.log('  ⚠️ 실패 도시:');
    venueData.filter((v) => !v.lat).forEach((v) => console.log(`     - city_id=${v.city_id} "${v.venue_query}"`));
  }

  // Phase 2: 시드 데이터 미리보기
  console.log('\n━━━ Phase 2: 시드 데이터 미리보기 (96 row) ━━━');
  const seedRows = [];
  for (let i = 0; i < BTS_CITIES.length; i++) {
    const [city_id, venue_query, fz_name, fz_status, m_name, m_status, active_from, active_until, sources] = BTS_CITIES[i];
    const v = venueData[i];

    // 사용자 승인 2026-04-26: venue name = venue_query 사용 (Wikipedia 제목 무시, 사용자 친숙)
    seedRows.push({ city_id, type: 'landmark', seed_category: 'bts_venue',       name: venue_query,            lat: v.lat, lng: v.lng, image: v.image, status: 'confirmed' });
    seedRows.push({ city_id, type: 'landmark', seed_category: 'bts_army_zone',   name: fz_name,                lat: v.lat, lng: v.lng, image: v.image, status: fz_status });
    seedRows.push({ city_id, type: 'landmark', seed_category: 'bts_merch_store', name: m_name,                 lat: v.lat, lng: v.lng, image: v.image, status: m_status });
  }

  console.log(`  총 ${seedRows.length} row 준비 (예: 첫 6 row):`);
  seedRows.slice(0, 6).forEach((r) => {
    console.log(`    city_id=${r.city_id}, ${r.seed_category}, "${r.name}", status=${r.status}, lat=${r.lat}`);
  });

  // Phase 3.5: SQL 파일 출력 모드 (MCP execute_sql 입력용)
  if (SQL_FILE) {
    console.log('\n━━━ SQL 파일 출력 모드 ━━━');
    const esc = (s) => s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
    let sql = '';
    sql += "DELETE FROM places WHERE seed_category IN ('bts_venue','bts_army_zone','bts_merch_store');\n\n";
    sql += "INSERT INTO places (city_id, type, seed_category, name, latitude, longitude, photo_urls, is_verified, created_at, updated_at) VALUES\n";
    const insertRows = seedRows.map((r) => {
      const photoUrls = r.image ? `'${JSON.stringify([r.image]).replace(/'/g, "''")}'::jsonb` : 'NULL';
      const lat = r.lat == null ? 'NULL' : r.lat;
      const lng = r.lng == null ? 'NULL' : r.lng;
      return `  (${r.city_id}, '${r.type}', '${r.seed_category}', ${esc(r.name)}, ${lat}, ${lng}, ${photoUrls}, ${r.status === 'confirmed'}, NOW(), NOW())`;
    });
    sql += insertRows.join(',\n') + ';\n\n';

    sql += "WITH meta AS (\n  SELECT * FROM (VALUES\n";
    const metaRows = BTS_CITIES.map(([city_id, , fz_name, fz_status, m_name, m_status, active_from, active_until, sources]) => {
      return `    (${city_id}, ${esc(fz_name)}, ${esc(fz_status)}, ${esc(m_name)}, ${esc(m_status)}, ${esc(active_from)}::date, ${esc(active_until)}::date, ${esc(sources)})`;
    });
    sql += metaRows.join(',\n');
    sql += `\n  ) AS t(city_id, fz_name, fz_status, m_name, m_status, active_from, active_until, sources)\n),\n`;
    sql += "ids AS (\n  SELECT p.city_id,\n";
    sql += "    MAX(CASE WHEN p.seed_category='bts_army_zone' THEN p.id END) AS army_id,\n";
    sql += "    MAX(CASE WHEN p.seed_category='bts_merch_store' THEN p.id END) AS merch_id\n";
    sql += "  FROM places p WHERE p.seed_category IN ('bts_army_zone','bts_merch_store')\n  GROUP BY p.city_id\n)\n";
    sql += "UPDATE cities c SET\n";
    sql += "  bts_fan_zone = jsonb_build_object(\n";
    sql += "    'places_id', i.army_id, 'name', m.fz_name, 'data_status', m.fz_status,\n";
    sql += "    'source', m.sources, 'active_from', m.active_from, 'active_until', m.active_until,\n";
    sql += "    'last_updated', '2026-04-26'\n  ),\n";
    sql += "  bts_merch_info = jsonb_build_object(\n";
    sql += "    'places_id', i.merch_id, 'name', m.m_name, 'data_status', m.m_status,\n";
    sql += "    'source', m.sources, 'active_from', m.active_from, 'active_until', m.active_until,\n";
    sql += "    'last_updated', '2026-04-26'\n  )\n";
    sql += "FROM meta m JOIN ids i ON i.city_id = m.city_id\nWHERE c.id = m.city_id;\n";

    fs.writeFileSync(SQL_FILE, sql);
    const lines = sql.split('\n').length;
    console.log(`  ✅ SQL 파일 저장: ${SQL_FILE}`);
    console.log(`  ✅ ${lines} 줄, INSERT ${seedRows.length} row, UPDATE 32 도시`);
    return;
  }

  // Phase 3: DRY-RUN 종료
  if (DRY_RUN) {
    console.log('\n━━━ DRY-RUN 종료 ━━━');
    console.log(`  Wikipedia 호출: ${BTS_CITIES.length}`);
    console.log(`  좌표 확보: ${successCount}/${venueData.length}`);
    console.log(`  INSERT 예상: ${seedRows.length} row`);
    console.log(`  실제 DB 변경: 0 (dry-run)`);
    console.log(`\n  실제 시드 = node --env-file=.env scripts/p0-bts-96row-seed.mjs --commit`);
    return;
  }

  // Phase 4: 트랜잭션 INSERT (COMMIT 모드)
  console.log('\n━━━ Phase 4: 트랜잭션 INSERT (COMMIT 모드) ━━━');
  const client = new pg.Client({ connectionString: SUPA_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 기존 BTS row 삭제 (재실행 시 중복 방지)
    const delRes = await client.query(`
      DELETE FROM places
      WHERE seed_category IN ('bts_venue', 'bts_army_zone', 'bts_merch_store')
    `);
    console.log(`  DELETE 기존 BTS row: ${delRes.rowCount}`);

    // 96 row INSERT
    let inserted = 0;
    const insertedIds = {}; // { city_id: { venue: id, army_zone: id, merch_store: id } }

    for (const r of seedRows) {
      const photoUrls = r.image ? JSON.stringify([r.image]) : null;
      const result = await client.query(`
        INSERT INTO places (city_id, type, seed_category, name, latitude, longitude, photo_urls, is_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id
      `, [r.city_id, r.type, r.seed_category, r.name, r.lat, r.lng, photoUrls, r.status === 'confirmed']);
      inserted++;

      if (!insertedIds[r.city_id]) insertedIds[r.city_id] = {};
      insertedIds[r.city_id][r.seed_category] = result.rows[0].id;
    }
    console.log(`  INSERT 완료: ${inserted} row`);

    // 검증: INSERT 0 시 ROLLBACK (메모리 feedback_transaction_atomicity)
    if (inserted < BTS_CITIES.length * 3) {
      throw new Error(`🚨 INSERT ${inserted} < ${BTS_CITIES.length * 3} = ROLLBACK`);
    }

    // cities.bts_fan_zone / bts_merch_info JSON UPDATE (places.id 연결 + 메타데이터)
    let updated = 0;
    for (let i = 0; i < BTS_CITIES.length; i++) {
      const [city_id, , fz_name, fz_status, m_name, m_status, active_from, active_until, sources] = BTS_CITIES[i];
      const ids = insertedIds[city_id] || {};
      await client.query(`
        UPDATE cities SET
          bts_fan_zone = jsonb_build_object(
            'places_id',    $1::int,
            'name',         $2::text,
            'data_status',  $3::text,
            'source',       $4::text,
            'active_from',  $5::date,
            'active_until', $6::date,
            'last_updated', '2026-04-26'
          ),
          bts_merch_info = jsonb_build_object(
            'places_id',    $7::int,
            'name',         $8::text,
            'data_status',  $9::text,
            'source',       $10::text,
            'active_from',  $5::date,
            'active_until', $6::date,
            'last_updated', '2026-04-26'
          )
        WHERE id = $11
      `, [ids.bts_army_zone, fz_name, fz_status, sources, active_from, active_until,
          ids.bts_merch_store, m_name, m_status, sources, city_id]);
      updated++;
    }
    console.log(`  UPDATE cities 메타: ${updated} row`);

    await client.query('COMMIT');
    console.log('\n✅ COMMIT 성공');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`\n❌ ROLLBACK: ${e.message}`);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
