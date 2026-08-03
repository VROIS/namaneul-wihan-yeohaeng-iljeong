// ⚠️ 수정금지(승인필요) 2026-08-03 사장님 승인(§22 검수 1~4 수정) = **해설 화면 열기 = 앱 전체 1벌(§16)**.
//   도시 카드(TripisModal)·여정 슬롯(PlaceSlotCard = BTS 생성화면 공용)이 전부 이 함수로만 연다.
//   ① 300ms 잠금 = 이중탭이 해설 화면을 두 번 열어 5크레딧이 두 번 나가는 길 차단
//      (레거시 5단버튼 debounceClick 과 같은 값 = MainCameraScreen.js).
//   ② 앱 언어를 함께 넘긴다 = 창고 열쇠는 (장소, 언어) 두 칸. 안 넘기면 항상 ko 로 열람·차감되어
//      비한국어 사용자가 돈 내고 한국어 해설을 받고, 그 언어 창고는 영영 안 찬다(§22 검수 지적).
import i18n from "@/lib/i18n";

let lastOpenAt = 0;

export function openGuideForPlace(navigation: any, placeId: number): void {
  const now = Date.now();
  if (now - lastOpenAt < 300) return; // 이중탭 = 두 번째는 버린다
  lastOpenAt = now;
  // 루트 스택에 GuideMiniApp 은 인자 없는 화면으로 적혀 있어(RootStackNavigator.tsx:35) 중첩 인자는 as any.
  navigation.navigate("GuideMiniApp", {
    screen: "GuideResult",
    params: { placeId, lang: i18n.language || "ko" },
  } as any);
}
