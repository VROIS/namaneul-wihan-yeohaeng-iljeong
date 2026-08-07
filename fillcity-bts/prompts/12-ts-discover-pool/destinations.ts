// ⚠️ 수정금지(승인필요) 2026-06-02 = ts-discover-pool 명소 config (= 도시별 재사용 §16)
// = 한국 day-trip 명소(외곽) + 도심 구역. 신규 도시 = 여기에 추가 = 동일 결과 보장.
export type Dest = { name: string; lat: number; lng: number; radius: number };

export const DISCOVERY_ZONES: Record<number, Record<string, Dest[]>> = {
  // ── Paris (city_id=19) ──
  19: {
    // 한국 day-trip 외곽 명소 (= 사용자 SSOT 2026-06-02)
    outskirt: [
      { name: "베르사유", lat: 48.804, lng: 2.123, radius: 3000 },
      { name: "디즈니랜드 파리", lat: 48.862, lng: 2.781, radius: 4000 },
      { name: "오베르쉬르우아즈", lat: 49.072, lng: 2.17, radius: 2500 },
      { name: "지베르니", lat: 49.075, lng: 1.533, radius: 2500 },
      { name: "퐁텐블로", lat: 48.404, lng: 2.7, radius: 3500 },
      { name: "샹티이", lat: 49.193, lng: 2.47, radius: 3000 },
      { name: "생제르맹앙레", lat: 48.898, lng: 2.094, radius: 2500 },
    ],
    // ⚠️ 수정금지(승인필요) 2026-06-02 = 시내 = 도심 단일 원형 (= 사용자 SSOT = 지역분할 X = 10km 범위만)
    //   = 중심 노트르담/시청 (cities.id=19 = 48.8566/2.3522) + 반경 10km = 시내+근교 식당 전체 커버
    //   = 검색어 = "Paris restaurant" (= 객관적/중립 = 맛집·한국인 편향 X) → 도시전체 구글 RC 순 → 우리가 분류
    //   = 한국인 큐레이션(요약)은 13 Gemini 단계 = 이 발굴 단계는 객관적 검증자료만
    downtown: [{ name: "Paris", lat: 48.8566, lng: 2.3522, radius: 10000 }],
  },
};
