// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT
// = 2 컬럼 우선순위 = Google (image_url) 1 순위 > WK (best_image_url) 2 순위
// = 다른 컬럼 (evidence_url / photo_urls) 사용 X = 사용자 명시
// = 모든 호출자 (= AG2-DB / AG3 DB Direct / AG3 fallback / AG3-DB 신규) = 본 함수 강제

/**
 * place_seed_raw 행 = 이미지 URL 결정
 * 입력 = {imageUrl, bestImageUrl} (= place_seed_raw 컬럼명)
 * 출력 = string ('' = 2 컬럼 모두 NULL)
 */
export function pickPlaceImage(seed: {
  imageUrl?: string | null;
  bestImageUrl?: string | null;
}): string {
  return seed.imageUrl || seed.bestImageUrl || '';
}
