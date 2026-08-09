// ⚠️ 수정금지(승인필요): 테마 스타일 — 기존 앱과 동일한 디자인 언어
import { StyleSheet } from 'react-native';
import { CONFIG } from '../config/constants';
import { Fonts } from '@/constants/theme';

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

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 — 라이브뷰 첫 화면 사용법 카드
  //   규격 = 해설 화면(DetailViewer)이 **사진 위에 글을 얹을 때 쓰는 방식 1벌**을 그대로 가져옴(§16).
  //   그 방식 = ① 어둡게 하는 막 + ② 진한 글자 그림자 **둘 다**. 하나만으로는 안 된다.
  //   실측(2026-08-08 아이폰12 크기, 배경 4종) = 흰 8% 유리·파란 글자·그림자만 = 순백(흐린 하늘·흰 벽)에서
  //   전부 글씨가 사라졌다. 앱의 강한 그림자만 써도 흐렸다. 막을 깔아야 읽힌다.
  //   ⚠️ 카메라는 겨눈 곳을 봐야 하므로 해설 화면처럼 **화면 전체**를 덮지 않는다 = 글자 뒤만, 그 절반 어둡기로.
  hintWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 14,
    right: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 테두리를 두지 않는다 = 테두리가 있으면 '판을 얹었다'로 읽히고, 없으면 그늘로 읽힌다(사장님 지시).
  hintCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 0, // 마지막 줄의 marginBottom 44 가 아래 여백 겸 흘러내릴 자리
  },
  // 글자를 한 자씩 따로 그리므로 줄은 가로로 세운다(= 자동 줄바꿈 대신 글이 정한 줄바꿈).
  // ⚠️ 수정금지(승인필요) 2026-08-08 = marginBottom 44 는 **흘러내릴 자리**다.
  //   없으면 위 줄 글자가 2.4 배로 늘어나며 아래 줄을 덮어 글이 뭉개진다(실측 2026-08-08).
  //   44 = 글자 21 × 늘어남 1.4(=29) + 처짐 15 를 담을 수 있는 최소값.
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 44,
  },
  // 21 = 폭 360 짜리 작은 화면에서도 한 줄이 안 넘치는 크기(실측 2026-08-08).
  //   BTS 타이틀과 같은 30 을 쓰면 = 그 화면은 영어라 되는 것이고, 한글은 줄이 넘친다.
  // 그림자 = 해설 화면과 같은 값.
  hintText: {
    color: '#FFFFFF',
    fontFamily: Fonts.semiBold,
    fontSize: 21,
    lineHeight: 30,
    letterSpacing: 0.3,
    textAlign: 'center',
    // ⚠️ 수정금지(승인필요) 2026-08-08 = 늘어나는 기준점 = 글자 **윗변**.
    //   가운데(기본값)로 두면 위아래로 똑같이 퍼져 방향이 안 생긴다 = 화살표가 못 된다.
    transformOrigin: 'top',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
