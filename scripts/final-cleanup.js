const { Client } = require('pg');
require('dotenv').config();

async function cleanDuplicates() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('DB connected');
  
  // cities 중복 제거 (다시 실행 - 이름이 같아진 후)
  const result = await client.query('DELETE FROM cities WHERE id NOT IN (SELECT MIN(id) FROM cities GROUP BY name, country)');
  console.log('cities duplicates removed: ' + result.rowCount);
  
  // places 중복 제거
  const result2 = await client.query('DELETE FROM places WHERE id NOT IN (SELECT MIN(id) FROM places GROUP BY name)');
  console.log('places duplicates removed: ' + result2.rowCount);
  
  // instagram_hashtags 중복 제거
  const result3 = await client.query('DELETE FROM instagram_hashtags WHERE id NOT IN (SELECT MIN(id) FROM instagram_hashtags GROUP BY hashtag)');
  console.log('instagram_hashtags duplicates removed: ' + result3.rowCount);
  
  // 결과 확인
  const tables = ['cities', 'places', 'youtube_channels', 'instagram_hashtags', 'blog_sources'];
  console.log('\nFinal counts:');
  for (const table of tables) {
    const r = await client.query('SELECT COUNT(*) as cnt FROM "' + table + '"');
    console.log('  ' + table + ': ' + r.rows[0].cnt);
  }
  
  // cities 샘플
  const cities = await client.query('SELECT id, name, country FROM cities ORDER BY id');
  console.log('\nAll cities (' + cities.rows.length + '):');
  cities.rows.forEach(function(r) {
    console.log('  [' + r.id + '] ' + r.name + ', ' + r.country);
  });
  
  await client.end();
}
cleanDuplicates();
