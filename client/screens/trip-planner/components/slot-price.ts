import type { PlannerApi } from "../hooks/useTripPlanner";

export const isMealPlace = (place: any): boolean =>
  place.isMealSlot === true ||
  !!place.isMeal ||
  place.name?.includes("점심") ||
  place.name?.includes("저녁") ||
  place.name?.includes("아침") ||
  place.name?.includes("식사") ||
  place.name?.includes("카페") ||
  place.name?.includes("레스토랑");

// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 가격 글자 1벌 = 식사는 mealPrice(없으면 도시 분포 글자 mealPriceLabel), 명소는 estimatedPriceEur → entranceFee → priceEstimate 글자 · 숫자 0 = 무료, 양수 = 금액, 아무것도 없으면 null = 안 보임 (정본 §)
export function slotPriceLabel(
  place: any,
  isMeal: boolean,
  t: PlannerApi["t"],
): string | null {
  const amount = (v: unknown): string | null =>
    typeof v === "number" && Number.isFinite(v)
      ? v > 0
        ? isMeal
          ? t("trip.mealPrice", { price: v })
          : `€${v}`
        : t("common.free")
      : null;
  if (isMeal) return amount(place.mealPrice) ?? place.mealPriceLabel ?? null;
  return (
    amount(place.estimatedPriceEur) ??
    amount(place.entranceFee) ??
    (place.priceEstimate || null)
  );
}
