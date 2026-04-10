// geminiservice.js

/**
 * ⚡ 프롬프트 시스템 v2.0 (2025-12-18)
 * 
 * 🎯 주요 변경: 언어별 맞춤 프롬프트 시스템
 * - 7개 언어별 고유 페르소나 (ko, en, zh-CN, ja, fr, de, es)
 * - DB에서 프롬프트 로드 (관리자 편집 가능)
 * - 이미지/텍스트 2가지 타입
 * 
 * 🔑 핵심 규칙:
 * 1. 반드시 텍스트로만 응답 (음성/오디오 생성 금지)
 * 2. 압축 0.9 = 정확성 절대 보장
 * 3. 인사말/마무리 금지
 * 
 * ⚠️ 후임자에게:
 * - 프롬프트 수정은 /admin 페이지에서 가능
 * - DB에 프롬프트가 없으면 DEFAULT_* 사용
 */

// 폴백용 기본 프롬프트 (DB 연결 실패 시)
export const DEFAULT_IMAGE_PROMPT = `당신은 트렌드에 민감하고 박학다식한 'K-여행 도슨트'입니다. 
제공된 이미지(미술, 건축, 음식 등)를 분석하여 한국어 나레이션 스크립트를 작성합니다.

[최우선 출력 강제 규칙]
1. 반드시 텍스트로만 응답: 음성, 오디오, 이미지 등 다른 형식은 절대 생성하지 마세요. 순수 텍스트만 출력합니다.
2. 인사말/뒷말 절대 금지: 시작과 끝인사 없이 오직 본문 설명만 출력.
3. 출력 포맷: 순수한 설명문만 출력. 마크다운 기호(**, *, #) 절대 사용 금지.
4. 분량: 2분 내외의 나레이션 분량.

[필수 설명 순서]
1. Hook: 대중문화(영화/드라마/셀럽) 연관 정보로 시작
2. Action: 인생샷 팁 1문장
3. Context: 역사적 가치 + 한국사 비교

친구에게 "대박 정보"를 알려주는 듯한 신나는 말투로 해설하세요.`;

export const DEFAULT_TEXT_PROMPT = `당신은 트렌드에 민감하고 박학다식한 'K-여행 도슨트'입니다. 
사용자의 여행 관련 질문에 한국어로 답변합니다.

[최우선 출력 강제 규칙]
1. 반드시 텍스트로만 응답: 음성, 오디오, 이미지 등 다른 형식은 절대 생성하지 마세요. 순수 텍스트만 출력합니다.
2. 인사말/뒷말 절대 금지: 오직 본문 답변만 출력.
3. 출력 포맷: 자연스러운 대화체. 마크다운 강조(**) 사용 가능.
4. 분량: 1분 내외 (400-500자).

[필수 답변 순서]
1. Hook: 재미있는 사실이나 대중문화 정보
2. Answer: 핵심 답변 + 실용 정보
3. Bonus: 한국사 비교 + 꿀팁

친구에게 "대박 정보"를 알려주는 듯한 신나는 말투로 답변하세요.`;

// 프롬프트 캐시 (메모리)
const promptCache = {
  image: {},
  text: {}
};

/**
 * 🔄 2025-01-22: 언어 변경 시 프롬프트 캐시 클리어
 * 언어 선택 후 AI 응답이 이전 언어로 오는 버그 수정
 */
export function clearPromptCache() {
  promptCache.image = {};
  promptCache.text = {};
}

/**
 * 서버에서 언어별 프롬프트를 가져옵니다.
 * @param {string} language - 언어 코드 (ko, en, zh-CN, ja, fr, de, es)
 * @param {string} type - 프롬프트 타입 (image, text)
 * @returns {Promise<string>} - 프롬프트 내용
 */
async function fetchPromptFromServer(language, type) {
  const cacheKey = `${language}_${type}`;
  
  // 캐시 확인
  if (promptCache[type][cacheKey]) {
    return promptCache[type][cacheKey];
  }
  
  try {
    const response = await fetch(`/api/prompts/${language}/${type}`);
    
    if (!response.ok) {
      return type === 'image' ? DEFAULT_IMAGE_PROMPT : DEFAULT_TEXT_PROMPT;
    }
    
    const data = await response.json();
    const content = data.prompt?.content;
    
    if (content) {
      // 캐시에 저장
      promptCache[type][cacheKey] = content;
      return content;
    }
    
    return type === 'image' ? DEFAULT_IMAGE_PROMPT : DEFAULT_TEXT_PROMPT;
  } catch (error) {
    console.error(`❌ [프롬프트] 서버 연결 실패:`, error);
    return type === 'image' ? DEFAULT_IMAGE_PROMPT : DEFAULT_TEXT_PROMPT;
  }
}

/**
 * 사용자 언어 코드를 API용 언어 코드로 변환
 * @returns {string} - API용 언어 코드
 */
function getApiLanguageCode() {
  const userLang = localStorage.getItem('appLanguage') || 'ko';
  // 지원 언어: ko, en, zh-CN, ja, fr, de, es
  const supportedLangs = ['ko', 'en', 'zh-CN', 'ja', 'fr', 'de', 'es'];
  return supportedLangs.includes(userLang) ? userLang : 'en';
}

/**
 * Netlify 서버 함수로 요청을 보내고 스트리밍 응답을 처리하는 비동기 제너레이터 함수입니다.
 * @param {object} body - Netlify 함수로 보낼 요청 본문 (JSON)
 * @returns {AsyncGenerator&lt;object, void, unknown&gt;} - { text: "..." } 형태의 객체를 생성하는 비동기 제너레이터
 */
async function* streamResponseFromServer(body) {
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',  // 🔧 크레딧 차감용 인증 쿠키 전송
            body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
            const errorData = await response.json().catch(() => ({ error: `서버 오류: ${response.status}` }));
            
            // 🎯 2026-02-01: 크레딧 부족 시 프로필 페이지로 이동
            if (response.status === 402) {
                alert('크레딧이 부족합니다. 프로필에서 충전해주세요.');
                window.location.href = '/profile.html';
                return;
            }
            
            throw new Error(errorData.error || `서버에서 응답을 받을 수 없습니다.`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            // 원래 SDK의 스트림 청크와 유사한 객체를 생성합니다.
            yield { text: decoder.decode(value, { stream: true }) };
        }
    } catch (error) {
        console.error("Netlify 함수 fetch 오류:", error);
        // UI에 표시될 수 있도록 오류 메시지 청크를 생성합니다.
        yield { text: `\n[오류: 서버와 통신할 수 없습니다. 잠시 후 다시 시도해주세요.]` };
    }
}



/**
 * 이미지를 분석하고 설명을 생성하기 위해 서버 API를 호출합니다.
 * 사용자 언어에 맞는 프롬프트를 DB에서 로드합니다.
 * @param {string} base64Image - Base64로 인코딩된 이미지 데이터
 * @returns {AsyncGenerator<object, void, unknown>} - { text: "..." } 형태의 객체를 생성하는 비동기 제너레이터
 */
export async function* generateDescriptionStream(base64Image) {
    const language = getApiLanguageCode();
    
    // 서버에서 언어별 프롬프트 로드
    const systemInstruction = await fetchPromptFromServer(language, 'image');
    
    
    const requestBody = {
        base64Image,
        prompt: language === 'ko' 
            ? "이 이미지를 분석하고 생생하게 설명해주세요."
            : "Analyze this image and describe it vividly.",
        systemInstruction
    };
    
    // 스트림 응답을 그대로 전달
    for await (const chunk of streamResponseFromServer(requestBody)) {
        yield chunk;
    }
}

/**
 * 텍스트 프롬프트를 처리하고 답변을 생성하기 위해 서버 API를 호출합니다.
 * 사용자 언어에 맞는 프롬프트를 DB에서 로드합니다.
 * @param {string} prompt - 사용자의 텍스트 질문
 * @returns {AsyncGenerator<object, void, unknown>} - { text: "..." } 형태의 객체를 생성하는 비동기 제너레이터
 */
export async function* generateTextStream(prompt) {
    const language = getApiLanguageCode();
    
    // 서버에서 언어별 프롬프트 로드
    const systemInstruction = await fetchPromptFromServer(language, 'text');
    
    
    const requestBody = {
        prompt,
        systemInstruction
    };
    
    // 스트림 응답을 그대로 전달
    for await (const chunk of streamResponseFromServer(requestBody)) {
        yield chunk;
    }
}

// 관리자 대시보드에서 프롬프트 저장 후 캐시 무효화용
window.clearPromptCache = clearPromptCache;

/**
 * 🚀 2026-01-24: Gemini 서비스 사전 워밍업
 * 메인 페이지 진입 시 호출하여 첫 API 응답 지연 방지
 */
export async function warmupGemini() {
    try {
        const language = localStorage.getItem('appLanguage') || 'ko';
        
        // 프롬프트 캐시 사전 로드 (실제 API 호출 없이)
        await fetchPromptFromServer(language, 'image');
        await fetchPromptFromServer(language, 'text');
        
        return true;
    } catch (error) {
        return false;
    }
}
