const { Client } = require('pg');
require('dotenv').config();

async function checkApiKeys() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log('=== DB의 API 키 현황 ===\n');
  
  const result = await client.query('SELECT key_name, is_active, LENGTH(key_value) as key_length FROM api_keys');
  
  result.rows.forEach(row => {
    console.log(`${row.key_name}: ${row.is_active ? '✅ 활성' : '❌ 비활성'} (길이: ${row.key_length})`);
  });
  
  // GEMINI_API_KEY가 있는지 확인
  const gemini = await client.query("SELECT key_name, key_value FROM api_keys WHERE key_name = 'GEMINI_API_KEY'");
  if (gemini.rows.length > 0) {
    const key = gemini.rows[0].key_value;
    console.log(`\nGEMINI_API_KEY: ${key ? key.substring(0, 10) + '...' : 'NULL'}`);
  } else {
    console.log('\n⚠️ GEMINI_API_KEY가 DB에 없습니다!');
  }
  
  await client.end();
}
checkApiKeys();
