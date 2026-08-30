// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 SSOT = 카드 요약 = ResultStep.tsx 요약헤더와 **원천 통일**.
import { getVibeLabel } from "@/utils/vibeCalculator";
import i18n from "@/lib/i18n";
import type { VibeWeight } from "@/types/trip";

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
  status?: string;
  videoByDay?: Record<string, { status?: string; url?: string | null }>;
  rawData?: {
    destination?: string;
    days?: { dailyCost?: { perPersonEur?: number } }[];
    // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 생성 시 항상 채워지는 값(ResultStep.tsx 와 같은 소스).
    vibeWeights?: VibeWeight[];
    // ⚠️ 2026-08-22 사장님 승인 = 인원·초점도 바이브와 같은 수술 = 생성 즉시 rawData에 있는 진실값.
    companionType?: string;
    companionCount?: number;
    curationFocus?: string;
  };
}

// 🌐 2026-08-14 사장님 승인 = 개인정보방침·FAQ 같은 대용량 콘텐츠는 로케일 JSON 7벌 대신 한/영 2벌만
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
  // ⚠️ 2026-08-22 사장님 승인 = rawData(생성 즉시 채워짐) 우선 → 컬럼 폴백 = vibeWeights와 동일 패턴(§16)
  const compType = trip.rawData?.companionType || trip.companionType;
  const compCount = trip.rawData?.companionCount ?? trip.companionCount;
  const comp = companionLabels[compType] || t("labels.companionFamily");
  const focus =
    focusLabels[trip.rawData?.curationFocus || trip.curationFocus] ||
    t("labels.curationEveryone");
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = ResultStep.tsx:210-215 와 같은 소스(itinerary.vibeWeights)로 통일.
  const vibes =
    (trip.rawData?.vibeWeights?.length
      ? trip.rawData.vibeWeights.slice(0, 3).map((v) => getVibeLabel(v.vibe))
      : (trip.vibes || []).slice(0, 3).map((v) => getVibeLabel(v as any))
    ).join(" & ") || t("options.healing");
  const lastChar = focus.charCodeAt(focus.length - 1);
  const hasFinalConsonant =
    lastChar >= 0xac00 && lastChar <= 0xd7a3 && (lastChar - 0xac00) % 28 !== 0;
  const objParticle =
    i18n.language === "ko" ? (hasFinalConsonant ? "을" : "를") : "";
  return t("trip.tripFor", {
    companion: comp,
    count: compCount,
    focus,
    particle: objParticle,
    vibes,
  });
}
