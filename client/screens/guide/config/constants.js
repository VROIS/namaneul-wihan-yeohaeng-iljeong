// ⚠️ 수정금지(승인필요): Gemma 4 E2B + API + UX 설정 상수
import { getApiUrl } from '@/lib/query-client';

export const CONFIG = {
  GEMINI_BLUE: '#4285F4',
  BG_COLOR: '#FFFEFA',
  BUTTON_BG: 'rgba(0,0,0,0.6)',

  BUTTON_SIZE: 52,
  FOOTER_HEIGHT: 100,

  MODEL: {
    REPO: 'litert-community/gemma-4-E2B-it-litert-lm', // HuggingFace 저장소
    FILENAME: 'gemma-4-E2B-it.litertlm',               // 모델 파일명
    SIZE_MB: 2400,                                       // ~2.4GB (실측: 2,583,085,056 bytes)
    DOWNLOAD_URL: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm',
    LOCAL_DIR: 'models/',                                // expo-file-system 로컬 경로
  },

  // === 저장 이미지 다이얼 (2026-08-01 사장님 선택 = 800px/0.7 = 실측 장당 ~113KB. 촬영·업로드 공용 1벌 §0) ===
  IMAGE: { MAX_PX: 800, QUALITY: 0.7 },

  CAMERA: {
    FPS: 2,                // 초당 AI에 전송할 프레임 수 (1-3fps)
    FRAME_SIZE: 500,       // 프레임 캡처 해상도 (reference-LiveCameraView.kt preferredSize)
    QUALITY: 0.8,          // 촬영 품질
    FACING: 'back',        // 기본 후면 카메라
  },

  VOICE: {
    LANGUAGE: 'ko-KR',    // 기본 음성 인식 언어
    TTS_RATE: 1.0,         // TTS 속도
    TTS_PITCH: 1.0,        // TTS 피치
    SILENCE_TIMEOUT: 3000, // 음성 입력 무음 타임아웃 (ms)
  },

  API: {
    // ⚠️ 2026-08-01 사장님 승인(§12 서버주소 1줄) = 메인앱 유일 주소함수 getApiUrl() 1벌로 통일(§0·§16).
    SERVER_URL: getApiUrl(),
    GEMINI_MODEL: 'gemini-3-flash-preview',
    EXCHANGE_RATE_URL: 'https://api.exchangerate-api.com/v4/latest',
    EXCHANGE_RATE_CACHE_HOURS: 24, // 1일 1회 캐시
  },

  PROMPTS: {
    GUIDE: '당신은 전문 여행 가이드입니다. 카메라에 보이는 것을 친근하고 자세하게 설명해주세요. 역사, 문화, 재미있는 사실을 포함해주세요. 한국어로 답해주세요.',
    ASSISTANT: '당신은 현지 여행 비서입니다. 통역, 환율 계산, 교통 안내, 긴급 도움을 제공합니다. 항상 친절하고 실용적으로 답해주세요. 한국어로 답해주세요.',
    ANALYZER: '이 이미지를 분석해주세요. 여행자에게 유용한 정보(장소명, 역사, 팁)를 친근하게 설명해주세요. 한국어로 답해주세요.',
  },

  SOS: {
    DEFAULT_EMERGENCY: '112',
    NUMBERS: {
      KR: '112',    // 한국
      US: '911',    // 미국
      EU: '112',    // 유럽
      JP: '110',    // 일본
      CN: '110',    // 중국
      UK: '999',    // 영국
      AU: '000',    // 호주
      TH: '191',    // 태국
      VN: '113',    // 베트남
    },
    SHARE_MESSAGE_TEMPLATE: '🆘 긴급! 현재 위치: {address}\n지도: {mapUrl}\n도움이 필요합니다.',
    KEYWORDS: ['위험', '도와줘', 'SOS', 'help', 'emergency', '살려줘', '경찰'],
  },

  BUTTONS: [
    { id: 'live' },
    { id: 'capture' },
    { id: 'upload' },
    { id: 'assistant' },
    { id: 'archive' },
  ],
};
