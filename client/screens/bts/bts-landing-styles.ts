// ⚠️ 수정금지(승인필요) — 아미봉(BTS 랜딩) 화면의 **크기·색·모양 값 모음** (2026-07-31 분리).
//
// 왜 나눴나
//   BTSLandingScreen.tsx 가 700줄 한도를 넘었다(§0 기계가드). 화면이 하는 일(로직)과
//   생김새(값)를 갈라 두면 둘 다 읽기 쉬워진다. 다른 화면(login/·expert/)도 같은 방식이다(§16).
//
// ⚠️ **여기 값은 3일 연구로 맞춘 최적 크기다. 한 픽셀도 바꾸지 마라**(사장님 지시).
//   이 파일은 옮겨오기만 한 것 = 값·주석 그대로다.
import { Dimensions, Platform, StyleSheet } from "react-native";

const { width: SW } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 원본 색상 (VROIS/vrois)
export const STAGE_COLORS = ["#001a4d", "#050930", "#9333ea"];
export const PRIMARY = "#8bacff";
export const SECONDARY = "#b486ff";

// ⚠️ PC 데스크톱 해상도 대응 = 320px / 140px 최대폭 제한 (화면 잘림 완벽 방지)
export const GLOBE_SIZE = Math.min(SW * 0.62, 320);
const HANDLE_W = 50;
const HANDLE_H = Math.min(SW * 0.35, 140);
const BTN_AREA_W = Math.min(SW * 0.72, 360);

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STAGE_COLORS[0] },

  // ⚠️ 수정금지(승인필요) — 히어로 (상단)
  hero: {
    paddingTop: Platform.OS === "ios" ? 80 : 55,
    paddingLeft: 28,
    paddingRight: 28,
    zIndex: 20,
  },
  tourLabel: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 6,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 20,
  },
  titleBTS: {
    fontSize: 42,
    fontFamily: "Pretendard-Bold",
    color: PRIMARY,
    textShadowColor: "rgba(139,172,255,0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  // ⚠️ 수정금지(승인필요) — Arirang 이탤릭 (고유명사)
  titleArirang: {
    fontSize: 42,
    fontFamily: "Pretendard-Bold",
    fontStyle: "italic",
    color: PRIMARY,
    textShadowColor: "rgba(139,172,255,0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  // ⚠️ 수정금지(승인필요) — 앱 정체성 문구 (가장 크게)
  sloganWrap: {
    marginBottom: 0,
  },
  slogan: {
    fontSize: 30,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
    lineHeight: 38,
    textShadowColor: "rgba(139,172,255,0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },

  // ⚠️ 수정금지(승인필요) — 아미봉 (하단 배치)
  bombWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
  },
  globeShadow: {
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  globeClip: {
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
    borderRadius: GLOBE_SIZE / 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  globeInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: GLOBE_SIZE / 2,
  },
  // ⚠️ 수정금지(승인필요) 2026-07-30 = `textAlign:"center"` 는 **빠져 있던 것을 채운 것**이다.
  //   부모의 alignItems:center 만으로는 **자식이 부모보다 넓어지는 순간 왼쪽 기준 넘침**이 되어
  //   글자가 한쪽으로 쏠려 앞글자가 잘렸다(사장님 실기기 관찰). 크기·위치는 그대로다.
  //   ⚠️ 자간(letterSpacing)은 안드로이드에서 **마지막 글자 뒤에도 붙어** 폭이 넓게 잡힌다 = 쏠림을 키운다.
  cityLabel: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 4,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 2,
    textAlign: "center",
    alignSelf: "stretch",
  },
  dDay: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: -2,
    marginBottom: 16,
    textAlign: "center",
    alignSelf: "stretch",
  },
  inputArea: { width: "75%", alignItems: "center" },
  inputLabel: {
    fontSize: 9,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 6,
    textAlign: "center",
    alignSelf: "stretch",
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 50,
    paddingVertical: 10,
    // ⚠️ 수정금지(승인필요) 2026-07-30 = 좌우 여백 20→10, 글자 13→12.
    //   사유: 칸 안쪽 폭이 95px 인데 "DD / MM / YYYY" 가 99px = **4px 모자라 마지막 Y 가 잘렸다**(실측).
    //   입력칸은 글자가 스스로 작아지는 기능(adjustsFontSizeToFit)이 안 먹으므로 이렇게 맞춘다.
    //   ⚠️ **칸 자체의 폭·높이·둥근 정도는 그대로**(아미봉 그릇은 안 건드림).
    paddingHorizontal: 10,
    textAlign: "center",
    fontSize: 12,
    color: "#FFFFFF",
    fontFamily: "Pretendard-Bold",
  },

  // ⚠️ 수정금지(승인필요) — 손잡이
  handleWrap: {
    width: HANDLE_W,
    height: HANDLE_H,
    alignItems: "center",
    marginTop: -16,
    zIndex: -1,
  },
  handleGrad: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  btnArea: {
    position: "absolute",
    top: 20,
    width: BTN_AREA_W,
    alignSelf: "center",
    gap: 10,
  },
  btn: {
    height: 44,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  googleBtn: { backgroundColor: PRIMARY },
  googleTxt: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
    color: "#050930",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  // ⚠️ 수정금지(승인필요) 2026-07-31 = 이름을 **자리 기준**으로 바꿨다(§16).
  //   사유: 옛 이름(kakaoBtn·appleTxt)은 어느 소셜이 그 자리에 오는지를 이름에 박아둔 것이라,
  //   순서가 바뀌자 "kakaoBtn 안에 애플" 같은 거짓 이름이 됐다 = 후임이 반드시 헷갈린다.
  //   ⚠️ **모양·크기 값은 한 픽셀도 안 바꿨다**(3일 연구로 맞춘 값 = 이름만 교체).
  //   지금 배치 = 1번 구글(파란) / 2번 애플(테두리) / 3번 카톡(작은 글자)  ← 사장님 SSOT 순서
  slot2Btn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  slot2Txt: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  slot3Link: { height: 32, justifyContent: "center", alignItems: "center" },
  slot3Txt: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    color: PRIMARY,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  off: { opacity: 0.35 },
});
