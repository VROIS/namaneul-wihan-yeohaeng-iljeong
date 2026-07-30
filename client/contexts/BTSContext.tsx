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
  // 서버가 함께 내려주는 값(2026-07-30) = 지구본 인트로가 좌표·D-Day 를 여기서 읽는다.
  dDay?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = **공연 임박 5개 도시를 고르는 규칙 = 이 함수 1벌.**
//   BTS 앱의 도시 탭(8장 선택화면)과 지구본 인트로가 **같은 5개**를 쓴다.
//   옛날에는 8장 화면 안에만 이 규칙이 있어서, 지구본이 제 나름대로 도시를 뿌렸다(§16 재발명).
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
//   지구본 피켓과 네이티브 지도 카드가 같은 글자를 보여야 한다.
//   옛것(지구본이 `D-${dDay}` 를 직접 조립)은 공연 당일·지난 공연에서 **"D-0"·"D--3"** 이라는
//   말이 안 되는 글자를 냈다 = 삭제 §19.
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

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 도시 목록 = /api/bts/cities 1벌(남은 공연만).
  //   시작 도시 = **가장 임박한 공연 도시**(도시 탭의 첫 칸과 같다). 사용자는 도시 탭에서 바꿀 수 있다.
  //   옛 방식(next-concert 를 한 번 더 불러 도시를 따로 정함) 완전삭제 §19 = 같은 일을 두 번 물어보던 것.
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
