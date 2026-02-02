/**
 * 데이터 복구 스크립트
 * 1. places 재생성
 * 2. instagram_hashtags 정상 데이터 추가
 */

const { Client } = require('pg');
require('dotenv').config();

async function restoreData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 1. Places 재생성 (서울 장소)
    console.log('=== Step 1: Restore places ===\n');
    
    // 서울 city_id 찾기
    const seoulCity = await client.query("SELECT id FROM cities WHERE name = '서울' LIMIT 1");
    const seoulId = seoulCity.rows[0]?.id || 16;
    console.log('Seoul city_id: ' + seoulId);
    
    const seoulPlaces = [
      { name: 'Gyeongbokgung Palace', nameKo: '경복궁', lat: 37.5796, lng: 126.9770, type: 'attraction' },
      { name: 'Gwangjang Market', nameKo: '광장시장', lat: 37.5700, lng: 126.9994, type: 'restaurant' },
      { name: 'N Seoul Tower', nameKo: '남산타워', lat: 37.5512, lng: 126.9882, type: 'landmark' },
      { name: 'Bukchon Hanok Village', nameKo: '북촌한옥마을', lat: 37.5826, lng: 126.9831, type: 'attraction' },
      { name: 'Hongdae Street', nameKo: '홍대거리', lat: 37.5563, lng: 126.9236, type: 'attraction' },
      { name: 'Myeongdong Shopping Street', nameKo: '명동', lat: 37.5636, lng: 126.9854, type: 'attraction' },
      { name: 'Namdaemun Market', nameKo: '남대문시장', lat: 37.5592, lng: 126.9773, type: 'restaurant' },
      { name: 'National Museum of Korea', nameKo: '국립중앙박물관', lat: 37.5209, lng: 126.9804, type: 'attraction' },
      { name: 'Changdeokgung Palace', nameKo: '창덕궁', lat: 37.5794, lng: 126.9910, type: 'attraction' },
      { name: 'Cheonggyecheon Stream', nameKo: '청계천', lat: 37.5696, lng: 126.9784, type: 'landmark' },
      { name: 'Insadong', nameKo: '인사동', lat: 37.5744, lng: 126.9858, type: 'attraction' },
      { name: 'War Memorial of Korea', nameKo: '전쟁기념관', lat: 37.5368, lng: 126.9773, type: 'attraction' },
      { name: 'Namsan Cable Car', nameKo: '남산케이블카', lat: 37.5571, lng: 126.9850, type: 'attraction' },
      { name: 'Deoksugung Palace', nameKo: '덕수궁', lat: 37.5658, lng: 126.9751, type: 'attraction' },
      { name: 'Dongdaemun Design Plaza', nameKo: 'DDP', lat: 37.5673, lng: 127.0095, type: 'landmark' },
    ];
    
    let placesAdded = 0;
    for (const place of seoulPlaces) {
      const exists = await client.query('SELECT id FROM places WHERE name = $1', [place.name]);
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO places (name, city_id, latitude, longitude, place_type, tier) VALUES ($1, $2, $3, $4, $5, $6)',
          [place.name, seoulId, place.lat, place.lng, place.type, 1]
        );
        placesAdded++;
        console.log('  Added: ' + place.name);
      }
    }
    console.log('Total places added: ' + placesAdded);
    
    // 2. Instagram hashtags 복구
    console.log('\n=== Step 2: Restore instagram_hashtags ===\n');
    
    // 현재 컬럼 확인
    const columns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'instagram_hashtags'
    `);
    console.log('Columns: ' + columns.rows.map(r => r.column_name).join(', '));
    
    // 간단한 해시태그 추가 (기본 컬럼만 사용)
    const hashtags = [
      '#에펠탑', '#파리여행', '#파리맛집', '#몽마르뜨', '#샹젤리제',
      '#도쿄타워', '#도쿄여행', '#도쿄맛집', '#시부야', '#신주쿠',
      '#오사카여행', '#오사카맛집', '#도톤보리',
      '#서울여행', '#서울맛집', '#경복궁', '#남산타워', '#홍대', '#명동',
      '#로마여행', '#콜로세움', '#바티칸',
      '#방콕여행', '#방콕맛집',
      '#런던여행', '#빅벤',
      '#바르셀로나여행', '#사그라다파밀리아',
      '#싱가포르여행', '#마리나베이샌즈',
    ];
    
    let hashtagsAdded = 0;
    for (const tag of hashtags) {
      const exists = await client.query('SELECT id FROM instagram_hashtags WHERE hashtag = $1', [tag]);
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO instagram_hashtags (hashtag, post_count) VALUES ($1, $2)',
          [tag, 0]
        );
        hashtagsAdded++;
      }
    }
    console.log('Hashtags added: ' + hashtagsAdded);
    
    // 3. 최종 확인
    console.log('\n=== Final Status ===\n');
    
    const tables = ['cities', 'places', 'youtube_channels', 'instagram_hashtags', 'blog_sources'];
    for (const table of tables) {
      const result = await client.query('SELECT COUNT(*) as cnt FROM "' + table + '"');
      console.log(table + ': ' + result.rows[0].cnt + ' rows');
    }
    
    // 샘플
    console.log('\nplaces sample:');
    const placesSample = await client.query('SELECT id, name FROM places LIMIT 10');
    placesSample.rows.forEach(r => console.log('  [' + r.id + '] ' + r.name));
    
    console.log('\ninstagram_hashtags sample:');
    const igSample = await client.query('SELECT id, hashtag FROM instagram_hashtags LIMIT 15');
    igSample.rows.forEach(r => console.log('  [' + r.id + '] ' + r.hashtag));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

restoreData();
