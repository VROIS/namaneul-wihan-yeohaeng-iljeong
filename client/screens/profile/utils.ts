// 프로필 카드 유틸 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
// 저장된 일정 타입
// ⚠️ 2026-07-03 사장님 SSOT = 카드 요약 = 여정 결과화면 요약헤더(요약섹션2)를 그대로 재현 = 일관성.
//   결과화면과 동일: comp(N명)의 focus을/를 위한 [vibe 한국어 최대3 &연결] 여행. getVibeLabel=한국어 라벨(영어 노출 버그 수정), 받침 조사(을/를) 동일.
import { getVibeLabel } from "@/utils/vibeCalculator";

export interface SavedItinerary {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  curationFocus: string;
  companionType: string;
  companionCount: number;
  vibes: string[];
  travelPace: string;
  // 🎬 2026-07-22 일별 지브리영상 = video_by_day 컬럼 (옛 단일 videoStatus/videoUrl 폐기 = 구현계획 §19)
  videoByDay?: Record<string, { status?: string; url?: string | null }>;
  // 🗂️ 2026-07-03 = 목록 API가 SELECT * = rawData 포함(storage.getUserItineraries). 카드 4요소(도시·기간·예산·요약)용.
  rawData?: {
    destination?: string;
    days?: { dailyCost?: { perPersonEur?: number } }[];
  };
}

// 🗂️ 2026-07-03 = 카드 날짜 축약 "2026-07-03"/"...T..."→"26년 07-03" (메인앱 요약헤더 표기 통일). 형식 다르면 앞 10자.
export function shortDateCard(d?: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1].slice(2)}년 ${m[2]}-${m[3]}` : d.slice(0, 10);
}

export function summaryLineCard(
  trip: SavedItinerary,
  t: (k: string) => string,
): string {
  const companionLabels: Record<string, string> = {
    Single: t("labels.companionSingle"),
    Couple: t("labels.companionCouple"),
    Family: t("labels.companionFamily"),
    ExtendedFamily: t("labels.companionExtended"),
    Group: t("labels.companionGroup"),
  };
  const focusLabels: Record<string, string> = {
    Kids: t("labels.curationKids"),
    Parents: t("labels.curationParents"),
    Everyone: t("labels.curationEveryone"),
    Self: t("labels.curationSelf"),
  };
  const comp =
    companionLabels[trip.companionType] || t("labels.companionFamily");
  const focus = focusLabels[trip.curationFocus] || t("labels.curationEveryone");
  const vibes =
    (trip.vibes || [])
      .slice(0, 3)
      .map((v) => getVibeLabel(v as any))
      .join(" & ") || "힐링";
  const lastChar = focus.charCodeAt(focus.length - 1);
  const hasFinalConsonant =
    lastChar >= 0xac00 && lastChar <= 0xd7a3 && (lastChar - 0xac00) % 28 !== 0;
  const objParticle = hasFinalConsonant ? "을" : "를";
  return `${comp}(${trip.companionCount}명)의 ${focus}${objParticle} 위한 ${vibes} 여행`;
}
