/**
 * 캐릭터 이미지를 Supabase Storage에 업로드 (fetch API 사용)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Supabase 설정
const SUPABASE_URL = 'https://wxebceflvuythuodemro.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

// 캐릭터 폴더 경로
const CHARACTERS_DIR = 'C:\\Users\\SY Lee\\.gemini\\antigravity\\scratch\\travel-preview\\public\\characters';

async function uploadFile(fileName, fileBuffer) {
  const url = `${SUPABASE_URL}/storage/v1/object/characters/${fileName}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: fileBuffer
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }
  
  return `${SUPABASE_URL}/storage/v1/object/public/characters/${fileName}`;
}

async function createBucketIfNotExists() {
  const url = `${SUPABASE_URL}/storage/v1/bucket`;
  
  // 버킷 목록 조회
  const listRes = await fetch(url, {
    headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  const buckets = await listRes.json();
  console.log('버킷 목록 응답:', buckets);
  
  // 배열 체크
  if (Array.isArray(buckets) && buckets.some(b => b.name === 'characters')) {
    console.log('✅ characters 버킷 이미 존재');
    return;
  }
  
  // 버킷 생성
  const createRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'characters',
      name: 'characters',
      public: true
    })
  });
  
  if (createRes.ok) {
    console.log('✅ characters 버킷 생성 완료');
  } else {
    const text = await createRes.text();
    console.log('⚠️ 버킷 생성 결과:', text);
  }
}

async function uploadCharacters() {
  console.log('🚀 캐릭터 이미지 업로드 시작...');
  
  await createBucketIfNotExists();
  
  // 캐릭터 파일 목록
  const files = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.png'));
  console.log(`📁 발견된 캐릭터 파일: ${files.length}개`);
  
  const uploadedUrls = [];
  
  for (const file of files) {
    const filePath = path.join(CHARACTERS_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);
    
    // 파일명 정리 (타임스탬프 제거)
    const cleanName = file.replace(/_\d+\.png$/, '.png');
    
    console.log(`⬆️ 업로드 중: ${cleanName}`);
    
    try {
      const publicUrl = await uploadFile(cleanName, fileBuffer);
      console.log(`  ✅ 성공`);
      uploadedUrls.push({
        id: cleanName.replace('.png', ''),
        url: publicUrl
      });
    } catch (err) {
      console.error(`  ❌ 실패: ${err.message}`);
    }
  }
  
  console.log('\n🎉 업로드 완료!');
  console.log('📋 캐릭터 URL 목록:');
  uploadedUrls.forEach(u => console.log(`  ${u.id}: ${u.url}`));
  
  // URL 맵 저장
  const urlMapPath = path.join(__dirname, '..', 'server', 'data', 'character-urls.json');
  fs.writeFileSync(urlMapPath, JSON.stringify(uploadedUrls, null, 2));
  console.log(`\n💾 URL 맵 저장: ${urlMapPath}`);
}

uploadCharacters().catch(console.error);
