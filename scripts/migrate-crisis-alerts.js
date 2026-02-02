/**
 * 위기 정보 테이블 마이그레이션
 * crisis_alerts 테이블에 새 컬럼 추가
 */

const { Client } = require('pg');
require('dotenv').config();

async function migrateCrisisAlerts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공');

    // 새 컬럼 추가 (존재하지 않는 경우만)
    const alterQueries = [
      // city 컬럼 (도시 이름 직접 저장)
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Paris'`,
      
      // type 컬럼 (strike, protest, traffic, weather, security)
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'strike'`,
      
      // 한글 제목
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS title_ko TEXT`,
      
      // 날짜 (YYYY-MM-DD)
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS date TEXT NOT NULL DEFAULT '2026-01-15'`,
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS end_date TEXT`,
      
      // 영향받는 교통수단/지역
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS affected JSONB DEFAULT '[]'`,
      
      // 여행자 조언
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS recommendation TEXT`,
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS recommendation_ko TEXT`,
      
      // 소스 정보
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'GDELT + Gemini'`,
    ];

    for (const query of alterQueries) {
      try {
        await client.query(query);
        console.log(`✅ 실행 완료: ${query.substring(0, 60)}...`);
      } catch (err) {
        // 이미 존재하는 컬럼이면 무시
        if (err.code === '42701') {
          console.log(`ℹ️  이미 존재: ${query.substring(0, 60)}...`);
        } else {
          console.error(`❌ 오류: ${err.message}`);
        }
      }
    }

    // 기존 데이터에 기본값 설정
    await client.query(`
      UPDATE crisis_alerts 
      SET city = 'Paris', 
          type = COALESCE(alert_type, 'strike'),
          date = COALESCE(TO_CHAR(start_date, 'YYYY-MM-DD'), '2026-01-15')
      WHERE city IS NULL OR city = ''
    `);
    console.log('✅ 기존 데이터 기본값 설정 완료');

    // 결과 확인
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'crisis_alerts' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 crisis_alerts 테이블 컬럼:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ 마이그레이션 완료!');
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
  } finally {
    await client.end();
  }
}

migrateCrisisAlerts();
