// ⚠️ 수정금지(승인필요) 2026-08-03 사장님 승인(§22 검수 1~4 수정) = **해설 화면 열기 = 앱 전체 1벌(§16)**.
//   도시 카드(TripisModal)·여정 슬롯(PlaceSlotCard = BTS 생성화면 공용)이 전부 이 함수로만 연다.
//   ① 300ms 잠금 = 이중탭이 해설 화면을 두 번 열어 5크레딧이 두 번 나가는 길 차단
//      (레거시 5단버튼 debounceClick 과 같은 값 = MainCameraScreen.js).
//   ② 앱 언어를 함께 넘긴다 = 창고 열쇠는 (장소, 언어) 두 칸. 안 넘기면 항상 ko 로 열람·차감되어
//      비한국어 사용자가 돈 내고 한국어 해설을 받고, 그 언어 창고는 영영 안 찬다(§22 검수 지적).
//   ③ 🔒 2026-08-05 사장님 SSOT = **로그인 관문도 이 1벌 안에** = 앱 어느 경로로 해설을 열든 여기만 통과하면 된다.
//      판정은 하지 않는다 — 전역 1곳(MapToggleContext.isAuthed)이 판정한 값을 호출자가 넘긴다(login-gate.ts 와 같은 규칙).
//      `"sample"` = 도시 대표카드 = **창고에 이미 있는 해설 1장**만 여는 자리(서버 hasGuide 가 그때만 배지를 켬
//      = city-place-routes.ts:184) = 외부호출 0 = 회사 지출 0 → 미가입자도 맛보게 개방(사장님 지시).
//      여정 슬롯 [해설 듣기] 는 심화라 관문을 통과해야 한다.
import i18n from "@/lib/i18n";

let lastOpenAt = 0;

export type GuideGate =
  | { isAuthed: boolean; requestLogin: () => void }
  | "sample";

export function openGuideForPlace(
  navigation: any,
  placeId: number,
  gate: GuideGate,
): void {
  // 관문 = 여정생성 버튼과 같은 2줄(useGenerateItinerary.ts) = 팝업만 띄우고 자동 재개는 안 한다.
  if (gate !== "sample" && !gate.isAuthed) {
    gate.requestLogin();
    return;
  }
  const now = Date.now();
  if (now - lastOpenAt < 300) return; // 이중탭 = 두 번째는 버린다
  lastOpenAt = now;
  // 루트 스택에 GuideMiniApp 은 인자 없는 화면으로 적혀 있어(RootStackNavigator.tsx:35) 중첩 인자는 as any.
  // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = from = **출발화면**을 서버로 넘긴다(§9 무료/차감 1벌).
  //   "card"(gate==="sample") = 도시 대표카드 맛보기 = 무료 / 없음 = 여정 슬롯 = 로그인+차감.
  navigation.navigate("GuideMiniApp", {
    screen: "GuideResult",
    params: {
      placeId,
      lang: i18n.language || "ko",
      ...(gate === "sample" ? { from: "card" } : {}),
    },
  } as any);
}
