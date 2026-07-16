/**
 * AG3: Data Matcher & Scorer (데이터 매칭/확정)
 * 🔗 Agent Protocol v1.0: 번역기 역할
 *
 * 소요: 1~2초
 *
 * 역할:
 * 1. AG3-pre: findCityUnified로 도시 매칭 + DB 장소 사전 로드 (병렬)
 * 2. AG2 추천 장소명(영어) → DB 매칭 (aliases 포함)
 * 3. 매칭 성공 → DB 데이터(좌표, 사진, 리뷰, 점수, 가격) 삽입
 * 4. 매칭 실패 → Google Places API → gid 획득 → DB 저장 + 별칭 자동 학습
 * 5. 한국인 인기도, TripAdvisor, 포토스팟 점수 계산
 * 6. 동적 가중치 기반 최종 점수 산출
 * 7. 슬롯별 장소 확정 + 동선 최적화
 *
 * 핵심: AG3 이후 모든 장소는 googlePlaceId(gid)로 식별
 *
 * 의존: itinerary-generator.ts의 enrichment 함수들 사용
 *
 * 진입 파일 = ag3-<책임>.ts 분리(2026-07-16 §0 슬림화, 순수 이동) = 재수출만 담당.
 *   실제 구현 = ag3-image-utils.ts / ag3-seed-loader.ts / ag3-match-core.ts / ag3-save-new-places.ts
 */

export { isUsableImageUrl } from "./ag3-image-utils";
export { loadSeedRawMap, preloadCityData } from "./ag3-seed-loader";
export { matchPlacesWithDB } from "./ag3-match-core";
export { saveNewPlacesToDB } from "./ag3-save-new-places";
