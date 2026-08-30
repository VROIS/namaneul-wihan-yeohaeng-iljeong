import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { BTSCharacter } from "@/constants/bts-characters";

export type BTSCity = {
  id: number;
  nameKo: string;
  nameEn: string;
  btsRank: number;
  // ⚠️ 수정금지(승인필요) — 공연 임박 순 정렬용 (2026-04-17 추가)
  nextConcertDate?: string | null;
  dDay?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  // ⚠️ 2026-07-31 사장님 승인(BTS D단계) = 공연 시각("19:00" 등, 서버가 이미 내려줌).
  showTime?: string | null;
};

// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = **공연 임박 5개 도시를 고르는 규칙 = 이 함수 1벌.**
export const IMMINENT_CITY_COUNT = 5;
export function pickImminentCities(cities: BTSCity[]): BTSCity[] {
  return [...cities]
    .filter((c) => c.nextConcertDate)
    .sort((a, b) =>
      (a.nextConcertDate || "").localeCompare(b.nextConcertDate || ""),
    )
    .slice(0, IMMINENT_CITY_COUNT);
}

// ⚠️ 수정금지(승인필요) 2026-07-30 = **D-Day 를 글자로 바꾸는 규칙 = 이 함수 1벌.**
export function formatDDay(dDay: number | null | undefined): string {
  if (dDay === null || dDay === undefined) return "";
  if (dDay > 0) return `D-${dDay}`;
  if (dDay === 0) return "D-Day";
  return `D+${Math.abs(dDay)}`;
}

export type BTSPlace = {
  id: number;
  nameKo: string | null;
  nameEn: string;
  seedCategory: string | null;
  imageUrl: string | null;
  priceEur: number | null;
  // ⚠️ 수정금지(승인필요) — 2026-05-06 Screen 4 카트→지도 = WebView 마커용 좌표
  latitude?: number | null;
  longitude?: number | null;
};

// ⚠️ 2026-07-31 사장님 승인(BTS D단계) = BTSItinerary·itinerary 상태 완전삭제(§19).

type BTSContextType = {
  selectedCharacter: BTSCharacter | null;
  selectedCity: BTSCity | null;
  selectedPlaces: BTSPlace[];
  selectedPlaceIds: number[];

  cities: BTSCity[];
  topPlaces: BTSPlace[];

  isLoadingCities: boolean;
  isLoadingPlaces: boolean;
  error: string | null;

  setSelectedCharacter: (char: BTSCharacter) => void;
  setSelectedCity: (city: BTSCity) => void;
  togglePlace: (place: BTSPlace) => void;
  // ⚠️ 수정금지(승인필요) — 장소 선택만 초기화 (캐릭터/도시는 유지) — Screen D 재진입 시 사용
  clearSelectedPlaces: () => void;
  setCities: (cities: BTSCity[]) => void;
  setTopPlaces: (places: BTSPlace[]) => void;
  setIsLoadingCities: (v: boolean) => void;
  setIsLoadingPlaces: (v: boolean) => void;
  setError: (err: string | null) => void;
  reset: () => void;
};

const BTSContext = createContext<BTSContextType | null>(null);

export function BTSProvider({ children }: { children: React.ReactNode }) {
  const [selectedCharacter, setSelectedCharacter] =
    useState<BTSCharacter | null>(null);
  const [selectedCity, setSelectedCity] = useState<BTSCity | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<BTSPlace[]>([]);
  const [cities, setCities] = useState<BTSCity[]>([]);
  const [topPlaces, setTopPlaces] = useState<BTSPlace[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 도시 목록 = /api/bts/cities 1벌(남은 공연만).
  useEffect(() => {
    const { getApiUrl } = require("@/lib/query-client");
    const api = getApiUrl();
    setIsLoadingCities(true);
    fetch(`${api}/api/bts/cities`)
      .then((r) => r.json())
      .then((cityRows: BTSCity[]) => {
        if (!Array.isArray(cityRows) || cityRows.length === 0) return;
        setCities(cityRows);
        setSelectedCity(pickImminentCities(cityRows)[0] || cityRows[0]);
      })
      .catch(() => {})
      .finally(() => setIsLoadingCities(false));
  }, []);

  const togglePlace = useCallback((place: BTSPlace) => {
    setSelectedPlaceIds((prev) => {
      if (prev.includes(place.id)) {
        setSelectedPlaces((sp) => sp.filter((p) => p.id !== place.id));
        return prev.filter((id) => id !== place.id);
      }
      if (prev.length >= 8) return prev; // 최대 8개
      setSelectedPlaces((sp) => [...sp, place]);
      return [...prev, place.id];
    });
  }, []);

  // ⚠️ 수정금지(승인필요) — 장소 선택만 비움 (Screen D 진입/도시 전환 시 호출)
  const clearSelectedPlaces = useCallback(() => {
    setSelectedPlaceIds([]);
    setSelectedPlaces([]);
  }, []);

  const reset = useCallback(() => {
    setSelectedCharacter(null);
    setSelectedCity(null);
    setSelectedPlaceIds([]);
    setSelectedPlaces([]);
    setTopPlaces([]);
    setError(null);
    setIsLoadingPlaces(false);
  }, []);

  return (
    <BTSContext.Provider
      value={{
        selectedCharacter,
        selectedCity,
        selectedPlaces,
        selectedPlaceIds,
        cities,
        topPlaces,
        isLoadingCities,
        isLoadingPlaces,
        error,
        setSelectedCharacter,
        setSelectedCity,
        togglePlace,
        clearSelectedPlaces,
        setCities,
        setTopPlaces,
        setIsLoadingCities,
        setIsLoadingPlaces,
        setError,
        reset,
      }}
    >
      {children}
    </BTSContext.Provider>
  );
}

export function useBTS(): BTSContextType {
  const ctx = useContext(BTSContext);
  if (!ctx) throw new Error("useBTS must be used within BTSProvider");
  return ctx;
}
