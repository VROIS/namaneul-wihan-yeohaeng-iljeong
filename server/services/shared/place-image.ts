// ⚠️ 수정금지(승인필요) 2026-06-11 사용자 SSOT = 이미지 = image_url(구글 PM) 1종 통일
// = best_image_url(고아·비PM 2순위 폴백) + photo_urls(고아·버그) DROP = 헛바퀴 폐기
// = 모든 호출자 (= AG2-DB / AG3 DB Direct / AG3 fallback / AG3-DB 신규) = 본 함수 강제

/**
 * place_seed_raw 행 = 이미지 URL 결정
 * 입력 = {imageUrl} (= place_seed_raw.image_url = 구글 PM 검증 이미지)
 * 출력 = string ('' = image_url NULL)
 */
export function pickPlaceImage(seed: {
  imageUrl?: string | null;
}): string {
  return seed.imageUrl || '';
}
