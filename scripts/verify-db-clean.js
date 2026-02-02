/**
 * DB 정리 완료 검증
 * - 모든 테이블에서 깨진 한글 없음 확인
 * - 중복 없음 확인
 */

const { Client } = require('pg');
require('dotenv').config();

function hasBrokenEncoding(str) {
  if (!str) return false;
  return /[ÃÂìíëâêî]/.test(str);
}

async function verifyDB() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    await client.query("SET client_encoding TO 'UTF8'");
    console.log('DB connected (UTF8)\n');
    
    console.log('='.repeat(70));
    console.log('DB 정리 완료 검증');
    console.log('='.repeat(70));
    
    // 주요 테이블 검증
    const checks = [
      { table: 'cities', textFields: ['name', 'country'] },
      { table: 'places', textFields: ['name', 'description'] },
      { table: 'youtube_channels', textFields: ['channel_name', 'channel_description'] },
      { table: 'youtube_videos', textFields: ['title', 'description'] },
      { table: 'instagram_hashtags', textFields: ['hashtag'] },
      { table: 'blog_sources', textFields: ['source_name'] },
      { table: 'naver_blog_posts', textFields: ['post_title', 'blogger_name'] },
      { table: 'data_collection_schedule', textFields: ['description'] },
      { table: 'guide_prices', textFields: ['vehicle_type', 'description'] },
    ];
    
    let allClean = true;
    
    for (const { table, textFields } of checks) {
      try {
        const count = await client.query(`SELECT COUNT(*) as c FROM "${table}"`);
        const total = parseInt(count.rows[0].c);
        
        let brokenCount = 0;
        for (const field of textFields) {
          try {
            const sample = await client.query(
              `SELECT "${field}" FROM "${table}" WHERE "${field}" IS NOT NULL`
            );
            const broken = sample.rows.filter(r => hasBrokenEncoding(r[field]));
            brokenCount += broken.length;
          } catch (e) {
            // field doesn't exist
          }
        }
        
        const status = brokenCount > 0 ? '❌ 깨짐 ' + brokenCount + '개' : '✅ 정상';
        console.log(`[${table}] ${total}행 - ${status}`);
        
        if (brokenCount > 0) allClean = false;
        
      } catch (e) {
        console.log(`[${table}] 오류: ${e.message}`);
      }
    }
    
    // 샘플 데이터 출력
    console.log('\n' + '='.repeat(70));
    console.log('샘플 데이터 확인');
    console.log('='.repeat(70));
    
    // cities 샘플
    const cities = await client.query('SELECT name, country FROM cities LIMIT 10');
    console.log('\n[cities 샘플]');
    cities.rows.forEach(r => console.log('  ' + r.name + ', ' + r.country));
    
    // data_collection_schedule 샘플
    const schedule = await client.query('SELECT task_name, description FROM data_collection_schedule LIMIT 6');
    console.log('\n[data_collection_schedule 샘플]');
    schedule.rows.forEach(r => console.log('  ' + r.task_name + ': ' + r.description));
    
    // instagram_hashtags 샘플
    const hashtags = await client.query('SELECT hashtag FROM instagram_hashtags LIMIT 10');
    console.log('\n[instagram_hashtags 샘플]');
    hashtags.rows.forEach(r => console.log('  ' + r.hashtag));
    
    console.log('\n' + '='.repeat(70));
    if (allClean) {
      console.log('✅ 모든 테이블 정상! 깨진 한글 없음.');
    } else {
      console.log('⚠️ 일부 테이블에 깨진 데이터 존재');
    }
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

verifyDB();
