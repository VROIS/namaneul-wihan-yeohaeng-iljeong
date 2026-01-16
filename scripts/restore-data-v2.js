/**
 * 데이터 복구 스크립트 v2
 */

const { Client } = require('pg');
require('dotenv').config();

async function restoreData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    
    // 1. Places 재생성
    console.log('=== Step 1: Restore places ===\n');
    
    const seoulId = 16;
    const tokyoId = 17;
    const parisId = 19;
    
    const places = [
      // Seoul
      { name: 'Gyeongbokgung Palace', cityId: seoulId, lat: 37.5796, lng: 126.9770, type: 'attraction' },
      { name: 'Gwangjang Market', cityId: seoulId, lat: 37.5700, lng: 126.9994, type: 'restaurant' },
      { name: 'N Seoul Tower', cityId: seoulId, lat: 37.5512, lng: 126.9882, type: 'landmark' },
      { name: 'Bukchon Hanok Village', cityId: seoulId, lat: 37.5826, lng: 126.9831, type: 'attraction' },
      { name: 'Hongdae Street', cityId: seoulId, lat: 37.5563, lng: 126.9236, type: 'attraction' },
      { name: 'Myeongdong', cityId: seoulId, lat: 37.5636, lng: 126.9854, type: 'attraction' },
      { name: 'Namdaemun Market', cityId: seoulId, lat: 37.5592, lng: 126.9773, type: 'restaurant' },
      { name: 'Changdeokgung Palace', cityId: seoulId, lat: 37.5794, lng: 126.9910, type: 'attraction' },
      { name: 'Cheonggyecheon Stream', cityId: seoulId, lat: 37.5696, lng: 126.9784, type: 'landmark' },
      { name: 'Insadong', cityId: seoulId, lat: 37.5744, lng: 126.9858, type: 'attraction' },
      // Tokyo
      { name: 'Senso-ji Temple', cityId: tokyoId, lat: 35.7148, lng: 139.7967, type: 'attraction' },
      { name: 'Tokyo Skytree', cityId: tokyoId, lat: 35.7101, lng: 139.8107, type: 'landmark' },
      { name: 'Shibuya Crossing', cityId: tokyoId, lat: 35.6595, lng: 139.7004, type: 'landmark' },
      { name: 'Meiji Shrine', cityId: tokyoId, lat: 35.6764, lng: 139.6993, type: 'attraction' },
      { name: 'Tsukiji Market', cityId: tokyoId, lat: 35.6654, lng: 139.7707, type: 'restaurant' },
      // Paris
      { name: 'Eiffel Tower', cityId: parisId, lat: 48.8584, lng: 2.2945, type: 'landmark' },
      { name: 'Louvre Museum', cityId: parisId, lat: 48.8606, lng: 2.3376, type: 'attraction' },
      { name: 'Notre-Dame Cathedral', cityId: parisId, lat: 48.8530, lng: 2.3499, type: 'attraction' },
      { name: 'Arc de Triomphe', cityId: parisId, lat: 48.8738, lng: 2.2950, type: 'landmark' },
      { name: 'Montmartre', cityId: parisId, lat: 48.8867, lng: 2.3431, type: 'attraction' },
    ];
    
    let placesAdded = 0;
    for (const place of places) {
      const exists = await client.query('SELECT id FROM places WHERE name = $1', [place.name]);
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO places (name, city_id, latitude, longitude, type, tier) VALUES ($1, $2, $3, $4, $5, $6)',
          [place.name, place.cityId, place.lat, place.lng, place.type, 1]
        );
        placesAdded++;
        console.log('  Added: ' + place.name);
      }
    }
    console.log('Total places added: ' + placesAdded);
    
    // 2. Instagram hashtags
    console.log('\n=== Step 2: Restore instagram_hashtags ===\n');
    
    const hashtags = [
      { tag: '#에펠탑', cityId: parisId, category: 'landmark' },
      { tag: '#파리여행', cityId: parisId, category: 'travel' },
      { tag: '#파리맛집', cityId: parisId, category: 'food' },
      { tag: '#몽마르뜨', cityId: parisId, category: 'landmark' },
      { tag: '#루브르박물관', cityId: parisId, category: 'landmark' },
      { tag: '#도쿄타워', cityId: tokyoId, category: 'landmark' },
      { tag: '#도쿄여행', cityId: tokyoId, category: 'travel' },
      { tag: '#도쿄맛집', cityId: tokyoId, category: 'food' },
      { tag: '#시부야', cityId: tokyoId, category: 'landmark' },
      { tag: '#신주쿠', cityId: tokyoId, category: 'landmark' },
      { tag: '#센소지', cityId: tokyoId, category: 'landmark' },
      { tag: '#서울여행', cityId: seoulId, category: 'travel' },
      { tag: '#서울맛집', cityId: seoulId, category: 'food' },
      { tag: '#경복궁', cityId: seoulId, category: 'landmark' },
      { tag: '#남산타워', cityId: seoulId, category: 'landmark' },
      { tag: '#홍대', cityId: seoulId, category: 'landmark' },
      { tag: '#명동', cityId: seoulId, category: 'landmark' },
      { tag: '#북촌한옥마을', cityId: seoulId, category: 'landmark' },
      { tag: '#로마여행', cityId: null, category: 'travel' },
      { tag: '#콜로세움', cityId: null, category: 'landmark' },
      { tag: '#방콕여행', cityId: null, category: 'travel' },
      { tag: '#런던여행', cityId: null, category: 'travel' },
      { tag: '#빅벤', cityId: null, category: 'landmark' },
      { tag: '#바르셀로나여행', cityId: null, category: 'travel' },
      { tag: '#싱가포르여행', cityId: null, category: 'travel' },
    ];
    
    let hashtagsAdded = 0;
    for (const h of hashtags) {
      const exists = await client.query('SELECT id FROM instagram_hashtags WHERE hashtag = $1', [h.tag]);
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO instagram_hashtags (hashtag, linked_city_id, category, post_count, is_active) VALUES ($1, $2, $3, $4, $5)',
          [h.tag, h.cityId, h.category, 0, true]
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
    
    console.log('\nplaces sample:');
    const placesSample = await client.query('SELECT id, name, city_id FROM places ORDER BY id LIMIT 15');
    placesSample.rows.forEach(r => console.log('  [' + r.id + '] ' + r.name + ' (city:' + r.city_id + ')'));
    
    console.log('\ninstagram_hashtags sample:');
    const igSample = await client.query('SELECT id, hashtag, category FROM instagram_hashtags ORDER BY id LIMIT 15');
    igSample.rows.forEach(r => console.log('  [' + r.id + '] ' + r.hashtag + ' (' + r.category + ')'));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

restoreData();
