// ⚠️ 수정금지(승인필요) 2026-08-03 사장님 승인(§22 검수 1~4 수정) = **해설 화면 열기 = 앱 전체 1벌(§16)**.
//   ③ 🔒 2026-08-05 사장님 SSOT = **로그인 관문도 이 1벌 안에** = 앱 어느 경로로 해설을 열든 여기만 통과하면 된다.
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
  if (gate !== "sample" && !gate.isAuthed) {
    gate.requestLogin();
    return;
  }
  const now = Date.now();
  if (now - lastOpenAt < 300) return; // 이중탭 = 두 번째는 버린다
  lastOpenAt = now;
  // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = from = **출발화면**을 서버로 넘긴다(§9 무료/차감 1벌).
  navigation.navigate("GuideMiniApp", {
    screen: "GuideResult",
    params: {
      placeId,
      lang: i18n.language || "ko",
      ...(gate === "sample" ? { from: "card" } : {}),
    },
  } as any);
}
