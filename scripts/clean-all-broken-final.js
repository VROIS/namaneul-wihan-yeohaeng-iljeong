/**
 * 모든 깨진 데이터 최종 정리
 * - description 필드 포함 전체 정리
 */

const { Client } = require('pg');
require('dotenv').config();

async function cleanAll() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    console.log('='.repeat(70));
    console.log('모든 깨진 데이터 최종 정리');
    console.log('='.repeat(70));
    
    // 깨진 인코딩 패턴
    const brokenPattern = `
      LIKE '%Ã%' OR LIKE '%ì%' OR LIKE '%í%' OR LIKE '%ë%' 
      OR LIKE '%â%' OR LIKE '%ê%' OR LIKE '%î%' OR LIKE '%Â%'
    `;
    
    // 1. naver_blog_posts - 깨진 description 삭제
    console.log('\n[1] naver_blog_posts');
    const naver1 = await client.query(`
      DELETE FROM naver_blog_posts 
      WHERE description LIKE '%ì%' OR description LIKE '%ë%' OR description LIKE '%Ã%'
    `);
    console.log('  깨진 description: ' + naver1.rowCount + '개 삭제');
    
    // 중복 삭제
    await client.query(`
      DELETE FROM naver_blog_posts 
      WHERE id NOT IN (SELECT MIN(id) FROM naver_blog_posts GROUP BY post_url)
    `);
    
    // 2. youtube_videos - 깨진 데이터 삭제
    console.log('\n[2] youtube_videos');
    const yt1 = await client.query(`
      DELETE FROM youtube_videos 
      WHERE title LIKE '%ì%' OR title LIKE '%ë%' OR title LIKE '%Ã%'
         OR description LIKE '%ì%' OR description LIKE '%ë%' OR description LIKE '%Ã%'
    `);
    console.log('  깨진 행: ' + yt1.rowCount + '개 삭제');
    
    // 3. tripadvisor_data - 깨진 데이터 삭제
    console.log('\n[3] tripadvisor_data');
    const trip1 = await client.query(`
      DELETE FROM tripadvisor_data 
      WHERE recent_review_summary LIKE '%ì%' OR recent_review_summary LIKE '%ë%'
         OR tripadvisor_category LIKE '%ì%' OR tripadvisor_category LIKE '%ë%'
    `);
    console.log('  깨진 행: ' + trip1.rowCount + '개 삭제');
    
    // 4. youtube_place_mentions - 깨진 데이터 삭제
    console.log('\n[4] youtube_place_mentions');
    const ytm1 = await client.query(`
      DELETE FROM youtube_place_mentions 
      WHERE place_name LIKE '%ì%' OR place_name LIKE '%ë%'
         OR city_name LIKE '%ì%' OR city_name LIKE '%ë%'
         OR summary LIKE '%ì%' OR summary LIKE '%ë%'
    `);
    console.log('  깨진 행: ' + ytm1.rowCount + '개 삭제');
    
    // 5. place_prices - 깨진 데이터 삭제
    console.log('\n[5] place_prices');
    const pp1 = await client.query(`
      DELETE FROM place_prices 
      WHERE price_label LIKE '%ì%' OR price_label LIKE '%ë%' OR price_label LIKE '%Ã%'
    `);
    console.log('  깨진 행: ' + pp1.rowCount + '개 삭제');
    
    // 6. gemini_web_search_cache - 깨진 데이터 삭제
    console.log('\n[6] gemini_web_search_cache');
    const gw1 = await client.query(`
      DELETE FROM gemini_web_search_cache 
      WHERE search_query LIKE '%ì%' OR search_query LIKE '%ë%' OR search_query LIKE '%Ã%'
    `);
    console.log('  깨진 행: ' + gw1.rowCount + '개 삭제');
    
    // 7. data_collection_schedule - 정상 한글로 업데이트
    console.log('\n[7] data_collection_schedule - 한글 복원');
    const schedules = [
      ['youtube_sync', 'YouTube 채널 및 비디오 동기화'],
      ['naver_blog_sync', '네이버 블로그/티스토리/TripAdvisor 수집'],
      ['crisis_sync', '위기 정보 수집 (GDELT+Gemini)'],
      ['price_sync', '장소 가격 정보 동기화'],
      ['exchange_rate_sync', '환율 정보 동기화'],
      ['weather_sync', '날씨 정보 동기화'],
    ];
    
    for (const [task, desc] of schedules) {
      await client.query(
        'UPDATE data_collection_schedule SET description = $1 WHERE task_name = $2',
        [desc, task]
      );
    }
    console.log('  6개 스케줄 한글 복원 완료');
    
    // 최종 현황
    console.log('\n' + '='.repeat(70));
    console.log('최종 테이블 현황');
    console.log('='.repeat(70));
    
    const tables = [
      'cities', 'places', 'youtube_channels', 'youtube_videos',
      'youtube_place_mentions', 'instagram_hashtags', 'blog_sources',
      'naver_blog_posts', 'tripadvisor_data', 'place_prices',
      'gemini_web_search_cache', 'data_collection_schedule',
      'guide_prices', 'weather_forecast', 'exchange_rates', 'crisis_alerts'
    ];
    
    console.log('\n테이블 | 행수');
    console.log('-'.repeat(40));
    
    for (const table of tables) {
      try {
        const cnt = await client.query(`SELECT COUNT(*) as c FROM "${table}"`);
        console.log(`${table}: ${cnt.rows[0].c}행`);
      } catch (e) {
        // table doesn't exist
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 정리 완료!');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

cleanAll();
