// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계 FE-2) = vibe ↔ 카테고리 매핑 단일 SSOT.
//   원래 server/services/agents/ag2-gemini-recommender.ts 안에 있던 것을 **이동**(1벌 유지, §16).
//   이유 = BTS 캐릭터 → 메인 엔진 vibe 변환을 클라도 써야 함 = 하드코딩 번역맵 금지(동적함수).

import {
  CHARACTER_PRIMARY_CATEGORY,
  COMPANION_VIBE_CATEGORIES,
  type BTSCharacterId,
} from "./bts-character-mapping";

// ⚠️ 수정금지(승인필요) 2026-05-24 = 사용자 SSOT = Romantic 모든 흔적 삭제 + Shopping 1:1 매핑
// = PSR seedCategory 7 종과 1:1 직접 대응 (= 가짜 매핑 X)
export const VIBE_PRIMARY_CATEGORY: Record<string, string> = {
  Foodie: "restaurant", // = 내부 식당태그 유지(버튼 X)
  Healing: "healing",
  Hotspot: "hotspot",
  Adventure: "adventure",
  Shopping: "shopping",
  Culture: "heritage",
  Attraction: "attraction", // = 즐길거리(신규 버튼) → 테마파크·유람선·아쿠아리움·체험전시
};

/**
 * BTS 캐릭터 → 메인 엔진 vibe (최대 3개).
 * = 정본 1벌만 사용: 1캐릭터↔1카테고리 `CHARACTER_PRIMARY_CATEGORY` (+ companion 은 5종 중 앞 3개).
 *   → 8장 카드를 고른 기준과 엔진에 넘기는 vibe 가 **같은 소스** = 어긋날 수 없음.
 * (2026-07-31 simplify 게이트가 잡음: 처음엔 폐기된 weights(5/3/2)를 뒤집어 썼는데
 *  그건 카드 선정 기준과 다른 vibe 를 만들었고 Foodie 오염까지 냈다 → 완전삭제 §19.)
 */
export function characterIdToVibes(memberId: string): string[] {
  const cats =
    memberId === "companion"
      ? COMPANION_VIBE_CATEGORIES.slice(0, 3)
      : [
          CHARACTER_PRIMARY_CATEGORY[
            memberId as Exclude<BTSCharacterId, "companion">
          ] ?? "attraction",
        ];
  const catToVibe = new Map<string, string>();
  for (const [vibe, cat] of Object.entries(VIBE_PRIMARY_CATEGORY)) {
    if (!catToVibe.has(cat)) catToVibe.set(cat, vibe);
  }
  return cats.map((c) => catToVibe.get(c)).filter((v): v is string => !!v);
}

// clampTravelPace(캐릭터 고정 pace → 엔진값) 폐기 = 2026-08-15 §19.
// 사유: 밀도를 캐릭터로 고정하면 사용자가 고른 카드 수와 무관해져 일부 카드가 잘렸다.
// BTSTripScreen.tsx 의 밀도 역산(가용시간÷활동카드수→근사 pace)으로 대체 = 호출부 소멸.
