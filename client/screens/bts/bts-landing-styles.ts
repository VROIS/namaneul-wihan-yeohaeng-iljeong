// ⚠️ 수정금지(승인필요) — 아미봉(BTS 랜딩) 화면의 **크기·색·모양 값 모음** (2026-07-31 분리).
import { Dimensions, Platform, StyleSheet } from "react-native";

const { width: SW } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 원본 색상 (VROIS/vrois)
export const STAGE_COLORS = ["#001a4d", "#050930", "#9333ea"];
export const PRIMARY = "#8bacff";
export const SECONDARY = "#b486ff";

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
