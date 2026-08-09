// ⚠️ 수정금지(승인필요): 테마 스타일 — 기존 앱과 동일한 디자인 언어
import { StyleSheet } from 'react-native';
import { CONFIG } from '../config/constants';

export const theme = StyleSheet.create({
  // 전체 화면 컨테이너
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // 카메라 전체 화면 배경
  cameraFull: {
    flex: 1,
  },

  // ⚠️ 수정금지(승인필요): Footer 영역 — 기존 .footer-safe-area CSS 클론
  // FooterButtons.js에서 자체 styles 사용. 이 theme.footer는 fallback용
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CONFIG.FOOTER_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  // 버튼 컨테이너 (아이콘 + 라벨)
  buttonContainer: {
    alignItems: 'center',
    gap: 4,
  },

  // 원형 버튼
  button: {
    width: CONFIG.BUTTON_SIZE,
    height: CONFIG.BUTTON_SIZE,
    borderRadius: CONFIG.BUTTON_SIZE / 2,
    backgroundColor: CONFIG.BUTTON_BG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // 활성 상태 버튼 (라이브 모드 켜진 상태)
  buttonActive: {
    backgroundColor: CONFIG.GEMINI_BLUE,
  },

  // 버튼 라벨 — 기존: text-xs (12px)
  buttonLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // 라이브 대화 오버레이 (카메라 위 반투명)
  chatOverlay: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    maxHeight: '45%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 12,
  },

  // AI 응답 텍스트
  aiText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
  },

  // 사용자 입력 텍스트
  userText: {
    color: CONFIG.GEMINI_BLUE,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },

  // 상태 표시 (듣는 중, 생각 중, 말하는 중)
  statusBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  // ⚠️ 수정금지(승인필요): 처리 중 스피너 오버레이 — 기존 .loader animate-spin 클론
  spinnerOverlay: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    zIndex: 50,
  },

  // 촬영 결과 오버레이
  previewOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '70%',
  },

  // 권한 요청 화면
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: CONFIG.GEMINI_BLUE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // 모델 다운로드 진행 바
  downloadBar: {
    position: 'absolute',
    bottom: CONFIG.FOOTER_HEIGHT + 10,
    left: 20,
    right: 20,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  downloadProgress: {
    height: 4,
    backgroundColor: CONFIG.GEMINI_BLUE,
    borderRadius: 2,
  },
  downloadText: {
    position: 'absolute',
    bottom: CONFIG.FOOTER_HEIGHT + 18,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },

  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 — 라이브뷰 첫 화면 사용법 1줄.
  //   **바탕 없음 = 글자만.** 읽히게 하는 것은 글자 그림자 하나뿐이다.
  //   옛 방식(어두운 막 + 글자별 흘러내림용 줄 간격) 완전삭제 §19 — 실기기에서 막이
  //   선글라스처럼 드러나 라이브뷰를 가렸다. 카메라는 겨눈 곳이 보여야 한다.
  hintWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 14,
    right: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = 해설 화면(DetailViewer)의 `sentence`
  //   (= **하이라이트 없는** 평소 문장) **한 벌을 그대로** 쓴다(§16). 그것이 실기기 최적으로 확인된 값이다.
  //   DetailViewer.js:444-447 = 흰 글자 20 / 줄높이 32 / 자간·글자체 지정 없음 / 그림자 1벌.
  //   (그 화면의 `sentenceHighlight` = 파란 바탕 + 굵기 = **읽는 중인 문장 표시용** = 여기선 안 쓴다.)
  //   옛 값(21 / 30 / 자간 0.3 / 세미볼드) 폐기 = 2026-08-09 §19 — 눈대중이라 그 화면과 달랐다.
  hintText: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 32,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
