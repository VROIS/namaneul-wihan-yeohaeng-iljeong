/**
 * 테스트용 일정 데이터 생성
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTestItinerary() {
  const client = await pool.connect();
  try {
    console.log('🔗 Supabase 연결 성공');
    
    // 기존 테스트 일정 확인
    const existing = await client.query('SELECT id FROM itineraries LIMIT 1');
    
    if (existing.rows.length > 0) {
      console.log('📋 기존 일정 ID:', existing.rows[0].id);
      console.log('⏭️ 테스트 일정이 이미 존재합니다.');
      return;
    }
    
    // cities 테이블에서 파리 ID 가져오기
    const cityResult = await client.query("SELECT id FROM cities WHERE name = 'Paris' OR name = '파리' LIMIT 1");
    const cityId = cityResult.rows[0]?.id || 1;
    
    // 테스트 일정 생성
    const insertResult = await client.query(`
      INSERT INTO itineraries (
        title,
        user_id,
        city_id,
        start_date,
        end_date,
        vibes,
        companion_type,
        companion_count,
        travel_style,
        mobility_style,
        curation_focus,
        protagonist_sentence,
        status
      ) VALUES (
        '파리 가족 여행 테스트',
        'test-user-001',
        $1,
        '2026-02-01',
        '2026-02-03',
        '["Romantic", "Foodie", "Culture"]',
        'Family',
        4,
        'luxury',
        'Moderate',
        'Kids',
        '5살 아이를 동반한 한국인 가족의 로맨틱 파리 여행',
        'completed'
      ) RETURNING id
    `, [cityId]);
    
    console.log('✅ 테스트 일정 생성 완료! ID:', insertResult.rows[0].id);
    console.log('🎉 이제 테스트 페이지에서 이 ID로 영상 생성을 테스트하세요.');
    
  } catch (err) {
    console.error('❌ 오류:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

createTestItinerary();
