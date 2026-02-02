/**
 * Instagram hashtags 최종 정리
 */

const { Client } = require('pg');
require('dotenv').config();

async function cleanupIG() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 중복 제거
    console.log('=== Remove duplicates ===');
    const dupResult = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE id NOT IN (
        SELECT MIN(id) FROM instagram_hashtags GROUP BY hashtag
      )
    `);
    console.log('Removed ' + dupResult.rowCount + ' duplicates');
    
    // 최종 확인
    console.log('\n=== Final instagram_hashtags ===');
    const all = await client.query('SELECT id, hashtag, category FROM instagram_hashtags ORDER BY hashtag');
    console.log('Total: ' + all.rows.length + ' hashtags\n');
    all.rows.forEach(r => console.log('  [' + r.id + '] ' + r.hashtag + ' (' + (r.category || 'null') + ')'));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

cleanupIG();
