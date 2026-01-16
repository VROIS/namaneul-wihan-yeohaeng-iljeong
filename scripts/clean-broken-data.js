/**
 * 깨진 한글 데이터 전체 정리
 * 
 * 전략:
 * 1. 깨진 데이터 삭제 (복구 불가능)
 * 2. 중복 데이터 삭제
 * 3. 빈 테이블은 정상 (사용시 생성됨)
 */

const { Client } = require('pg');
require('dotenv').config();

function hasBrokenEncoding(str) {
  if (!str) return false;
  return /[ÃÂìíëâêî]/.test(str);
}

async function cleanAllBrokenData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    await client.query("SET client_encoding TO 'UTF8'");
    console.log('DB connected (UTF8)\n');
    
    console.log('='.repeat(70));
    console.log('깨진 한글 데이터 전체 정리');
    console.log('='.repeat(70));
    
    // 1. data_collection_schedule - 깨진 description 정리
    console.log('\n[1] data_collection_schedule');
    const schedDescriptions = {
      'youtube_sync': 'YouTube 채널 및 비디오 동기화',
      'naver_blog_sync': '네이버 블로그/티스토리/TripAdvisor 수집',
      'crisis_sync': '위기 정보 수집 (GDELT+Gemini)',
      'price_sync': '장소 가격 정보 동기화',
      'exchange_rate_sync': '환율 정보 동기화',
      'weather_sync': '날씨 정보 동기화',
      'instagram_sync': '인스타그램 해시태그 동기화',
      'michelin_sync': '미쉐린 가이드 정보 수집',
      'tripadvisor_sync': 'TripAdvisor 리뷰 수집',
      'tistory_sync': '티스토리 블로그 수집',
    };
    
    for (const [taskName, desc] of Object.entries(schedDescriptions)) {
      await client.query(
        'UPDATE data_collection_schedule SET description = $1 WHERE task_name = $2',
        [desc, taskName]
      );
    }
    // 중복 삭제
    await client.query(`
      DELETE FROM data_collection_schedule
      WHERE id NOT IN (SELECT MIN(id) FROM data_collection_schedule GROUP BY task_name)
    `);
    console.log('  ✅ 정상 한글로 수정 완료');
    
    // 2. tripadvisor_data - 깨진 데이터 삭제
    console.log('\n[2] tripadvisor_data');
    const tripDel = await client.query(`
      DELETE FROM tripadvisor_data
      WHERE recent_review_summary LIKE '%Ã%' 
         OR recent_review_summary LIKE '%ì%'
         OR tripadvisor_category LIKE '%Ã%'
         OR tripadvisor_category LIKE '%ì%'
    `);
    // 중복 삭제
    await client.query(`
      DELETE FROM tripadvisor_data
      WHERE id NOT IN (SELECT MIN(id) FROM tripadvisor_data GROUP BY tripadvisor_url)
    `);
    console.log('  ✅ ' + tripDel.rowCount + '개 깨진 행 삭제');
    
    // 3. youtube_place_mentions - 깨진 데이터 삭제
    console.log('\n[3] youtube_place_mentions');
    const ytMentDel = await client.query(`
      DELETE FROM youtube_place_mentions
      WHERE place_name LIKE '%Ã%' 
         OR place_name LIKE '%ì%'
         OR city_name LIKE '%Ã%'
         OR city_name LIKE '%ì%'
         OR summary LIKE '%Ã%'
         OR summary LIKE '%ì%'
    `);
    // 중복 삭제
    await client.query(`
      DELETE FROM youtube_place_mentions
      WHERE id NOT IN (SELECT MIN(id) FROM youtube_place_mentions GROUP BY video_id, place_name)
    `);
    console.log('  ✅ ' + ytMentDel.rowCount + '개 깨진 행 삭제');
    
    // 4. youtube_videos - 깨진 데이터 삭제
    console.log('\n[4] youtube_videos');
    const ytVidDel = await client.query(`
      DELETE FROM youtube_videos
      WHERE title LIKE '%Ã%' 
         OR title LIKE '%ì%'
         OR description LIKE '%Ã%'
         OR description LIKE '%ì%'
    `);
    // 중복 삭제
    await client.query(`
      DELETE FROM youtube_videos
      WHERE id NOT IN (SELECT MIN(id) FROM youtube_videos GROUP BY video_id)
    `);
    console.log('  ✅ ' + ytVidDel.rowCount + '개 깨진 행 삭제');
    
    // 5. naver_blog_posts - 깨진 데이터 삭제
    console.log('\n[5] naver_blog_posts');
    const naverDel = await client.query(`
      DELETE FROM naver_blog_posts
      WHERE post_title LIKE '%Ã%' 
         OR post_title LIKE '%ì%'
         OR blogger_name LIKE '%Ã%'
         OR blogger_name LIKE '%ì%'
    `);
    // 중복 삭제
    await client.query(`
      DELETE FROM naver_blog_posts
      WHERE id NOT IN (SELECT MIN(id) FROM naver_blog_posts GROUP BY post_url)
    `);
    console.log('  ✅ ' + naverDel.rowCount + '개 깨진 행 삭제');
    
    // 6. place_prices - 깨진 데이터 삭제
    console.log('\n[6] place_prices');
    const priceDel = await client.query(`
      DELETE FROM place_prices
      WHERE price_label LIKE '%Ã%' 
         OR price_label LIKE '%ì%'
    `);
    // 중복 삭제
    await client.query(`
      DELETE FROM place_prices
      WHERE id NOT IN (SELECT MIN(id) FROM place_prices GROUP BY place_id, price_type)
    `);
    console.log('  ✅ ' + priceDel.rowCount + '개 깨진 행 삭제');
    
    // 7. gemini_web_search_cache - 깨진 데이터 삭제
    console.log('\n[7] gemini_web_search_cache');
    const geminiDel = await client.query(`
      DELETE FROM gemini_web_search_cache
      WHERE search_query LIKE '%Ã%' 
         OR search_query LIKE '%ì%'
    `);
    console.log('  ✅ ' + geminiDel.rowCount + '개 깨진 행 삭제');
    
    // ========================================
    // 최종 현황
    // ========================================
    console.log('\n' + '='.repeat(70));
    console.log('최종 테이블 현황');
    console.log('='.repeat(70));
    
    const tables = [
      'cities', 'places', 'youtube_channels', 'youtube_videos',
      'youtube_place_mentions', 'instagram_hashtags', 'blog_sources',
      'naver_blog_posts', 'tripadvisor_data', 'place_prices',
      'gemini_web_search_cache', 'data_collection_schedule',
      'guide_prices', 'weather_forecast', 'exchange_rates'
    ];
    
    console.log('\n테이블명 | 행수');
    console.log('-'.repeat(40));
    
    for (const table of tables) {
      try {
        const cnt = await client.query(`SELECT COUNT(*) as c FROM "${table}"`);
        console.log(`${table}: ${cnt.rows[0].c}행`);
      } catch (e) {
        console.log(`${table}: 오류`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 전체 정리 완료!');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

cleanAllBrokenData();
