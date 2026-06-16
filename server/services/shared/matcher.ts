/**
 * ⚠️ 수정금지(승인필요) 2026-06-03 = 사용자 SSOT = 동일장소 매칭 단일 공용 모듈 (= 헌법 §14/§16)
 *
 * place_seed_raw "같은 장소" 판정의 유일한 매칭 + 정규화 + samePlace veto.
 * = place-upsert / ag3 / DB 트리거 / 발굴 후처리(12-pool·07-merge 등) 가 모두 이 1벌만 사용한다.
 * = 흩어진 매처(3벌+) 통합 = 300 도시 확장 일관성 기반 ([[feedback_systemic_not_bandaid]]).
 *
 * ⚠️ 수정금지(승인필요) 2026-06-11 = 7단계 순차 우선순위 (= 사용자 SSOT 갱신, "DB 문지기"):
 *   불변(확정=병합)   1) PID 2) URI 3) 풀주소+로컬이름 4) 로컬이름(name_local) 5) 좌표10m
 *   가변(의심=새저장+'중복의심'메모) 6) 영어명(name_en) 7) 한국어명(name_ko)
 *   = 옛 순서(좌표4>로컬이름5) 교체: 좌표 = LLM 316m 편향 실측(2026-06-11 리서치+마드리드 실측 27% 10m초과)
 *     = 도심밀집 오병합 위험 → 로컬이름(불변 고유명사) 아래 5순위로 강등.
 * 핵심 원칙:
 *   - URI(cid) 둘 다 있고 서로 다르면 = 확정 다른 장소 = 보조매칭(3~7) 제외 (samePlace veto). ⚠️ 2026-06-15 PID 는 veto 제거(우리 PID 오류 가능 = TS 가 교정).
 *   - 불변 1~5 중 하나라도 일치 = 같은 장소(확정 = 병합). (= 같은 좌표 다른 장소 = 별개 1행, [[feedback_multitag_ssot]])
 *   - 6·7(영어·한국어명)만 일치 = 표현이 가변(원어→번역 제각각) = 유사의심 = 자동병합 X = 새로 저장 + 검수표시.
 *   - "있는 쪽 승리"(2026-06-11 사용자 SSOT) = 한 단계에서 매칭 후보 여럿 → 신뢰요소(PID>URI>주소>좌표)
 *     최다 보유 후보를 keep (= first-match 폐기 = pickBest). PID 없는 신규 형제가 PID 완비 원본을 이기는 사고 차단.
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

// ⚠️ 수정금지(승인필요) 2026-06-10 = 주소 토큰화 + 약어확장 (= Gemini 약어 "C."→calle·구區 segment 변형 흡수, 재입력 매처미스 0 목표).
//   = 등급규칙(tier 정책) 불변 = tier3 "동일 주소 판정"만 강화(정확매칭 실패 시 토큰부분집합 보조). 악센트 제거 + / º 구분자 처리.
const ADDR_ABBR: Record<string, string> = {
  c: 'calle', cl: 'calle',
  av: 'avenida', avd: 'avenida', avda: 'avenida',
  pza: 'plaza', plza: 'plaza', pl: 'plaza',
  ctra: 'carretera', crta: 'carretera',
  gta: 'glorieta',
  bd: 'boulevard', bld: 'boulevard', bvd: 'boulevard', blvd: 'boulevard',
  sta: 'santa', sto: 'santo', // 2026-06-11 실측 = 'C. de Sta. Fe' vs 'Calle de Santa Fe' (Trébol 매칭미스)
};
const STREET_STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'd']); // 연결어 = 부분집합 판정서 무게 0
// ⚠️ 수정금지(승인필요) 2026-06-11 = 주소 노이즈 토큰 (= 부분집합 판정 제외 = 'Spain' 접미·s/n·층수가 every() 깨는 것 방지)
//   = 실측(마드리드): Gemini↔DB 주소 불일치 28건 전부 노이즈(국가명/s/n/구명/층수) = 번지+우편번호는 동일.
const ADDR_NOISE = new Set([
  'spain', 'españa', 'espana', 'france', 'francia', // 국가명 (= 한쪽만 있어도 같은 장소)
  's', 'n', 'sn',                                    // s/n (= 번지없음 표기 = '/' 분리로 s,n 생성)
  'piso', 'planta', 'floor', 'fl',                   // 층수 키워드
]);
const addrTokens = (s: string | null | undefined): string[] =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')           // 악센트 제거 (chamartín→chamartin)
    .replace(/[.,;:!?'"()[\]{}\/º°ª]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .split(' ')
    .map((t) => ADDR_ABBR[t] || t)
    .filter((t) => t && !ADDR_NOISE.has(t)); // 노이즈(국가명/s/n/층수) 제거 = 우편·번지 핵심 보존
// ⚠️ 수정금지(승인필요) 2026-06-11 재구성 = 거리명(비숫자)·우편·번지 3요소 분리 판정 (= 마드리드 재입력 21누수 실측 보강)
//   = 옛 결함 2: ① 부분집합 방향이 토큰수로 결정 → 동률 시 구區명('Centro')이 small쪽에 끼면 차단 (루프탑 미스)
//                ② s/n 면제가 부분집합 검사 "뒤" → s/n쪽엔 번지가 없어 상대 번지 토큰이 every() 먼저 깨뜨림 (Balconada 미스)
//   = 신규칙: 거리명 = 양방향 부분집합 / 우편 = 동일 강제(안전선 유지) / 번지 = 공유 강제 + s/n 면제 내장.
const hasSN = (raw: string | null | undefined) => /\bs\s*\/\s*n\b/i.test(raw || '');
const addrSubsetMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ta = addrTokens(a), tb = addrTokens(b);
  if (ta.length < 3 || tb.length < 3) return false;
  const setA = new Set(ta), setB = new Set(tb);
  // ① 우편번호(5자리, 토큰 내부 추출 허용) = 동일 강제 (= 같은 거리 다른 동네 차단 = 오병합 안전선)
  const postalOf = (s: Set<string>) => { for (const t of s) { const m = t.match(/(?<!\d)\d{5}(?!\d)/); if (m) return m[0]; } return undefined; };
  const pa = postalOf(setA), pb = postalOf(setB);
  if (!pa || pa !== pb) return false;
  // ② 거리명(비숫자 의미토큰) = 양방향 부분집합 (= 구區 segment·국가명 등 한쪽 추가토큰 흡수)
  const words = (ts: string[]) => ts.filter((t) => !/\d/.test(t) && !STREET_STOP.has(t));
  const wa = words(ta), wb = words(tb);
  if (!wa.length || !wb.length) return false;
  if (!wa.every((t) => setB.has(t)) && !wb.every((t) => setA.has(t))) return false;
  // ③ 번지(1-4자리 숫자) = 공유 강제. 단 원문 어느 한쪽 s/n(번지없음 표기) = 번지부재 정상 = 면제.
  if (hasSN(a) || hasSN(b)) return true;
  const nums = (s: Set<string>) => [...s].filter((t) => /^\d{1,4}$/.test(t));
  const na = nums(setA), nb = nums(setB);
  return na.length > 0 && nb.length > 0 && na.some((n) => nb.includes(n));
};
// ⚠️ 수정금지(승인필요) 2026-06-11 = 주소 보강증거 (= suspect 승격용, addrSubsetMatch 보다 완화 1단계)
//   = 거리명 양방향 부분집합 + 번지 공유(s/n 면제) + 우편 = "앞 3자리 동일"까지 허용 (= 인접 우편구 환각 흡수: Botero 45001↔45002).
//   = 우편 앞3 다르면(= 다른 도시권: 28012 Madrid vs 28370 Chinchón) 승격 금지 = Plaza Mayor 동명거리 도시간 오병합 차단.
const addrCorroborates = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ta = addrTokens(a), tb = addrTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  const setA = new Set(ta), setB = new Set(tb);
  const postalOf = (s: Set<string>) => { for (const t of s) { const m = t.match(/(?<!\d)\d{5}(?!\d)/); if (m) return m[0]; } return undefined; };
  const pa = postalOf(setA), pb = postalOf(setB);
  if (pa && pb && pa.slice(0, 3) !== pb.slice(0, 3)) return false; // 우편 둘 다 존재 = 앞3 동일 강제 (한쪽 부재 = 통과)
  const words = (ts: string[]) => ts.filter((t) => !/\d/.test(t) && !STREET_STOP.has(t));
  const wa = words(ta), wb = words(tb);
  if (!wa.length || !wb.length) return false;
  if (!wa.every((t) => setB.has(t)) && !wb.every((t) => setA.has(t))) return false;
  if (hasSN(a) || hasSN(b)) return true;
  const nums = (s: Set<string>) => [...s].filter((t) => /^\d{1,4}$/.test(t));
  const na = nums(setA), nb = nums(setB);
  return na.length > 0 && nb.length > 0 && na.some((n) => nb.includes(n)); // 번지 공유 필수 (= 거리 전체 vs 특정 건물 차단)
};

// 이름 정규화 (= 3·5·6·7순위 공용) = trim + 소문자
//   ⚠️ 2026-06-03 = DB 트리거 `LOWER(TRIM)` 과 **동일 식**으로 통일 (= 앱↔DB 일관성 = 사용자 SSOT)
//   (= 악센트 무시는 앱↔DB 불일치 유발하므로 미채택 = 악센트 변형은 PID/좌표/주소 단계가 커버.)
export const normName = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

// 이름 후보키 (en/local/ko) = 후보 행이 가진 모든 이름칸 정규화 (= 입력 이름 1개 vs 후보 이름 3칸 비교용)
export const nameKeys = (x: { nameEn?: string | null; nameLocal?: string | null; nameKo?: string | null }): string[] =>
  [normName(x.nameEn), normName(x.nameLocal), normName(x.nameKo)].filter(Boolean);

// ⚠️ 수정금지(승인필요) 2026-06-11 = 이름 strip 토큰 (= "주소 일치 전제" 보조판별 전용 — 이름 단독 병합 금지!)
//   = 실측: strip-동일 이름의 진짜 다른 장소 실재(trebol Santa Fe 1↔10 / lopez / matilde Toledo↔Aranjuez / 체인 BK 4곳)
//     → 이름 단독으로는 절대 confirmed 불가. 주소(우편+번지) 일치가 전제일 때만 업종접두·관사·악센트 변형 흡수.
const BIZ_PREFIX = new Set([
  'restaurante', 'restaurant', 'cerveceria', 'taberna', 'meson', 'bar', 'cafe', 'cafeteria',
  'asador', 'marisqueria', 'bodega', 'azotea', // azotea(옥상) = 건물 부속시설 표기
]);
const nameTokens = (s: string | null | undefined): string[] =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // 악센트 제거 (= 보조판별 한정 — normName 본선은 DB 트리거 정합 유지)
    .replace(/[.,;:!?'"()[\]{}\/&-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .split(' ')
    .filter((t) => t && !STREET_STOP.has(t) && !BIZ_PREFIX.has(t));
// strip 토큰열 동일 OR 연속 부분열 포함 (= 'botin' ⊂ 'sobrino botin') — 공유부 최소 길이 가드
const nameTokensMatch = (a: string[], b: string[]): boolean => {
  if (!a.length || !b.length) return false;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  if (small.join(' ').length < 5) return false; // 'uno' 류 초단명 차단
  for (let i = 0; i + small.length <= big.length; i++) {
    if (small.every((t, j) => big[i + j] === t)) return true;
  }
  return false;
};

// ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT (= 헌법 §14 변경, 사장님 명시 결정) = samePlace veto 에서 PID 제거:
//   = PID 는 "우리가 틀릴 수 있는 요소"다. 근거: TS 에 로컬이름·풀주소·좌표(1~3 힌트)를 다 줬는데도 다른 PID 를 주면 = 우리 PID 오류
//     (= TS = 검증된 최신). 또 PID 입력 전 단계(발굴·enrich)는 PID 없이 주소·로컬이름·좌표로 이미 중복체크함 = PID 는 중복판정 절대기준 아님.
//   = 따라서 PID 가 달라도 보조매칭(주소+로컬이름·좌표)이 일치하면 = 같은 장소(우리 PID 오류) = 매칭 = id 위에 9요소 덮어 교정.
//   = URI(cid)만 veto 유지 (= cid 는 더 강한 고유 = 다르면 다른 장소 안전선). (옛: PID 다르면 = 확정 다른장소 = 폐기)
export const samePlace = (
  c: { googlePlaceId?: string | null; googleMapsUri?: string | null },
  p: { googlePlaceId?: string | null; googleMapsUri?: string | null },
): boolean =>
  !(c.googleMapsUri && p.googleMapsUri && c.googleMapsUri !== p.googleMapsUri);

// ⚠️ 수정금지(승인필요) 2026-06-11 = "있는 쪽 승리" (= 사용자 SSOT §14). 한 단계에서 매칭 후보 여럿 → 신뢰요소 최다 보유 1개 keep.
//   = first-match(.find) 폐기 = DB 배열순(SELECT ORDER BY 부재 = 비결정) 종속 제거.
//   = 사고 재발 방지: PID 없는 신규 형제가 PID 완비 원본을 이긴 사례(마드리드 Botero 77406 vs 76807).
//   = 점수 = PID8 > URI4 > 주소2 > 좌표1 (= 매칭 우선순위 가중) + 동점 = id 작은 쪽(원본=먼저 등록) 우선.
//   = [[feedback_dedup_keep_priority]] (PID > 상세 > 풍부도) 정합. 단순 풍부도 X = 거꾸로 통합 위험.
const trustScore = (c: MatchCandidate): number =>
  (c.googlePlaceId ? 8 : 0) +
  (c.googleMapsUri ? 4 : 0) +
  (c.address && c.address.trim() ? 2 : 0) +
  (c.latitude != null && c.longitude != null ? 1 : 0);

function pickBest<C extends MatchCandidate>(cands: C[]): C | undefined {
  if (cands.length <= 1) return cands[0];
  return cands.reduce((best, c) => {
    const sb = trustScore(best), sc = trustScore(c);
    if (sc > sb) return c;
    if (sc === sb && c.id < best.id) return c; // 동점 = 원본(id 작은 쪽) 우선
    return best;
  });
}

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
  let tierOverride: MatchTier | null = null; // 2026-06-11 = 가변이름 + 주소 보강증거 = confirmed 승격용

  // ⚠️ 전 단계 공통(2026-06-11) = .find(첫매칭) 폐기 → filter + pickBest = "있는 쪽 승리"
  // 1순위 = PID (= ~100%, Google 발급 유일 ID)
  if (p.googlePlaceId) {
    match = pickBest(candidates.filter((c) => c.googlePlaceId === p.googlePlaceId));
    if (match) matchedBy = 'pid';
  }
  // 2순위 = google_maps_uri (= cid = PID 동등 강력)
  if (!match && p.googleMapsUri) {
    match = pickBest(candidates.filter((c) => c.googleMapsUri === p.googleMapsUri));
    if (match) matchedBy = 'uri';
  }
  // 3순위 = 풀주소 정규화 100% + 로컬이름 판별 (= 사용자 SSOT 2026-06-08: 같은 주소 2장소면 로컬이름으로 같은/다른 판별)
  if (!match && p.address) {
    const np = normAddr(p.address);
    if (np.length >= 20) {
      const pl = normName(p.nameLocal);
      match = pickBest(candidates.filter((c) => {
        if (!samePlace(c, p)) return false; // ⚠️ 수정금지(승인필요) — matcher PID veto 제거 동기화(2026-06-15 SSOT) = URI 다르면 다른 장소
        if (!c.address) return false;
        // 정확 매칭(기존) OR 토큰부분집합(약어 "C."→calle·구segment 변형 흡수 = 2026-06-10, 우편번호+번지 공유 강제 = 오병합 방지)
        if (normAddr(c.address) !== np && !addrSubsetMatch(c.address, p.address)) return false;
        if (!pl) return true; // 로컬이름 없으면 주소만 매칭 (= 옛 동작 호환)
        const cNames = nameKeys(c);
        if (cNames.some((cn) => (Math.min(pl.length, cn.length) < 6 ? pl === cn : pl.includes(cn) || cn.includes(pl)))) return true;
        // ⚠️ 2026-06-11 = strip 토큰 보조 (= 주소 일치 전제 하에서만) = 업종접두('Restaurante')·관사(de/la)·악센트 변형 흡수
        //   = 실측 누수: 'Locum'↔'Restaurante Locum'(min6 가드), 'Mercado de San Antón'↔'Mercado San Antón'(관사+악센트)
        const plT = nameTokens(p.nameLocal);
        return plT.length > 0 &&
          [c.nameEn, c.nameLocal, c.nameKo].some((cn) => nameTokensMatch(plT, nameTokens(cn)));
      }));
      if (match) matchedBy = 'address';
    }
  }
  // 4·6·7순위 = 이름 (로컬=불변 4순위 > 영어=의심 6 > 한국어=의심 7)
  //   = 입력 이름 1개를 후보의 어느 이름칸(en/local/ko)과든 비교 (= 옛 9조합 집합 동일, 우선순위만 부여) + cityId 강제(체인 다른도시 별개행).
  const nameStep = (key: string, by: MatchedBy) => {
    if (match || !key) return;
    const found = pickBest(candidates.filter((c) => samePlace(c, p) && c.cityId === p.cityId && nameKeys(c).includes(key)));
    if (found) {
      match = found; matchedBy = by;
      // ⚠️ 수정금지(승인필요) 2026-06-11 = suspect 승격 (= 사용자 SSOT "있는 쪽 승리" 연장 = 증거 조합)
      //   = 가변이름(en/ko) exact 만으로는 의심(새저장)이지만, 거리명+번지까지 동일(우편 앞3 호환)이면
      //     = 불변 증거 2개(이름 exact + 주소 보강) 조합 = 같은 장소 확정 = 병합.
      //   = 실측: Botero(이름 exact + Calle Ciudad 5 동일 + 우편 45001↔45002 환각) 재입력마다 의심 신규 누수.
      //   = 안전선: 우편 앞3 다르면(다른 도시권) 승격 금지 = 동명 거리(Plaza Mayor) 도시간 체인 오병합 차단.
      if ((by === 'name_en' || by === 'name_ko') && p.address && found.address && addrCorroborates(found.address, p.address)) {
        tierOverride = 'confirmed';
      }
    }
  };
  // 4순위 = 로컬이름(name_local) = 불변(확정) (= 2026-06-11 사용자 SSOT: 좌표보다 신뢰 우위 = 고유명사 불변)
  nameStep(normName(p.nameLocal), 'name_local');
  // 5순위 = 좌표 10m (= 같은 건물. 2026-06-11 = 로컬이름 아래로 강등: LLM 좌표 316m 편향·도심밀집 오병합 위험)
  if (!match && p.latitude && p.longitude) {
    match = pickBest(candidates.filter(
      (c) =>
        samePlace(c, p) && // ⚠️ 수정금지(승인필요) — matcher PID veto 제거 동기화(2026-06-15 SSOT) = URI 다르면 다른 장소 (= 같은 좌표 오병합 방지)
        c.latitude != null &&
        c.longitude != null &&
        Math.abs(Number(c.latitude) - p.latitude!) < 0.0001 &&
        Math.abs(Number(c.longitude) - p.longitude!) < 0.0001,
    ));
    if (match) matchedBy = 'coords';
  }
  nameStep(normName(p.nameEn), 'name_en');        // 6순위 = 가변(의심) — 주소 보강증거 있으면 confirmed 승격
  nameStep(normName(p.nameKo), 'name_ko');        // 7순위 = 가변(의심) — 동일

  return { match, matchedBy, tier: tierOverride ?? tierOf(matchedBy) };
}
