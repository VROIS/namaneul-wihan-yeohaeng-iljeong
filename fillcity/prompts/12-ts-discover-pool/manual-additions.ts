// ⚠️ 수정금지(승인필요) 2026-06-02 = 발굴(circle "맛집" 검색)이 놓친 진짜 명소 = 이름으로 직접 TS 보강
// = relevance top-20 에 안 뜨는 진짜 명소 (= 궁전 내 파인다이닝 등). 사용자가 직접 확인 후 추가.
// = recover-by-name.ts 가 이 이름으로 TS searchText → upsertPlace(priceOverwrite + tag).
export const MANUAL_ADD: Record<number, string[]> = {
  // ── Paris (city_id=19) ──
  19: [
    'Ore - Ducasse au château de Versailles', // 베르사유 궁전 내 뒤카스 = 리뷰 1,435 / €30-90 (= 사용자 직접 확인)
    'La Flottille Versailles',                 // 베르사유 대운하 = 리뷰 7,188 (= 이미 검증완료, 태그 편입)
  ],
};
