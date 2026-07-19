/**
 * BTS 미니앱 전역 상태 관리
 * 캐릭터 선택 → 도시/장소 선택 → 일정 생성까지의 전체 플로우 상태
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { BTSCharacter } from "@/constants/bts-characters";

// 타입 정의
export type BTSCity = {
  id: number;
  nameKo: string;
  nameEn: string;
  btsRank: number;
  // ⚠️ 수정금지(승인필요) — 공연 임박 순 정렬용 (2026-04-17 추가)
  nextConcertDate?: string | null;
};

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

export type BTSItineraryPlace = {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  image: string;
  priceEstimate: string;
  tags: string[];
  // 후킹 숏폼 차별점 = 한줄요약
  summaryKo: string | null;
};

export type BTSItinerary = {
  title: string;
  destination: string;
  days: {
    day: number;
    places: BTSItineraryPlace[];
    city: string;
    summary: string;
  }[];
};

type BTSContextType = {
  // 선택 상태
  selectedCharacter: BTSCharacter | null;
  selectedCity: BTSCity | null;
  selectedPlaces: BTSPlace[];
  selectedPlaceIds: number[];
  itinerary: BTSItinerary | null;

  // 데이터
  cities: BTSCity[];
  topPlaces: BTSPlace[];

  // 로딩 상태
  isLoadingCities: boolean;
  isLoadingPlaces: boolean;
  isGenerating: boolean;
  error: string | null;

  // 액션
  setSelectedCharacter: (char: BTSCharacter) => void;
  setSelectedCity: (city: BTSCity) => void;
  togglePlace: (place: BTSPlace) => void;
  // ⚠️ 수정금지(승인필요) — 장소 선택만 초기화 (캐릭터/도시는 유지) — Screen D 재진입 시 사용
  clearSelectedPlaces: () => void;
  setCities: (cities: BTSCity[]) => void;
  setTopPlaces: (places: BTSPlace[]) => void;
  setItinerary: (itinerary: BTSItinerary | null) => void;
  setIsLoadingCities: (v: boolean) => void;
  setIsLoadingPlaces: (v: boolean) => void;
  setIsGenerating: (v: boolean) => void;
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
  const [itinerary, setItinerary] = useState<BTSItinerary | null>(null);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ 수정금지(승인필요) — 초기화 시 다음 공연 도시 자동 설정
  useEffect(() => {
    // ⚠️ 수정금지(승인필요) — 병렬 fetch + stale closure 방지
    const { getApiUrl } = require("@/lib/query-client");
    const api = getApiUrl();
    setIsLoadingCities(true);
    Promise.all([
      fetch(`${api}/api/bts/cities`).then((r) => r.json()),
      fetch(`${api}/api/bts/next-concert`).then((r) => r.json()),
    ])
      .then(([cityRows, next]: [BTSCity[], any]) => {
        setCities(cityRows);
        if (next.cityId) {
          const found = cityRows.find((c: BTSCity) => c.id === next.cityId);
          setSelectedCity(
            found || {
              id: next.cityId,
              nameKo: next.cityKo,
              nameEn: next.city,
              btsRank: 1,
            },
          );
        }
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
    setItinerary(null);
    setError(null);
    setIsGenerating(false);
    setIsLoadingPlaces(false);
  }, []);

  return (
    <BTSContext.Provider
      value={{
        selectedCharacter,
        selectedCity,
        selectedPlaces,
        selectedPlaceIds,
        itinerary,
        cities,
        topPlaces,
        isLoadingCities,
        isLoadingPlaces,
        isGenerating,
        error,
        setSelectedCharacter,
        setSelectedCity,
        togglePlace,
        clearSelectedPlaces,
        setCities,
        setTopPlaces,
        setItinerary,
        setIsLoadingCities,
        setIsLoadingPlaces,
        setIsGenerating,
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
