// ⚠️ 수정금지(승인필요) — BTS 도시 마스터 재시딩 스크립트 (사용자 2026-04-25 승인)
//
// 목적: cities 테이블 BTS 관련 데이터 재시딩 (공연 시간, 아카이브, 팬존/굿즈)
// 출처: venue 공식 + baynews9 + Shazam + Allegiant + Livenation + 사용자 제공 표 (2026-04-24)
// 딥서치 완료: 18 도시 시간 확정, 16 도시 미공개 (디폴트 20:00, time_confirmed=false)
//
// 실행 옵션:
//   node scripts/p0-bts-master-reseed.mjs --dry-run     ← 트랜잭션 롤백, 미리보기만
//   node scripts/p0-bts-master-reseed.mjs               ← 실제 커밋
//   node scripts/p0-bts-master-reseed.mjs --verify-only ← 현재 상태만 조회
//
// 실행 범위:
//   Step 1. cities ALTER: bts_show_times jsonb, bts_time_confirmed bool, bts_archived bool
//   Step 2. bts_concert_dates 전체 재작성 + bts_show_times 시드 (34 도시)
//   Step 3. 지난 공연 아카이브 (Goyang, Tokyo → bts_archived=true)
//   Step 4. 팬존/굿즈 정보 시드 (bts_fan_zone + bts_merch_info jsonb)
//   Step 5. 중복 도시 통합 (TODO: 별도 스텝 — FK 복잡성 때문에 본 스크립트 미포함)
//   Step 6. 검증 쿼리 + 결과 리포트

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const TODAY = new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════════════
// 데이터 상수 (single source of truth)
// ═══════════════════════════════════════════════════════════════════════════

// 1. 시간 확정 18 도시 (딥서치 2026-04-25 완료, venue 공식/Shazam/Allegiant/Livenation)
const CONFIRMED_SHOW_TIMES = {
  Goyang: [
    { date: '2026-04-09', time: '19:00' },
    { date: '2026-04-11', time: '19:00' },
    { date: '2026-04-12', time: '19:00' }, // 일요일도 정규 19:00 (matinee 아님)
  ],
  Tokyo: [
    { date: '2026-04-17', time: '18:30' },
    { date: '2026-04-18', time: '15:00' }, // ⚠️ 토요일 matinee (사용자 표의 "일요일 15:00" 오인)
  ],
  Tampa: [
    { date: '2026-04-25', time: '20:00' },
    { date: '2026-04-26', time: '20:00' },
    { date: '2026-04-28', time: '20:00' }, // ⚠️ DB 누락 (baynews9 공식 3회)
  ],
  'El Paso': [
    { date: '2026-05-02', time: '20:00' },
    { date: '2026-05-03', time: '20:00' },
  ],
  'Mexico City': [
    { date: '2026-05-07', time: '20:00' },
    { date: '2026-05-09', time: '20:00' }, // ⚠️ DB 누락
    { date: '2026-05-10', time: '20:00' }, // 일요일도 정규 20:00
  ],
  Stanford: [
    { date: '2026-05-16', time: '19:00' },
    { date: '2026-05-17', time: '19:00' },
    { date: '2026-05-19', time: '19:00' }, // ⚠️ DB 누락 (stanford.edu 공식 3회)
  ],
  'Las Vegas': [
    { date: '2026-05-23', time: '20:00' },
    { date: '2026-05-24', time: '20:00' }, // ⚠️ DB 누락 (일요일, 정규 20:00)
    { date: '2026-05-27', time: '20:00' }, // ⚠️ DB 누락
    { date: '2026-05-28', time: '20:00' },
  ],
  Busan: [
    { date: '2026-06-12', time: '19:00' },
    { date: '2026-06-13', time: '19:00' },
  ],
  Madrid: [
    { date: '2026-06-26', time: '20:00' },
    { date: '2026-06-27', time: '20:00' },
  ],
  Munich: [
    { date: '2026-07-11', time: '20:00' },
    { date: '2026-07-12', time: '20:00' },
  ],
  Paris: [
    { date: '2026-07-17', time: '20:00' },
    { date: '2026-07-18', time: '20:00' },
  ],
  'East Rutherford': [
    { date: '2026-08-01', time: '20:00' },
    { date: '2026-08-02', time: '20:00' },
  ],
  Foxborough: [
    { date: '2026-08-05', time: '20:00' },
    { date: '2026-08-06', time: '20:00' },
  ],
  Baltimore: [
    { date: '2026-08-10', time: '20:00' },
    { date: '2026-08-11', time: '20:00' },
  ],
  Arlington: [
    { date: '2026-08-15', time: '20:00' },
    { date: '2026-08-16', time: '20:00' },
  ],
  Toronto: [
    { date: '2026-08-22', time: '20:00' },
    { date: '2026-08-23', time: '20:00' },
  ],
  Chicago: [
    { date: '2026-08-27', time: '20:00' },
    { date: '2026-08-28', time: '20:00' },
  ],
  // LA (Inglewood) — 중복 도시 통합 후 적용. DB 현재는 'Los Angeles' 로 저장됨.
  'Los Angeles': [
    { date: '2026-09-01', time: '20:00' },
    { date: '2026-09-02', time: '20:00' },
    { date: '2026-09-05', time: '20:00' },
    { date: '2026-09-06', time: '20:00' },
  ],
};

// 2. 시간 미공개 16 도시 (Wikipedia 날짜 기반 디폴트 20:00, time_confirmed=false, cron 모니터링 대상)
const TBD_SHOW_TIMES = {
  Brussels: [['2026-07-01', '20:00'], ['2026-07-02', '20:00']],
  London: [['2026-07-06', '20:00'], ['2026-07-07', '20:00']], // curfew 22:30 확인
  Bogota: [['2026-10-02', '20:00'], ['2026-10-03', '20:00']],
  Lima: [['2026-10-07', '20:00'], ['2026-10-09', '20:00'], ['2026-10-10', '20:00']],
  Santiago: [['2026-10-14', '20:00'], ['2026-10-16', '20:00'], ['2026-10-17', '20:00']],
  'Buenos Aires': [['2026-10-21', '20:00'], ['2026-10-23', '20:00'], ['2026-10-24', '20:00']],
  'Sao Paulo': [['2026-10-28', '20:00'], ['2026-10-30', '20:00'], ['2026-10-31', '20:00']],
  Kaohsiung: [['2026-11-19', '20:00'], ['2026-11-21', '20:00'], ['2026-11-22', '20:00']],
  Bangkok: [['2026-12-03', '20:00'], ['2026-12-05', '20:00'], ['2026-12-06', '20:00']],
  'Kuala Lumpur': [['2026-12-12', '20:00'], ['2026-12-13', '20:00']],
  Singapore: [['2026-12-17', '20:00'], ['2026-12-19', '20:00'], ['2026-12-20', '20:00'], ['2026-12-22', '20:00']],
  Jakarta: [['2026-12-26', '20:00'], ['2026-12-27', '20:00']],
  Melbourne: [['2027-02-12', '20:00'], ['2027-02-13', '20:00']],
  Sydney: [['2027-02-20', '20:00'], ['2027-02-21', '20:00']],
  'Hong Kong': [['2027-03-04', '20:00'], ['2027-03-06', '20:00'], ['2027-03-07', '20:00']],
  Manila: [['2027-03-13', '20:00'], ['2027-03-14', '20:00']],
};

// 3. 아카이브 대상 (오늘 2026-04-25 기준 마지막 공연일 지남)
const ARCHIVE_CITIES = ['Goyang', 'Tokyo'];

// 4. 사용자 제공 팬존/굿즈 정보 (2026-04-24 사용자 표 기반)
const FAN_ZONE_MERCH = {
  Goyang: { fan_zone: 'ARMY ZONE (광장 내)' },
  Tokyo: { merch: '22번 게이트 팝업스토어' },
  Tampa: { merch: 'Tampa Bay Blvd 앞 merchandise tent (4/22-29)' }, // 딥서치 정정 (사용자 표 "남측 광장" 대신 공식)
  'El Paso': { notes: 'K-팝 최초 선 보울 입성' },
  'Mexico City': { fan_zone: 'Puerta 6 대형 아미존' },
  Stanford: { fan_zone: '캠퍼스 내 체험형 이벤트존' },
  'Las Vegas': { fan_zone: "Lot B/C '보랏빛 시티' 연계" },
  Busan: { fan_zone: 'FESTA 특설 조각광장 이벤트' },
  Madrid: { fan_zone: '경기장 외부 메인 팬 플라자' },
  Brussels: { merch: '아토미움 인근 굿즈 수령처' },
  London: { merch: '하이 로드(High Road) 공식샵' },
  Munich: { fan_zone: '에스플러네이드 구역 아미존' },
  Paris: { fan_zone: '경기장 외부 광장 대규모 이벤트' },
  'East Rutherford': { fan_zone: '주차장 내 대형 팬 빌리지' },
  Foxborough: { merch: '패트리어트 플레이스 야외 굿즈샵' },
  Baltimore: { fan_zone: '경기장 메인 입구 전면 부스' },
  Arlington: { fan_zone: '밀러 라이트 하우스 광장 팬존' },
  Toronto: { merch: '보행자 전용 구역 굿즈 라인' },
  Chicago: { fan_zone: '뮤지엄 캠퍼스 인근 대기존' },
  'Los Angeles': { merch: '레이크 파크 공식 팝업스토어' }, // LA (Inglewood) 실제
  Bogota: { notes: '보고타 최초 단독 공연' },
  Lima: { fan_zone: '중앙 광장 내 아미존' },
  Santiago: { fan_zone: '경기장 주변 굿즈 부스' },
  'Buenos Aires': { merch: '진입로 메인 굿즈샵' },
  'Sao Paulo': { fan_zone: '도로 통제 후 팬 대기존' },
  Kaohsiung: { fan_zone: '입구 광장 360도 체험존' },
  Bangkok: { merch: '야외 시장 형태 대형 굿즈샵' },
  'Kuala Lumpur': { fan_zone: '중앙 광장 멤버십 전용 아미존' },
  Singapore: { fan_zone: '칼랑 웨이브 몰 연계' },
  Jakarta: { fan_zone: '단지 내 대형 스크린 팬 이벤트' },
  Melbourne: { fan_zone: '도크랜드 인근 팬 이벤트' },
  Sydney: { fan_zone: '올림픽 파크 내 아미존' },
  'Hong Kong': { fan_zone: '신축 경기장 내 최첨단 팬존' },
  Manila: { fan_zone: '아레나 외부 대형 대기 구역' },
};

// ═══════════════════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════════════════

async function run() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();

  const mode = VERIFY_ONLY ? 'VERIFY-ONLY' : DRY_RUN ? 'DRY-RUN' : 'COMMIT';
  console.log(`\n🚀 [BTS-Master-Reseed] 시작 (${mode}) @ ${TODAY}\n`);

  if (VERIFY_ONLY) {
    await verify(db);
    await db.end();
    return;
  }

  try {
    await db.query('BEGIN');

    // Step 1. ALTER cities
    console.log('[Step 1] cities 테이블 확장 (idempotent)');
    await db.query(`
      ALTER TABLE cities
        ADD COLUMN IF NOT EXISTS bts_show_times jsonb,
        ADD COLUMN IF NOT EXISTS bts_time_confirmed BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS bts_archived BOOLEAN DEFAULT false
    `);
    console.log('  ✅ bts_show_times jsonb / bts_time_confirmed bool / bts_archived bool\n');

    // Step 2. 전체 공연 시간 시드
    console.log('[Step 2] 공연 시간 시드 (18 확정 + 16 TBD = 34 도시)');
    const allTimes = {};
    for (const [city, arr] of Object.entries(CONFIRMED_SHOW_TIMES)) {
      allTimes[city] = { times: arr, confirmed: true };
    }
    for (const [city, tuples] of Object.entries(TBD_SHOW_TIMES)) {
      allTimes[city] = {
        times: tuples.map(([date, time]) => ({ date, time })),
        confirmed: false,
      };
    }

    let confirmedCount = 0;
    let tbdCount = 0;
    let notFoundCount = 0;
    for (const [cityName, { times, confirmed }] of Object.entries(allTimes)) {
      const dates = times.map((t) => t.date);
      const r = await db.query(
        `
        UPDATE cities
        SET bts_concert_dates = $1::jsonb,
            bts_show_times = $2::jsonb,
            bts_time_confirmed = $3
        WHERE name_en = $4 OR name = $4
      `,
        [JSON.stringify(dates), JSON.stringify(times), confirmed, cityName]
      );
      const icon = confirmed ? '✅' : '⏳';
      console.log(
        `  ${icon} ${cityName.padEnd(20)} ${dates.length}회 공연 (rows: ${r.rowCount})`
      );
      if (r.rowCount === 0) notFoundCount++;
      else if (confirmed) confirmedCount++;
      else tbdCount++;
    }
    console.log(`\n  요약: 확정 ${confirmedCount} / TBD ${tbdCount} / 매칭 실패 ${notFoundCount}\n`);

    // Step 3. 지난 공연 아카이브
    console.log(`[Step 3] 지난 공연 아카이브 (오늘 ${TODAY})`);
    for (const city of ARCHIVE_CITIES) {
      const r = await db.query(
        `
        UPDATE cities SET bts_archived = true
        WHERE (name_en = $1 OR name = $1) AND bts_rank IS NOT NULL
      `,
        [city]
      );
      console.log(`  🗄️ ${city.padEnd(20)} 아카이브 (rows: ${r.rowCount})`);
    }
    console.log();

    // Step 4. 팬존/굿즈 시드
    console.log('[Step 4] 팬존/굿즈 정보 시드');
    let fanZoneCount = 0;
    let merchCount = 0;
    let noteCount = 0;
    for (const [city, info] of Object.entries(FAN_ZONE_MERCH)) {
      const fanZoneJson = info.fan_zone
        ? JSON.stringify({ description: info.fan_zone, source: 'user_provided_2026-04-24', verified: false })
        : null;
      const merchJson = info.merch
        ? JSON.stringify({ description: info.merch, source: 'user_provided_2026-04-24', verified: false })
        : null;

      const r = await db.query(
        `
        UPDATE cities SET
          bts_fan_zone = COALESCE($1::jsonb, bts_fan_zone),
          bts_merch_info = COALESCE($2::jsonb, bts_merch_info),
          bts_special_notes = COALESCE(bts_special_notes, $3)
        WHERE name_en = $4 OR name = $4
      `,
        [fanZoneJson, merchJson, info.notes || null, city]
      );

      const flags = [
        info.fan_zone ? 'FZ' : '--',
        info.merch ? 'MS' : '--',
        info.notes ? 'NT' : '--',
      ].join(' ');
      console.log(`  🎁 ${city.padEnd(20)} [${flags}] (rows: ${r.rowCount})`);
      if (info.fan_zone) fanZoneCount++;
      if (info.merch) merchCount++;
      if (info.notes) noteCount++;
    }
    console.log(`\n  요약: 팬존 ${fanZoneCount} / 굿즈 ${merchCount} / 특이사항 ${noteCount}\n`);

    // Step 5. 중복 도시 통합 (TODO: 별도 스크립트)
    console.log('[Step 5] 중복 도시 통합');
    console.log('  ⚠️  TODO: place_seed_raw.city_id FK 이동 + cities 삭제');
    console.log('  ⚠️  LA Los Angeles(x2) / Bogotá+Bogota / São Paulo+Sao Paulo');
    console.log('  ⚠️  bts_rank 재매핑 (20/26/30 중복)');
    console.log('  ⚠️  본 스크립트 미포함 — 별도 p0-bts-dedupe-cities.mjs 작성 예정');
    console.log();

    // 커밋 or 롤백
    if (DRY_RUN) {
      await db.query('ROLLBACK');
      console.log('🔄 [DRY-RUN] 모든 변경사항 롤백됨\n');
    } else {
      await db.query('COMMIT');
      console.log('✅ [COMMIT] 변경사항 영구 저장 완료\n');
    }

    // Step 6. 검증
    await verify(db);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('❌ 오류 발생, 롤백:', err.message);
    throw err;
  } finally {
    await db.end();
  }
}

async function verify(db) {
  console.log('🔍 [Verify] 최종 상태 검증\n');

  // 신규 컬럼 존재 여부 확인 (ALTER 전에도 동작해야 함)
  const colCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'cities'
      AND column_name IN ('bts_show_times', 'bts_time_confirmed', 'bts_archived')
  `);
  const existingCols = new Set(colCheck.rows.map((r) => r.column_name));
  const hasShowTimes = existingCols.has('bts_show_times');
  const hasConfirmed = existingCols.has('bts_time_confirmed');
  const hasArchived = existingCols.has('bts_archived');

  console.log('  신규 컬럼 상태:');
  console.log(`    bts_show_times:     ${hasShowTimes ? '✅ 존재' : '❌ 없음 (ALTER 필요)'}`);
  console.log(`    bts_time_confirmed: ${hasConfirmed ? '✅ 존재' : '❌ 없음 (ALTER 필요)'}`);
  console.log(`    bts_archived:       ${hasArchived ? '✅ 존재' : '❌ 없음 (ALTER 필요)'}\n`);

  const statusExpr = hasArchived && hasConfirmed
    ? `CASE WHEN bts_archived THEN '🗄️ ' ELSE '' END ||
       CASE WHEN bts_time_confirmed THEN '✅' ELSE '⏳' END`
    : `'—'`;
  const timesExpr = hasShowTimes
    ? `jsonb_array_length(COALESCE(bts_show_times, '[]'::jsonb))`
    : `0`;

  const { rows } = await db.query(`
    SELECT
      bts_rank,
      name_en,
      ${statusExpr} AS status,
      jsonb_array_length(COALESCE(bts_concert_dates, '[]'::jsonb)) AS dates,
      ${timesExpr} AS times,
      CASE WHEN bts_fan_zone IS NOT NULL THEN 'Y' ELSE '-' END AS fz,
      CASE WHEN bts_merch_info IS NOT NULL THEN 'Y' ELSE '-' END AS ms
    FROM cities WHERE bts_rank IS NOT NULL
    ORDER BY bts_rank, name_en
  `);
  console.table(rows);

  // 통계
  const confirmedExpr = hasConfirmed ? `COUNT(*) FILTER (WHERE bts_time_confirmed = true)` : `0`;
  const archivedExpr = hasArchived ? `COUNT(*) FILTER (WHERE bts_archived = true)` : `0`;
  const timesStatExpr = hasShowTimes ? `COUNT(*) FILTER (WHERE bts_show_times IS NOT NULL)` : `0`;

  const stats = await db.query(`
    SELECT
      COUNT(*) AS total,
      ${confirmedExpr} AS confirmed,
      ${archivedExpr} AS archived,
      COUNT(*) FILTER (WHERE bts_fan_zone IS NOT NULL) AS has_fz,
      COUNT(*) FILTER (WHERE bts_merch_info IS NOT NULL) AS has_ms,
      ${timesStatExpr} AS has_times
    FROM cities WHERE bts_rank IS NOT NULL
  `);
  console.log('\n[Stats]', stats.rows[0]);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
