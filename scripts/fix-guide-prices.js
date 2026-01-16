const { Client } = require('pg');

const connectionString = 'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

const correctData = [
  {
    id: 1,
    service_type: 'walking',
    service_name: '워킹 가이드 (반일)',
    description: '시내/박물관 워킹 투어',
    features: JSON.stringify(['공인 가이드', '차량 미포함'])
  },
  {
    id: 2,
    service_type: 'sedan',
    service_name: '세단 가이드 (전일)',
    description: '비즈니스 세단 + 가이드',
    features: JSON.stringify(['E-Class', '8-10시간', '주행거리 포함'])
  },
  {
    id: 3,
    service_type: 'vip',
    service_name: 'VIP 전담 (전일)',
    description: '최상위 VIP 밴 서비스',
    features: JSON.stringify(['럭셔리 미니밴', '영전 서비스', '전담 가이드'])
  },
  {
    id: 4,
    service_type: 'airport_sedan',
    service_name: '공항 픽업 (비즈니스 세단)',
    description: 'CDG 공항 픽업',
    features: JSON.stringify(['60분 대기 무료', '피켓 마중'])
  },
  {
    id: 5,
    service_type: 'airport_vip',
    service_name: '공항 픽업 (럭셔리 세단)',
    description: 'CDG VIP 픽업',
    features: JSON.stringify(['S-Class', 'VIP 서비스'])
  },
  {
    id: 6,
    service_type: 'walking',
    service_name: '워킹가이드 전일',
    description: '대중교통을 이용',
    features: JSON.stringify([])
  }
];

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected!');

    for (const item of correctData) {
      await client.query(`
        UPDATE guide_prices 
        SET service_name = $1, description = $2, features = $3
        WHERE id = $4
      `, [item.service_name, item.description, item.features, item.id]);
      console.log(`  ✓ Updated id=${item.id}: ${item.service_name}`);
    }

    console.log('\n✅ guide_prices 테이블 한글 수정 완료!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
