const { Client } = require('pg');
require('dotenv').config();

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log('=== 위기 정보 DB 현황 ===\n');
  
  // 총 개수
  const total = await client.query('SELECT COUNT(*) FROM crisis_alerts');
  console.log('총 위기 알림:', total.rows[0].count);
  
  // 활성 알림
  const active = await client.query('SELECT COUNT(*) FROM crisis_alerts WHERE is_active = true');
  console.log('활성 알림:', active.rows[0].count);
  
  // 도시별
  const byCity = await client.query(`
    SELECT city, COUNT(*) as cnt 
    FROM crisis_alerts 
    WHERE is_active = true 
    GROUP BY city
  `);
  console.log('\n도시별 알림:');
  byCity.rows.forEach(r => console.log(`  ${r.city}: ${r.cnt}개`));
  
  // 샘플 데이터
  const samples = await client.query(`
    SELECT id, city, type, title_ko, date, severity, is_active 
    FROM crisis_alerts 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  console.log('\n최근 5개 알림:');
  samples.rows.forEach(r => {
    console.log(`  ${r.id}. [${r.city}] ${r.title_ko} (${r.date}, 심각도: ${r.severity})`);
  });
  
  await client.end();
}
check();
