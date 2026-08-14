// 프로필 카드 유틸 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
// 저장된 일정 타입
// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 SSOT = 카드 요약 = ResultStep.tsx 요약헤더와 **원천 통일**.
//   옛 버전은 문장을 여기서 따로 손으로 조립해 다른 언어에서 절반만 번역됐다(조사·"힐링" 폴백이 한국어 리터럴).
//   지금은 ResultStep 과 똑같이 t("trip.tripFor", {...}) 로 조립(§16 = 같은 문장 = 같은 함수).
import { getVibeLabel } from "@/utils/vibeCalculator";
import i18n from "@/lib/i18n";

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
  // 🏆 2026-08-02 = 대표 여정 표시용. 'representative' 면 그 도시 카드에 걸린 것(서버가 정하는 값 = 화면은 읽기만).
  //   목록 API(GET /api/users/:id/itineraries)가 행 전체를 내려주므로 이미 오고 있던 값이다(새 조회 0).
  status?: string;
  // 🎬 2026-07-22 일별 지브리영상 = video_by_day 컬럼 (옛 단일 videoStatus/videoUrl 폐기 = 구현계획 §19)
  videoByDay?: Record<string, { status?: string; url?: string | null }>;
  // 🗂️ 2026-07-03 = 목록 API가 SELECT * = rawData 포함(storage.getUserItineraries). 카드 4요소(도시·기간·예산·요약)용.
  rawData?: {
    destination?: string;
    days?: { dailyCost?: { perPersonEur?: number } }[];
  };
}

// 🗂️ 2026-07-03 = 카드 날짜 축약 "2026-07-03"/"...T..."→"26.07-03" (2026-08-13 "년" 삭제,
//   trip-planner/utils.ts shortDate() 와 같은 형식으로 통일 = 숫자+기호만 = 언어 무관, 폭도 덜 차지). 형식 다르면 앞 10자.
// 🌐 2026-08-14 사장님 승인 = 개인정보방침·FAQ 같은 대용량 콘텐츠는 로케일 JSON 7벌 대신 한/영 2벌만
//   (비한국어권 전체가 영어 공유 = 도시명 nameKo/nameEn과 같은 패턴). 로케일 JSON에 넣으면 동일 영어가
//   6개 파일에 그대로 중복 저장돼 번들 용량만 늘고 절감 효과가 없다(실측 지적, 137KB 다국어 총량 기준).
export type Bi = { ko: string; en: string };
export function pickBi(pair: Bi, isKo: boolean): string {
  return isKo ? pair.ko : pair.en;
}

export function shortDateCard(d?: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1].slice(2)}.${m[2]}-${m[3]}` : d.slice(0, 10);
}

export function summaryLineCard(
  trip: SavedItinerary,
  t: (k: string, opts?: Record<string, unknown>) => string,
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
      .join(" & ") || t("options.healing");
  const lastChar = focus.charCodeAt(focus.length - 1);
  const hasFinalConsonant =
    lastChar >= 0xac00 && lastChar <= 0xd7a3 && (lastChar - 0xac00) % 28 !== 0;
  const objParticle =
    i18n.language === "ko" ? (hasFinalConsonant ? "을" : "를") : "";
  return t("trip.tripFor", {
    companion: comp,
    count: trip.companionCount,
    focus,
    particle: objParticle,
    vibes,
  });
}
