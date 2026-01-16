/**
 * 위기 정보 수집 테스트
 */

require('dotenv').config();

async function testGdelt() {
  console.log('=== GDELT API 테스트 ===\n');
  
  const city = 'Paris';
  const keywords = ['Paris strike', 'Paris protest', 'Paris grève'];
  // GDELT API: OR 쿼리는 반드시 괄호()로 감싸야 함
  const query = `(${keywords.join(' OR ')})`;
  
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json&timespan=7d`;
  
  console.log('URL:', url);
  console.log('\n요청 중...\n');
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NUBI-TravelApp/1.0',
      },
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('\n응답 길이:', text.length);
    console.log('\n응답 (처음 2000자):\n', text.substring(0, 2000));
    
    if (response.ok && text.length > 0) {
      try {
        const data = JSON.parse(text);
        console.log('\n파싱 성공!');
        console.log('기사 수:', data.articles?.length || 0);
        if (data.articles && data.articles.length > 0) {
          console.log('\n샘플 기사:');
          data.articles.slice(0, 3).forEach((a, i) => {
            console.log(`  ${i+1}. ${a.title}`);
          });
        }
      } catch (e) {
        console.log('\nJSON 파싱 실패:', e.message);
      }
    }
  } catch (error) {
    console.error('에러:', error.message);
  }
}

async function testGemini() {
  console.log('\n=== Gemini API 테스트 ===\n');
  
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  console.log('API Key 존재:', !!apiKey);
  
  if (!apiKey) {
    console.log('GEMINI_API_KEY가 설정되지 않았습니다.');
    return;
  }
  
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent('Say "Hello, NUBI!" in Korean.');
    console.log('Gemini 응답:', result.response.text());
  } catch (error) {
    console.error('Gemini 에러:', error.message);
  }
}

testGdelt().then(() => testGemini());
