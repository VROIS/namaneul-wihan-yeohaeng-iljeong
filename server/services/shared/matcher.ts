/**
 * ⚠️ 수정금지(승인필요) 2026-06-03 = 사용자 SSOT = 동일장소 매칭 단일 공용 모듈 (= 헌법 §14/§16)
 *
 * place_seed_raw "같은 장소" 판정의 유일한 5단계 매칭 + 정규화 + samePlace veto.
 * = place-upsert / ag3 / DB 트리거 / 발굴 후처리(12-pool·07-merge 등) 가 모두 이 1벌만 사용한다.
 * = 흩어진 매처(3벌+) 통합 = 300 도시 확장 일관성 기반 ([[feedback_systemic_not_bandaid]]).
 *
 * 5 단계 (신뢰도 순, 통과=매칭 시 다음 자동 스킵):
 *   1) PID(google_place_id) 2) URI(google_maps_uri) 3) 풀주소 정규화 100% + 이름 9조합
 *   4) 좌표 10m 5) 로컬네임 9조합 (cityId 강제)
 * 핵심 원칙: PID/URI 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조매칭(3·4·5) 제외 (samePlace veto).
 * (= 같은 좌표 다른 장소 = 별개 1행 보장. [[feedback_multitag_ssot]])
 */

export type MatchedBy = 'pid' | 'uri' | 'address' | 'coords' | 'name' | 'none';

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

// 이름 정규화 (= 3·5순위 공용) = trim + 소문자
//   ⚠️ 2026-06-03 = DB UNIQUE 인덱스 uniq_psr_global_city_name `lower(trim(name_en))` + 트리거 `LOWER(TRIM)` 과 **동일 식**으로 통일
//   (= 앱↔DB 일관성 = 사용자 SSOT. 악센트 무시는 앱↔DB 불일치 유발하므로 미채택 = 악센트 변형은 PID/좌표/주소 단계가 커버.)
export const normName = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

// 이름 9조합 키 (en/local/ko) = 3순위 + 5순위 공용
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
 * 5 단계 순차 매칭 = 단계 통과(매칭) 시 다음 자동 스킵. (= place-upsert 정본 로직 1:1)
 * @returns { match: 매칭된 후보 | undefined, matchedBy: 어느 단계로 매칭됐는지 }
 */
export function matchCandidate<C extends MatchCandidate>(
  p: MatchInput,
  candidates: C[],
): { match: C | undefined; matchedBy: MatchedBy } {
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
  // 3순위 = 풀주소 정규화 100% + 이름 9조합 부분포함 (= 표기차 흡수 / 짧은쪽<6자=정확일치 가드)
  if (!match && p.address) {
    const np = normAddr(p.address);
    if (np.length >= 20) {
      const pNames = nameKeys(p);
      match = candidates.find((c) => {
        if (!samePlace(c, p)) return false; // = PID/URI 다르면 다른 장소
        if (!c.address || normAddr(c.address) !== np) return false;
        if (pNames.length === 0) return true; // 입력 이름 X = 주소만 매칭 (= 옛 동작 호환)
        const cNames = nameKeys(c);
        return pNames.some((pn) =>
          cNames.some((cn) =>
            Math.min(pn.length, cn.length) < 6 ? pn === cn : pn.includes(cn) || cn.includes(pn),
          ),
        );
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
  // 5순위 = 로컬네임 9조합 (= name_en/local/ko 3×3, cityId 강제 = 체인 다른도시 별개행)
  if (!match) {
    const pNames = nameKeys(p);
    if (pNames.length > 0) {
      match = candidates.find((c) => {
        if (!samePlace(c, p)) return false; // = PID/URI 다르면 다른 장소
        if (c.cityId !== p.cityId) return false;
        const cNames = nameKeys(c);
        return pNames.some((pn) => cNames.includes(pn));
      });
      if (match) matchedBy = 'name';
    }
  }

  return { match, matchedBy };
}
