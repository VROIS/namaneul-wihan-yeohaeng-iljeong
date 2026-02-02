const { Client } = require('pg');
require('dotenv').config();

async function addEuropeCities() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('DB connected\n');
  
  // 유럽 30개 대표 도시 (영문 + 한글)
  const europeCities = [
    { name: '파리', country: '프랑스', nameEn: 'Paris', countryCode: 'FR', lat: 48.8566, lng: 2.3522 },
    { name: '런던', country: '영국', nameEn: 'London', countryCode: 'GB', lat: 51.5074, lng: -0.1278 },
    { name: '로마', country: '이탈리아', nameEn: 'Rome', countryCode: 'IT', lat: 41.9028, lng: 12.4964 },
    { name: '바르셀로나', country: '스페인', nameEn: 'Barcelona', countryCode: 'ES', lat: 41.3851, lng: 2.1734 },
    { name: '암스테르담', country: '네덜란드', nameEn: 'Amsterdam', countryCode: 'NL', lat: 52.3676, lng: 4.9041 },
    { name: '베를린', country: '독일', nameEn: 'Berlin', countryCode: 'DE', lat: 52.5200, lng: 13.4050 },
    { name: '프라하', country: '체코', nameEn: 'Prague', countryCode: 'CZ', lat: 50.0755, lng: 14.4378 },
    { name: '비엔나', country: '오스트리아', nameEn: 'Vienna', countryCode: 'AT', lat: 48.2082, lng: 16.3738 },
    { name: '부다페스트', country: '헝가리', nameEn: 'Budapest', countryCode: 'HU', lat: 47.4979, lng: 19.0402 },
    { name: '피렌체', country: '이탈리아', nameEn: 'Florence', countryCode: 'IT', lat: 43.7696, lng: 11.2558 },
    { name: '베니스', country: '이탈리아', nameEn: 'Venice', countryCode: 'IT', lat: 45.4408, lng: 12.3155 },
    { name: '밀라노', country: '이탈리아', nameEn: 'Milan', countryCode: 'IT', lat: 45.4642, lng: 9.1900 },
    { name: '마드리드', country: '스페인', nameEn: 'Madrid', countryCode: 'ES', lat: 40.4168, lng: -3.7038 },
    { name: '리스본', country: '포르투갈', nameEn: 'Lisbon', countryCode: 'PT', lat: 38.7223, lng: -9.1393 },
    { name: '뮌헨', country: '독일', nameEn: 'Munich', countryCode: 'DE', lat: 48.1351, lng: 11.5820 },
    { name: '취리히', country: '스위스', nameEn: 'Zurich', countryCode: 'CH', lat: 47.3769, lng: 8.5417 },
    { name: '브뤼셀', country: '벨기에', nameEn: 'Brussels', countryCode: 'BE', lat: 50.8503, lng: 4.3517 },
    { name: '아테네', country: '그리스', nameEn: 'Athens', countryCode: 'GR', lat: 37.9838, lng: 23.7275 },
    { name: '두브로브니크', country: '크로아티아', nameEn: 'Dubrovnik', countryCode: 'HR', lat: 42.6507, lng: 18.0944 },
    { name: '니스', country: '프랑스', nameEn: 'Nice', countryCode: 'FR', lat: 43.7102, lng: 7.2620 },
    { name: '모나코', country: '모나코', nameEn: 'Monaco', countryCode: 'MC', lat: 43.7384, lng: 7.4246 },
    { name: '코펜하겐', country: '덴마크', nameEn: 'Copenhagen', countryCode: 'DK', lat: 55.6761, lng: 12.5683 },
    { name: '스톡홀름', country: '스웨덴', nameEn: 'Stockholm', countryCode: 'SE', lat: 59.3293, lng: 18.0686 },
    { name: '오슬로', country: '노르웨이', nameEn: 'Oslo', countryCode: 'NO', lat: 59.9139, lng: 10.7522 },
    { name: '에든버러', country: '영국', nameEn: 'Edinburgh', countryCode: 'GB', lat: 55.9533, lng: -3.1883 },
    { name: '더블린', country: '아일랜드', nameEn: 'Dublin', countryCode: 'IE', lat: 53.3498, lng: -6.2603 },
    { name: '인터라켄', country: '스위스', nameEn: 'Interlaken', countryCode: 'CH', lat: 46.6863, lng: 7.8632 },
    { name: '산토리니', country: '그리스', nameEn: 'Santorini', countryCode: 'GR', lat: 36.3932, lng: 25.4615 },
    { name: '세비야', country: '스페인', nameEn: 'Seville', countryCode: 'ES', lat: 37.3891, lng: -5.9845 },
    { name: '포르투', country: '포르투갈', nameEn: 'Porto', countryCode: 'PT', lat: 41.1579, lng: -8.6291 },
  ];
  
  console.log('Adding European cities...\n');
  
  let added = 0;
  for (const city of europeCities) {
    // 이미 존재하는지 확인
    const existing = await client.query(
      'SELECT id FROM cities WHERE name = $1 AND country = $2',
      [city.name, city.country]
    );
    
    if (existing.rows.length === 0) {
      await client.query(
        'INSERT INTO cities (name, country, country_code, latitude, longitude, tier) VALUES ($1, $2, $3, $4, $5, $6)',
        [city.name, city.country, city.countryCode, city.lat, city.lng, 1]
      );
      console.log('  Added: ' + city.name + ', ' + city.country);
      added++;
    } else {
      console.log('  Exists: ' + city.name + ', ' + city.country);
    }
  }
  
  console.log('\nAdded ' + added + ' new cities');
  
  // 최종 확인
  const finalCount = await client.query('SELECT COUNT(*) as cnt FROM cities');
  console.log('Total cities: ' + finalCount.rows[0].cnt);
  
  await client.end();
}
addEuropeCities();
