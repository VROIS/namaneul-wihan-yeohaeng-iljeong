/**
 * 모든 깨진 데이터 수정
 * 1. places 중복 제거
 * 2. instagram_hashtags 깨진 데이터 삭제 및 정상 데이터 추가
 */

const { Client } = require('pg');
require('dotenv').config();

async function fixAllBroken() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 1. places 중복 제거
    console.log('=== Step 1: Fix places duplicates ===\n');
    
    // places 중복 확인
    const placeDupes = await client.query(`
      SELECT name, COUNT(*) as cnt, array_agg(id ORDER BY id) as ids
      FROM places
      GROUP BY name
      HAVING COUNT(*) > 1
    `);
    
    console.log('Found ' + placeDupes.rows.length + ' duplicate place names');
    
    for (const row of placeDupes.rows) {
      const idsToDelete = row.ids.slice(1);
      for (const id of idsToDelete) {
        await client.query('DELETE FROM places WHERE id = $1', [id]);
      }
      console.log('  Deleted duplicates for: ' + row.name);
    }
    
    const placesCount = await client.query('SELECT COUNT(*) as cnt FROM places');
    console.log('Places after cleanup: ' + placesCount.rows[0].cnt);
    
    // 2. instagram_hashtags 깨진 데이터 삭제
    console.log('\n=== Step 2: Fix instagram_hashtags ===\n');
    
    // 깨진 데이터 삭제
    const deleteBroken = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE hashtag LIKE '%Ã%' 
         OR hashtag LIKE '%ì%'
         OR hashtag LIKE '%í%'
         OR hashtag LIKE '%ë%'
         OR hashtag LIKE '%Â%'
    `);
    console.log('Deleted ' + deleteBroken.rowCount + ' broken hashtags');
    
    // 중복 제거
    const deleteIGDupes = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE id NOT IN (
        SELECT MIN(id) FROM instagram_hashtags GROUP BY hashtag
      )
    `);
    console.log('Deleted ' + deleteIGDupes.rowCount + ' duplicate hashtags');
    
    // 정상 한글 해시태그 추가
    const koreanHashtags = [
      { hashtag: '#에펠탑', city: 'Paris', category: 'landmark' },
      { hashtag: '#파리여행', city: 'Paris', category: 'travel' },
      { hashtag: '#파리맛집', city: 'Paris', category: 'food' },
      { hashtag: '#몽마르뜨', city: 'Paris', category: 'landmark' },
      { hashtag: '#샹젤리제', city: 'Paris', category: 'landmark' },
      { hashtag: '#루브르박물관', city: 'Paris', category: 'landmark' },
      { hashtag: '#도쿄타워', city: 'Tokyo', category: 'landmark' },
      { hashtag: '#도쿄여행', city: 'Tokyo', category: 'travel' },
      { hashtag: '#도쿄맛집', city: 'Tokyo', category: 'food' },
      { hashtag: '#시부야', city: 'Tokyo', category: 'landmark' },
      { hashtag: '#신주쿠', city: 'Tokyo', category: 'landmark' },
      { hashtag: '#센소지', city: 'Tokyo', category: 'landmark' },
      { hashtag: '#오사카여행', city: 'Osaka', category: 'travel' },
      { hashtag: '#오사카맛집', city: 'Osaka', category: 'food' },
      { hashtag: '#도톤보리', city: 'Osaka', category: 'landmark' },
      { hashtag: '#서울여행', city: 'Seoul', category: 'travel' },
      { hashtag: '#서울맛집', city: 'Seoul', category: 'food' },
      { hashtag: '#경복궁', city: 'Seoul', category: 'landmark' },
      { hashtag: '#남산타워', city: 'Seoul', category: 'landmark' },
      { hashtag: '#홍대', city: 'Seoul', category: 'landmark' },
      { hashtag: '#명동', city: 'Seoul', category: 'landmark' },
      { hashtag: '#로마여행', city: 'Rome', category: 'travel' },
      { hashtag: '#콜로세움', city: 'Rome', category: 'landmark' },
      { hashtag: '#바티칸', city: 'Rome', category: 'landmark' },
      { hashtag: '#방콕여행', city: 'Bangkok', category: 'travel' },
      { hashtag: '#방콕맛집', city: 'Bangkok', category: 'food' },
      { hashtag: '#카오산로드', city: 'Bangkok', category: 'landmark' },
      { hashtag: '#뉴욕여행', city: 'New York', category: 'travel' },
      { hashtag: '#타임스퀘어', city: 'New York', category: 'landmark' },
      { hashtag: '#센트럴파크', city: 'New York', category: 'landmark' },
      { hashtag: '#런던여행', city: 'London', category: 'travel' },
      { hashtag: '#빅벤', city: 'London', category: 'landmark' },
      { hashtag: '#타워브릿지', city: 'London', category: 'landmark' },
      { hashtag: '#바르셀로나여행', city: 'Barcelona', category: 'travel' },
      { hashtag: '#사그라다파밀리아', city: 'Barcelona', category: 'landmark' },
      { hashtag: '#싱가포르여행', city: 'Singapore', category: 'travel' },
      { hashtag: '#마리나베이샌즈', city: 'Singapore', category: 'landmark' },
    ];
    
    let addedCount = 0;
    for (const tag of koreanHashtags) {
      const exists = await client.query(
        'SELECT id FROM instagram_hashtags WHERE hashtag = $1',
        [tag.hashtag]
      );
      
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO instagram_hashtags (hashtag, city, category, post_count) VALUES ($1, $2, $3, $4)',
          [tag.hashtag, tag.city, tag.category, 0]
        );
        addedCount++;
      }
    }
    console.log('Added ' + addedCount + ' new Korean hashtags');
    
    // 최종 확인
    console.log('\n=== Final Status ===\n');
    
    const finalPlaces = await client.query('SELECT COUNT(*) as cnt FROM places');
    const finalIG = await client.query('SELECT COUNT(*) as cnt FROM instagram_hashtags');
    
    console.log('places: ' + finalPlaces.rows[0].cnt + ' rows');
    console.log('instagram_hashtags: ' + finalIG.rows[0].cnt + ' rows');
    
    // 샘플 출력
    console.log('\ninstagram_hashtags sample:');
    const igSample = await client.query('SELECT id, hashtag, city FROM instagram_hashtags ORDER BY id LIMIT 20');
    igSample.rows.forEach(r => {
      console.log('  [' + r.id + '] ' + r.hashtag + ' (' + r.city + ')');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixAllBroken();
