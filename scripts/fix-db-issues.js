/**
 * DB 문제 수정 스크립트
 * 1. 중복 데이터 제거
 * 2. 한글 깨짐 수정 (SQL로 직접)
 */

const { Client } = require('pg');
require('dotenv').config();

async function fixDBIssues() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 1. 중복 제거
    console.log('='.repeat(60));
    console.log('Step 1: Remove Duplicates');
    console.log('='.repeat(60));
    
    // cities 중복 제거 (가장 낮은 ID 유지)
    const cityDeleteResult = await client.query(`
      DELETE FROM cities 
      WHERE id NOT IN (
        SELECT MIN(id) FROM cities GROUP BY name, country
      )
    `);
    console.log('  cities: ' + cityDeleteResult.rowCount + ' duplicates removed');
    
    // places 중복 제거
    const placeDeleteResult = await client.query(`
      DELETE FROM places 
      WHERE id NOT IN (
        SELECT MIN(id) FROM places GROUP BY name, city_id
      )
    `);
    console.log('  places: ' + placeDeleteResult.rowCount + ' duplicates removed');
    
    // youtube_channels 중복 제거
    const ytDeleteResult = await client.query(`
      DELETE FROM youtube_channels 
      WHERE id NOT IN (
        SELECT MIN(id) FROM youtube_channels GROUP BY channel_id
      )
    `);
    console.log('  youtube_channels: ' + ytDeleteResult.rowCount + ' duplicates removed');
    
    // instagram_hashtags 중복 제거
    const igDeleteResult = await client.query(`
      DELETE FROM instagram_hashtags 
      WHERE id NOT IN (
        SELECT MIN(id) FROM instagram_hashtags GROUP BY hashtag
      )
    `);
    console.log('  instagram_hashtags: ' + igDeleteResult.rowCount + ' duplicates removed');
    
    // blog_sources 중복 제거
    const blogDeleteResult = await client.query(`
      DELETE FROM blog_sources 
      WHERE id NOT IN (
        SELECT MIN(id) FROM blog_sources GROUP BY source_url
      )
    `);
    console.log('  blog_sources: ' + blogDeleteResult.rowCount + ' duplicates removed');
    
    // 2. 한글 깨짐 수정 (직접 UPDATE)
    console.log('\n' + '='.repeat(60));
    console.log('Step 2: Fix Korean Encoding');
    console.log('='.repeat(60));
    
    // 한글 수정 쿼리 실행
    const koreanFixes = [
      // 도시명
      ["UPDATE cities SET name = 'Seoul' WHERE name LIKE '%ì„œìš¸%'", 'Seoul'],
      ["UPDATE cities SET name = 'Tokyo' WHERE name LIKE '%ë„ì¿„%'", 'Tokyo'],
      ["UPDATE cities SET name = 'Osaka' WHERE name LIKE '%ì˜¤ì‚¬ì¹´%'", 'Osaka'],
      ["UPDATE cities SET name = 'Paris' WHERE name LIKE '%íŒŒë¦¬%'", 'Paris'],
      ["UPDATE cities SET name = 'Rome' WHERE name LIKE '%ë¡œë§ˆ%'", 'Rome'],
      ["UPDATE cities SET name = 'Venice' WHERE name LIKE '%ë² ë‹ˆìŠ¤%'", 'Venice'],
      ["UPDATE cities SET name = 'Florence' WHERE name LIKE '%í"¼ë Œì²´%'", 'Florence'],
      ["UPDATE cities SET name = 'Bangkok' WHERE name LIKE '%ë°©ì½•%'", 'Bangkok'],
      ["UPDATE cities SET name = 'Singapore' WHERE name LIKE '%ì‹±ê°€í¬ë¥´%'", 'Singapore'],
      ["UPDATE cities SET name = 'Da Nang' WHERE name LIKE '%ë‹¤ë‚­%'", 'Da Nang'],
      ["UPDATE cities SET name = 'Hanoi' WHERE name LIKE '%í•˜ë…¸ì´%'", 'Hanoi'],
      // 국가명
      ["UPDATE cities SET country = 'South Korea' WHERE country LIKE '%ëŒ€í•œë¯¼êµ­%'", 'South Korea'],
      ["UPDATE cities SET country = 'Japan' WHERE country LIKE '%ì¼ë³¸%'", 'Japan'],
      ["UPDATE cities SET country = 'France' WHERE country LIKE '%í"„ëž'ìŠ¤%'", 'France'],
      ["UPDATE cities SET country = 'Italy' WHERE country LIKE '%ì´íƒˆë¦¬ì•„%'", 'Italy'],
      ["UPDATE cities SET country = 'Thailand' WHERE country LIKE '%íƒœêµ­%'", 'Thailand'],
      ["UPDATE cities SET country = 'Singapore' WHERE country LIKE '%ì‹±ê°€í¬ë¥´%'", 'Singapore'],
      ["UPDATE cities SET country = 'Vietnam' WHERE country LIKE '%ë² íŠ¸ë‚¨%'", 'Vietnam'],
    ];
    
    let totalFixed = 0;
    for (const [query, label] of koreanFixes) {
      try {
        const result = await client.query(query);
        if (result.rowCount > 0) {
          console.log('  Fixed ' + result.rowCount + ' rows -> ' + label);
          totalFixed += result.rowCount;
        }
      } catch (e) {
        // ignore
      }
    }
    
    console.log('\n  Total fixed: ' + totalFixed + ' rows');
    
    // 3. 결과 확인
    console.log('\n' + '='.repeat(60));
    console.log('Step 3: Verify Results');
    console.log('='.repeat(60));
    
    const citySample = await client.query('SELECT id, name, country FROM cities LIMIT 15');
    console.log('\nCities sample:');
    citySample.rows.forEach(r => console.log('  [' + r.id + '] ' + r.name + ', ' + r.country));
    
    // 테이블 현황
    const tables = ['cities', 'places', 'youtube_channels', 'instagram_hashtags', 'blog_sources'];
    console.log('\nTable counts:');
    for (const table of tables) {
      const result = await client.query('SELECT COUNT(*) as cnt FROM "' + table + '"');
      console.log('  ' + table + ': ' + result.rows[0].cnt + ' rows');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('DB cleanup complete!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixDBIssues();
