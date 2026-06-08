/**
 * ⚠️ 수정금지(승인필요) 2026-06-03 = 사용자 SSOT = 동일장소 매칭 단일 공용 모듈 (= 헌법 §14/§16)
 *
 * place_seed_raw "같은 장소" 판정의 유일한 매칭 + 정규화 + samePlace veto.
 * = place-upsert / ag3 / DB 트리거 / 발굴 후처리(12-pool·07-merge 등) 가 모두 이 1벌만 사용한다.
 * = 흩어진 매처(3벌+) 통합 = 300 도시 확장 일관성 기반 ([[feedback_systemic_not_bandaid]]).
 *
 * ⚠️ 수정금지(승인필요) 2026-06-08 = 7단계 순차 우선순위 (= 사용자 SSOT, "DB 문지기" = 트리거와 동일 규칙):
 *   불변(확정=병합)   1) PID 2) URI 3) 풀주소+로컬이름 4) 좌표10m 5) 로컬이름(name_local)
 *   가변(의심=새저장+'중복의심'메모) 6) 영어명(name_en) 7) 한국어명(name_ko)
 * 핵심 원칙:
 *   - PID/URI 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조매칭(3~7) 제외 (samePlace veto).
 *   - 불변 1~5 중 하나라도 일치 = 같은 장소(확정 = 병합). (= 같은 좌표 다른 장소 = 별개 1행, [[feedback_multitag_ssot]])
 *   - 6·7(영어·한국어명)만 일치 = 표현이 가변(원어→번역 제각각) = 유사의심 = 자동병합 X = 새로 저장 + 검수표시.
 */

export type MatchedBy = 'pid' | 'uri' | 'address' | 'coords' | 'name_local' | 'name_en' | 'name_ko' | 'none';
// ⚠️ 2026-06-08 = 매칭 신뢰 등급 = 불변(확정) / 가변(의심) / 무매칭
export type MatchTier = 'confirmed' | 'suspect' | 'none';
const INVARIANT_MATCH: MatchedBy[] = ['pid', 'uri', 'address', 'coords', 'name_local'];
export const tierOf = (m: MatchedBy): MatchTier =>
  m === 'none' ? 'none' : INVARIANT_MATCH.includes(m) ? 'confirmed' : 'suspect';

/** DB 후보 행 (= place_seed_raw SELECT 형) */
export interface MatchCandidate {
  id: number;
  cityId: number;
  googlePlaceId?: string | null;
  googleMapsUri?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  nameEn?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
}

/** 매칭 입력 (= upsert payload 의 식별 서브셋) */
export interface MatchInput {
  cityId: number;
  googlePlaceId?: string | null;
  googleMapsUri?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nameEn?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
}

// 주소 정규화 (= 3순위) = 소문자 + 구두점→공백 + 공백압축 + trim
export const normAddr = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// 이름 정규화 (= 3·5·6·7순위 공용) = trim + 소문자
//   ⚠️ 2026-06-03 = DB 트리거 `LOWER(TRIM)` 과 **동일 식**으로 통일 (= 앱↔DB 일관성 = 사용자 SSOT)
//   (= 악센트 무시는 앱↔DB 불일치 유발하므로 미채택 = 악센트 변형은 PID/좌표/주소 단계가 커버.)
export const normName = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

// 이름 후보키 (en/local/ko) = 후보 행이 가진 모든 이름칸 정규화 (= 입력 이름 1개 vs 후보 이름 3칸 비교용)
export const nameKeys = (x: { nameEn?: string | null; nameLocal?: string | null; nameKo?: string | null }): string[] =>
  [normName(x.nameEn), normName(x.nameLocal), normName(x.nameKo)].filter(Boolean);

// ⚠️ PID/URI 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조매칭(주소·좌표·이름) 제외 (= 사용자 SSOT 2026-06-03)
export const samePlace = (
  c: { googlePlaceId?: string | null; googleMapsUri?: string | null },
  p: { googlePlaceId?: string | null; googleMapsUri?: string | null },
): boolean =>
  !(c.googlePlaceId && p.googlePlaceId && c.googlePlaceId !== p.googlePlaceId) &&
  !(c.googleMapsUri && p.googleMapsUri && c.googleMapsUri !== p.googleMapsUri);

/**
 * 7 단계 순차 매칭 = 단계 통과(매칭) 시 다음 자동 스킵. (= place-upsert / DB 트리거 정본 로직 1:1)
 * @returns { match: 매칭된 후보 | undefined, matchedBy: 어느 단계, tier: confirmed(불변)/suspect(가변)/none }
 */
export function matchCandidate<C extends MatchCandidate>(
  p: MatchInput,
  candidates: C[],
): { match: C | undefined; matchedBy: MatchedBy; tier: MatchTier } {
  let match: C | undefined;
  let matchedBy: MatchedBy = 'none';

  // 1순위 = PID (= ~100%, Google 발급 유일 ID)
  if (p.googlePlaceId) {
    match = candidates.find((c) => c.googlePlaceId === p.googlePlaceId);
    if (match) matchedBy = 'pid';
  }
  // 2순위 = google_maps_uri (= cid = PID 동등 강력)
  if (!match && p.googleMapsUri) {
    match = candidates.find((c) => c.googleMapsUri === p.googleMapsUri);
    if (match) matchedBy = 'uri';
  }
  // 3순위 = 풀주소 정규화 100% + 로컬이름 판별 (= 사용자 SSOT 2026-06-08: 같은 주소 2장소면 로컬이름으로 같은/다른 판별)
  if (!match && p.address) {
    const np = normAddr(p.address);
    if (np.length >= 20) {
      const pl = normName(p.nameLocal);
      match = candidates.find((c) => {
        if (!samePlace(c, p)) return false; // = PID/URI 다르면 다른 장소
        if (!c.address || normAddr(c.address) !== np) return false;
        if (!pl) return true; // 로컬이름 없으면 주소만 매칭 (= 옛 동작 호환)
        const cNames = nameKeys(c);
        return cNames.some((cn) => (Math.min(pl.length, cn.length) < 6 ? pl === cn : pl.includes(cn) || cn.includes(pl)));
      });
      if (match) matchedBy = 'address';
    }
  }
  // 4순위 = 좌표 10m (= 같은 건물)
  if (!match && p.latitude && p.longitude) {
    match = candidates.find(
      (c) =>
        samePlace(c, p) && // = PID/URI 다르면 다른 장소 (= 같은 좌표 오병합 방지)
        c.latitude != null &&
        c.longitude != null &&
        Math.abs(Number(c.latitude) - p.latitude!) < 0.0001 &&
        Math.abs(Number(c.longitude) - p.longitude!) < 0.0001,
    );
    if (match) matchedBy = 'coords';
  }
  // 5~7순위 = 이름 (로컬=불변 > 영어=의심 > 한국어=의심)
  //   = 입력 이름 1개를 후보의 어느 이름칸(en/local/ko)과든 비교 (= 옛 9조합 집합 동일, 우선순위만 부여) + cityId 강제(체인 다른도시 별개행).
  const nameStep = (key: string, by: MatchedBy) => {
    if (match || !key) return;
    const found = candidates.find((c) => samePlace(c, p) && c.cityId === p.cityId && nameKeys(c).includes(key));
    if (found) { match = found; matchedBy = by; }
  };
  nameStep(normName(p.nameLocal), 'name_local'); // 5순위 = 불변(확정)
  nameStep(normName(p.nameEn), 'name_en');        // 6순위 = 가변(의심)
  nameStep(normName(p.nameKo), 'name_ko');        // 7순위 = 가변(의심)

  return { match, matchedBy, tier: tierOf(matchedBy) };
}
