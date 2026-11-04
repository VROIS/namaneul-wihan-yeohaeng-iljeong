import { useEffect, type MutableRefObject } from "react";
import type { TripFormData } from "@/types/trip";
import { listenSharedVideoCity } from "@/components/tripis/SharedVideoOpener";

type City = { id: number; nameEn: string };

// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 가장 최근 선택이 최우선 = 도시를 고르면 앞서 고른 숙소(좌표·이름·주소·장소 번호·구글 조각)를 지우고 도시 중심으로 (정본 §2026-10-27)
export const cityDestination =
  (city: City) =>
  (prev: TripFormData): TripFormData => ({
    ...prev,
    destination: city.nameEn,
    destinationPlace: undefined,
    accommodationCoords: undefined,
    accommodationName: undefined,
    accommodationAddress: undefined,
    accommodationPlaceId: undefined,
  });

// ⚠️ 수정금지(승인필요) 2026-11-04 최적값 = 링크 `?video=` = 영상 창이 받은 여정의 도시를 검색창에 채운다(카드는 안 띄움 = 영상을 닫으면 바로 그 도시) · 그 사이 손님이 도시를 고르면 덮지 않는다 (정본 2026-11-04)
export function useVideoLinkCity(
  readyCities: City[],
  setFormData: (fn: (prev: TripFormData) => TripFormData) => void,
  lastCityRef: MutableRefObject<number>,
): void {
  useEffect(() => {
    if (!readyCities.length) return;
    return listenSharedVideoCity((cityId) => {
      const city = readyCities.find((c) => c.id === cityId);
      if (city && lastCityRef.current === 0) setFormData(cityDestination(city));
    });
  }, [readyCities, setFormData, lastCityRef]);
}
