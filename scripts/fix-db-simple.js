/**
 * DB 정리 스크립트 (단순 버전)
 * 1. 중복 제거
 * 2. 영문으로 통일 (깨진 한글 제거)
 */

const { Client } = require('pg');
require('dotenv').config();

async function fixDB() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 1. 중복 제거
    console.log('=== Step 1: Remove Duplicates ===\n');
    
    const dupQueries = [
      ['cities', 'DELETE FROM cities WHERE id NOT IN (SELECT MIN(id) FROM cities GROUP BY name, country)'],
      ['places', 'DELETE FROM places WHERE id NOT IN (SELECT MIN(id) FROM places GROUP BY name, city_id)'],
      ['youtube_channels', 'DELETE FROM youtube_channels WHERE id NOT IN (SELECT MIN(id) FROM youtube_channels GROUP BY channel_id)'],
      ['instagram_hashtags', 'DELETE FROM instagram_hashtags WHERE id NOT IN (SELECT MIN(id) FROM instagram_hashtags GROUP BY hashtag)'],
      ['blog_sources', 'DELETE FROM blog_sources WHERE id NOT IN (SELECT MIN(id) FROM blog_sources GROUP BY source_url)'],
    ];
    
    for (const [table, query] of dupQueries) {
      const result = await client.query(query);
      console.log(table + ': ' + result.rowCount + ' duplicates removed');
    }
    
    // 2. 깨진 한글 데이터 영문으로 수정
    console.log('\n=== Step 2: Fix Broken Korean (to English) ===\n');
    
    // 깨진 데이터 찾아서 영문으로 교체
    const fixQueries = [
      // 특수문자가 포함된 도시명 감지 및 수정 (ASCII가 아닌 문자 포함)
      "UPDATE cities SET name = 'Seoul', country = 'South Korea' WHERE id = (SELECT MIN(id) FROM cities WHERE name ~ '[^a-zA-Z0-9 ,.-]' AND name NOT SIMILAR TO '%[가-힣]%' LIMIT 1)",
    ];
    
    // 더 간단한 방법: 깨진 데이터 삭제 후 정상 데이터만 유지
    // 깨진 한글은 특정 패턴을 가짐: Ã, ì, í, ë 등
    const brokenPattern = await client.query(`
      SELECT id, name, country FROM cities 
      WHERE name LIKE '%Ã%' OR name LIKE '%ì%' OR name LIKE '%í%' OR name LIKE '%ë%'
         OR country LIKE '%Ã%' OR country LIKE '%ì%' OR country LIKE '%í%' OR country LIKE '%ë%'
    `);
    
    console.log('Found ' + brokenPattern.rows.length + ' rows with broken encoding');
    
    if (brokenPattern.rows.length > 0) {
      // 깨진 데이터를 영문으로 업데이트
      const cityMapping = {
        1: { name: 'Seoul', country: 'South Korea' },
        2: { name: 'Tokyo', country: 'Japan' },
        3: { name: 'Osaka', country: 'Japan' },
        4: { name: 'Paris', country: 'France' },
        5: { name: 'Rome', country: 'Italy' },
        6: { name: 'Venice', country: 'Italy' },
        7: { name: 'Florence', country: 'Italy' },
        8: { name: 'Bangkok', country: 'Thailand' },
        9: { name: 'Singapore', country: 'Singapore' },
        10: { name: 'Da Nang', country: 'Vietnam' },
        11: { name: 'Hanoi', country: 'Vietnam' },
        12: { name: 'Barcelona', country: 'Spain' },
        13: { name: 'Madrid', country: 'Spain' },
        14: { name: 'Milan', country: 'Italy' },
        15: { name: 'Amsterdam', country: 'Netherlands' },
        16: { name: 'London', country: 'United Kingdom' },
        17: { name: 'Berlin', country: 'Germany' },
        18: { name: 'Munich', country: 'Germany' },
        19: { name: 'Vienna', country: 'Austria' },
        20: { name: 'Prague', country: 'Czech Republic' },
        21: { name: 'Budapest', country: 'Hungary' },
        22: { name: 'Nice', country: 'France' },
        23: { name: 'Lisbon', country: 'Portugal' },
        24: { name: 'Athens', country: 'Greece' },
        25: { name: 'Istanbul', country: 'Turkey' },
      };
      
      for (const row of brokenPattern.rows) {
        const mapping = cityMapping[row.id];
        if (mapping) {
          await client.query(
            'UPDATE cities SET name = $1, country = $2 WHERE id = $3',
            [mapping.name, mapping.country, row.id]
          );
          console.log('Fixed city ID ' + row.id + ' -> ' + mapping.name + ', ' + mapping.country);
        }
      }
    }
    
    // 3. 결과 확인
    console.log('\n=== Step 3: Verify Results ===\n');
    
    const citySample = await client.query('SELECT id, name, country FROM cities ORDER BY id LIMIT 20');
    console.log('Cities:');
    citySample.rows.forEach(r => console.log('  [' + r.id + '] ' + r.name + ', ' + r.country));
    
    const tables = ['cities', 'places', 'youtube_channels', 'instagram_hashtags', 'blog_sources'];
    console.log('\nTable counts:');
    for (const table of tables) {
      const result = await client.query('SELECT COUNT(*) as cnt FROM "' + table + '"');
      console.log('  ' + table + ': ' + result.rows[0].cnt + ' rows');
    }
    
    console.log('\n=== Done! ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixDB();
