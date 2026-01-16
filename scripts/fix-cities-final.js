const { Client } = require('pg');
require('dotenv').config();

async function fixCities() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('DB connected\n');
  
  // 실제 ID 확인
  const cities = await client.query('SELECT id, name, country FROM cities ORDER BY name, id');
  console.log('All cities by name (actual IDs):');
  cities.rows.forEach(function(r) {
    console.log('  ID=' + r.id + ' | ' + r.name + ', ' + r.country);
  });
  
  // 중복 찾기 (같은 이름, 같은 국가)
  const dupes = await client.query(`
    SELECT name, country, COUNT(*) as cnt, array_agg(id ORDER BY id) as ids
    FROM cities 
    GROUP BY name, country 
    HAVING COUNT(*) > 1
    ORDER BY name
  `);
  
  console.log('\n\nDuplicates found (' + dupes.rows.length + ' groups):');
  dupes.rows.forEach(function(r) {
    console.log('  ' + r.name + ', ' + r.country + ' -> IDs: ' + r.ids.join(', '));
  });
  
  // 중복 삭제 (가장 작은 ID 유지)
  if (dupes.rows.length > 0) {
    console.log('\n\nDeleting duplicates (keeping lowest ID)...');
    
    for (const row of dupes.rows) {
      const idsToDelete = row.ids.slice(1); // 첫번째 제외하고 삭제
      for (const id of idsToDelete) {
        await client.query('DELETE FROM cities WHERE id = $1', [id]);
        console.log('  Deleted ID ' + id + ' (' + row.name + ')');
      }
    }
  }
  
  // 최종 결과
  const finalCities = await client.query('SELECT id, name, country FROM cities ORDER BY id');
  console.log('\n\nFinal cities (' + finalCities.rows.length + '):');
  finalCities.rows.forEach(function(r) {
    console.log('  [' + r.id + '] ' + r.name + ', ' + r.country);
  });
  
  await client.end();
}
fixCities();
