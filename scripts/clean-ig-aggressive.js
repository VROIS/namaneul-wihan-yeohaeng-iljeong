/**
 * Instagram hashtags 강력 정리
 * - 한글 해시태그만 유지
 * - 영문 해시태그 삭제
 */

const { Client } = require('pg');
require('dotenv').config();

async function cleanIG() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 1. 한글이 아닌 해시태그 삭제 (#으로 시작하지 않거나 한글이 없는 것)
    console.log('=== Delete non-Korean hashtags ===');
    
    // 한글 해시태그만 남기기 (# + 한글 포함)
    const deleteNonKorean = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE hashtag !~ '#[가-힣]'
    `);
    console.log('Deleted ' + deleteNonKorean.rowCount + ' non-Korean hashtags');
    
    // 2. 중복 제거 (대소문자 구분 없이)
    console.log('\n=== Remove duplicates ===');
    const dupResult = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE id NOT IN (
        SELECT MIN(id) FROM instagram_hashtags GROUP BY LOWER(hashtag)
      )
    `);
    console.log('Removed ' + dupResult.rowCount + ' duplicates');
    
    // 3. 결과 확인
    console.log('\n=== Final Result ===');
    const all = await client.query('SELECT id, hashtag, category FROM instagram_hashtags ORDER BY hashtag');
    console.log('Total: ' + all.rows.length + ' hashtags\n');
    all.rows.forEach(r => console.log('  ' + r.hashtag + ' (' + (r.category || '-') + ')'));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

cleanIG();
