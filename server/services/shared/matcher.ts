/**
 * ⚠️ 수정금지(승인필요) 2026-06-03 = 사용자 SSOT = 동일장소 매칭 단일 공용 모듈 (= 헌법 §14/§16)
 *
 * place_seed_raw "같은 장소" 판정의 유일한 매칭 + 정규화 + samePlace veto.
 * = place-upsert / ag3 / DB 트리거 / 발굴 후처리(12-pool·07-merge 등) 가 모두 이 1벌만 사용한다.
 * = 흩어진 매처(3벌+) 통합 = 300 도시 확장 일관성 기반 ([[feedback_systemic_not_bandaid]]).
 *
 * ⚠️ 수정금지(승인필요) = 7단계 순차 우선순위 (= 사용자 SSOT, "DB 문지기"):
 *   불변(확정=병합)   1) PID 2) URI 3) 풀주소+로컬이름 4) 로컬이름(name_local) 5) 좌표10m
 *   가변(의심=새저장+'중복의심'메모) 6) 영어명(name_en) 7) 한국어명(name_ko)
 *   = 좌표를 5순위로 둔 이유: LLM 좌표 316m 편향 실측(마드리드 27% 10m초과) = 도심밀집 오병합 위험
 *     → 로컬이름(불변 고유명사)을 좌표 위 4순위로. (좌표 상위 배치 = 폐기 2026-06-11 §19)
 * 핵심 원칙 (= samePlace veto = PID 게이트, 사장님 SSOT 2026-07-05 §14재갱신):
 *   - PID 양쪽 다 있음: 같으면 같은 장소(병합) / 다르면(또는 URI 다르면) 다른 장소(차단 = veto).
 *     이유 = TS 에 풀주소·좌표·로컬이름 힌트를 다 주고 찾으므로 PID 오류확률 거의 0 = PID 다르면 진짜 다른 장소.
 *   - PID 없음(한쪽이라도): URI(cid) 안 봄 → 풀주소+좌표10m+로컬이름으로 매칭. 껍데기(PID없음)의 가짜 cid 로 다른 장소 오판 원천차단.
 *   - 불변 1~5 중 하나라도 일치 = 같은 장소(확정 = 병합). (= 같은 좌표 다른 장소 = 별개 1행, [[feedback_multitag_ssot]])
 *   - 6·7(영어·한국어명)만 일치 = 표현이 가변(원어→번역 제각각) = 유사의심 = 자동병합 X = 새로 저장 + 검수표시.
 *   - "있는 쪽 승리"(= 사용자 SSOT) = 한 단계에서 매칭 후보 여럿 → 신뢰요소(PID>URI>주소>좌표)
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
//   = 재구성 배경: ① 부분집합 방향이 토큰수로 결정 → 동률 시 구區명이 small쪽에 끼면 차단(루프탑 미스)
//                ② s/n 면제가 부분집합 검사 뒤라 s/n쪽 번지부재를 상대 번지 토큰이 every() 로 먼저 깨뜨림(Balconada 미스). (그 순서 = 폐기 2026-06-11 §19)
//   = 신규칙: 거리명 = 양방향 부분집합 / 우편 = 동일 강제(안전선 유지) / 번지 = 공유 강제 + s/n 면제 내장.
const hasSN = (raw: string | null | undefined) => /\bs\s*\/\s*n\b/i.test(raw || '');
// 🧠 2026-07-05 = 주소 3요소 헬퍼 = addrSubsetMatch·addrCorroborates 공용 1벌(§16 재발명0). 옛 = 두 함수 각각 인라인 재정의 = 폐기 §19.
const postalOf = (s: Set<string>): string | undefined => { for (const t of s) { const m = t.match(/(?<!\d)\d{5}(?!\d)/); if (m) return m[0]; } return undefined; };
const streetWords = (ts: string[]): string[] => ts.filter((t) => !/\d/.test(t) && !STREET_STOP.has(t)); // 거리명 = 비숫자 의미토큰
const streetNums = (s: Set<string>): string[] => [...s].filter((t) => /^\d{1,4}$/.test(t)); // 번지 = 1~4자리 숫자
// 거리명 양방향 부분집합 + 번지 공유(s/n 면제) = 두 주소함수 공통 하단부 (= 우편 판정만 상단서 각자 달리 적용)
const streetAndNumberMatch = (a: string | null | undefined, b: string | null | undefined, ta: string[], tb: string[], setA: Set<string>, setB: Set<string>): boolean => {
  const wa = streetWords(ta), wb = streetWords(tb);
  if (!wa.length || !wb.length) return false;
  if (!wa.every((t) => setB.has(t)) && !wb.every((t) => setA.has(t))) return false; // 거리명 = 양방향 부분집합(한쪽 추가토큰 흡수)
  if (hasSN(a) || hasSN(b)) return true; // 원문 어느 한쪽 s/n(번지없음) = 번지 면제
  const na = streetNums(setA), nb = streetNums(setB);
  return na.length > 0 && nb.length > 0 && na.some((n) => nb.includes(n)); // 번지 공유 필수(거리 전체 vs 특정 건물 차단)
};
const addrSubsetMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ta = addrTokens(a), tb = addrTokens(b);
  if (ta.length < 3 || tb.length < 3) return false;
  const setA = new Set(ta), setB = new Set(tb);
  const pa = postalOf(setA), pb = postalOf(setB);
  if (!pa || pa !== pb) return false; // 우편 = 동일 강제(같은 거리 다른 동네 차단 = 오병합 안전선)
  return streetAndNumberMatch(a, b, ta, tb, setA, setB);
};
// ⚠️ 수정금지(승인필요) 2026-06-11 = 주소 보강증거 (= suspect 승격용, addrSubsetMatch 보다 완화 1단계)
//   = 거리명 양방향 부분집합 + 번지 공유(s/n 면제) + 우편 = "앞 3자리 동일"까지 허용 (= 인접 우편구 환각 흡수: Botero 45001↔45002).
//   = 우편 앞3 다르면(= 다른 도시권: 28012 Madrid vs 28370 Chinchón) 승격 금지 = Plaza Mayor 동명거리 도시간 오병합 차단.
const addrCorroborates = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ta = addrTokens(a), tb = addrTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  const setA = new Set(ta), setB = new Set(tb);
  const pa = postalOf(setA), pb = postalOf(setB);
  if (pa && pb && pa.slice(0, 3) !== pb.slice(0, 3)) return false; // 우편 둘 다 존재 = 앞3 동일 강제(한쪽 부재 = 통과)
  return streetAndNumberMatch(a, b, ta, tb, setA, setB);
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

// ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 고유명사 매칭 = "첫 글자 대문자=고유명사"(라틴문자권 공통) + 전세계 공통 업종/시설어 최소사전.
//   대문자 시작 토큰만 남기되, 그중 업종/시설어(GENERIC_FACILITY)는 대문자여도 걷어냄 = Champagne Taittinger→taittinger 흡수(Taittinger와 동일키).
//   왜 안전(랭스 실측): 업종어 걷어내 "Boulingrin"·"Saint-Remi"만 남는 다른시설(Brasserie↔Halles, Basilique↔Musée)은 둘 다 PID 보유 → PID veto(불변1)가 차단 = 오병합 0.
//   GENERIC_FACILITY = 전세계 공통 업종/시설 일반명사만(지명·고유명 아님). 언어 무관 확장.
const GENERIC_FACILITY = new Set([
  'restaurant', 'brasserie', 'bistro', 'cafe', 'bar', 'hotel', 'auberge', 'taverne', 'pub', 'pizzeria', 'trattoria',
  'museum', 'musee', 'gallery', 'galerie', 'galeries', 'theatre', 'theater', 'opera', 'cinema',
  'palais', 'chateau', 'castle', 'manor', 'villa', 'domaine', 'maison', 'house', 'abbaye', 'abbey', 'couvent', 'monastere', 'monastery',
  'basilique', 'basilica', 'cathedrale', 'cathedral', 'eglise', 'church', 'chapelle', 'chapel', 'temple', 'mosquee', 'synagogue',
  'parc', 'park', 'jardin', 'garden', 'square', 'place', 'plaza', 'forest', 'foret', 'bois',
  'tour', 'tower', 'pont', 'bridge', 'porte', 'gate', 'phare', 'lighthouse', 'fontaine', 'fountain', 'statue', 'monument',
  'avenue', 'rue', 'street', 'boulevard', 'allee', 'chemin', 'route', 'promenade', 'quai',
  'magasin', 'store', 'boutique', 'marche', 'market', 'halles', 'centre', 'center', 'mall',
  'champagne', 'cave', 'caves', 'vignoble', 'winery', 'distillerie',
]);
// 고유명사 키 = 대문자 시작 토큰만 남겨 소문자화·악센트제거 후 업종/시설어 제거 → 정렬조인.
export const properNameKey = (s: string | null | undefined): string => {
  const raw = (s || '').trim();
  if (!raw) return '';
  const allSame = raw === raw.toUpperCase() || raw === raw.toLowerCase(); // 전부대/소문자 = 대소문자 정보 없음
  return raw
    .replace(/[^\p{L}\p{N} ]/gu, ' ')                        // 구두점→공백 (유니코드 문자·숫자 보존 = 다언어)
    .split(/\s+/)
    .filter((t) => t && (allSame || /^\p{Lu}/u.test(t)))     // 대문자 시작 토큰만(고유명사). 전부대/소문자면 전 토큰.
    .map((t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .filter((t) => !GENERIC_FACILITY.has(t))                 // 업종/시설어(대문자여도) 제거 = Champagne 등
    .sort()
    .join('');
};
// 후보 x 의 라틴이름칸(en/local)에서 뽑은 고유명사 키 집합. (빈 키·3글자미만 = 우연겹침 위험이라 제외)
//   ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = name_ko(한글) 제외 = 한글은 "첫 대문자=고유명사" 원칙 불가(대문자 없음).
//     오염된 name_ko("푸엔카랄 거리")가 전토큰 키로 무관 실장소(박물관↔거리) 병합하던 오병합 근본 차단. 라틴이름(en/local)만 고유명사 판별.
export const properKeys = (x: { nameEn?: string | null; nameLocal?: string | null; nameKo?: string | null }): Set<string> => {
  const out = new Set<string>();
  for (const raw of [x.nameEn, x.nameLocal]) {
    const k = properNameKey(raw);
    if (k.length >= 3) out.add(k); // 3글자 이상 = 'tau'(Palais du Tau) 흡수. 트리거 불변6 가드(length>=3)와 동일(§16). 반경조건(같은 도시 OR 100km)이 우연겹침 방지(2026-07-17).
  }
  return out;
};

// ⚠️ 수정금지(승인필요) 2026-07-05 사장님 SSOT (= 헌법 §14 재갱신, 사장님 명시 결정) = samePlace veto = PID 게이트:
//   = 같은 장소 판단 = PID 신뢰도로 갈림.
//     (1) PID 양쪽 다 있음: 같으면 같은 장소(병합) / 다르면(또는 URI 다르면) 다른 장소(차단 = veto).
//         이유 = TS 에 풀주소·좌표·로컬이름 힌트를 다 주고 찾으니 PID 오류확률 거의 0 = PID 다르면 진짜 다른 장소.
//     (2) PID 없음(한쪽이라도): URI(cid) 안 봄 → 풀주소+좌표10m+로컬이름으로 매칭. 같으면 같은 장소(병합).
//   = 즉 URI veto 는 "PID 양쪽 다 있을 때만" 발동. 껍데기(PID없음)의 가짜 cid 로 다른 장소 오판하는 것 원천차단.
//   (옛 "PID veto 제거 / URI 만 veto"·"URI 완화 samePlaceRelaxed" = 폐기 2026-07-05 §14재갱신/§19)
export const samePlace = (
  c: { googlePlaceId?: string | null; googleMapsUri?: string | null },
  p: { googlePlaceId?: string | null; googleMapsUri?: string | null },
): boolean =>
  !(c.googlePlaceId && p.googlePlaceId &&                               // PID 양쪽 다 있을 때만 veto 검사
    (c.googlePlaceId !== p.googlePlaceId ||                             // PID 다름 = 다른 장소(URI 무관)
      (!!c.googleMapsUri && !!p.googleMapsUri && c.googleMapsUri !== p.googleMapsUri))); // 또는 URI 다름 = 다른 장소
// 🗑️ 2026-07-05 = samePlaceRelaxed 삭제 = PID게이트(samePlace)가 완화 대체 = 한벌 §16/§19

// ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = 같은장소 반경조건(100km) = 이름매칭(6·7·고유명사)의 도시번호 단독 한정 대체.
//   장소는 도시 소유가 아니라 지리적 실체(베르사유궁전 = 파리 풀에서 매칭돼도 1곳) = 도심 100km = 외곽(day-trip) 풀과 동일 철학.
//   판정 = 같은 도시(cityId 동일) → 무조건 통과(기존 동작 100% 유지)
//        OR 양쪽 좌표 유효(null 아니고 0 아님) AND 등장방형 근사 거리 ≤ 100,000m → 통과(크로스도시 확장)
//   = 순수 확장(퇴행 0). 크로스도시 + 좌표 없음 = 불통과.
//   ⚠️ 이 거리식 = DB 트리거와 byte 동형 1벌 유지 (§16·§20) = 식 임의 변경 금지.
export const nearSamePlaceRadius = (
  c: { cityId: number; latitude?: number | string | null; longitude?: number | string | null },
  p: { cityId: number; latitude?: number | string | null; longitude?: number | string | null },
): boolean => {
  if (c.cityId === p.cityId) return true; // 같은 도시 = 무조건 통과 = 기존 동작 보존
  const latA = Number(c.latitude), lngA = Number(c.longitude), latB = Number(p.latitude), lngB = Number(p.longitude);
  const ok = (v: unknown, n: number) => v != null && Number.isFinite(n) && n !== 0; // 좌표 유효 = null 아니고 0 아님
  if (!ok(c.latitude, latA) || !ok(c.longitude, lngA) || !ok(p.latitude, latB) || !ok(p.longitude, lngB)) return false;
  const dLat = (latA - latB) * 111320;
  const dLng = (lngA - lngB) * 111320 * Math.cos((((latA + latB) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) <= 100000;
};

// ⚠️ 수정금지(승인필요) = "있는 쪽 승리" (= 사용자 SSOT §14). 한 단계에서 매칭 후보 여럿 → 신뢰요소 최다 보유 1개 keep.
//   = first-match(.find) 폐기 = DB 배열순(SELECT ORDER BY 부재 = 비결정) 종속 제거.
//   = 사고 재발 방지: PID 없는 신규 형제가 PID 완비 원본을 이긴 사례(마드리드 Botero 77406 vs 76807).
//   = 점수 = PID8 > URI4 > 주소2 > 좌표1 (= 매칭 우선순위 가중) = 신뢰요소 최다 = 항상 우선(PID/상세 보유행 keep).
//   = [[feedback_dedup_keep_priority]] (PID > 상세 > 풍부도) 정합. 단순 풍부도 X = 거꾸로 통합 위험.
//   🧠 2026-07-05 사장님 SSOT(§14갱신) = 동점(신뢰요소 동일)일 때만 = 최신(id 큰 쪽) 우선 = "최신이 정답".
//     = 신뢰요소가 다르면 여전히 trustScore 가 결정 = PID 완비행이 짐 없음(동점 아니면 이 분기 미발동).
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
    if (sc === sb && c.id > best.id) return c; // 🧠 2026-07-05 = 동점 = 최신(id 큰 쪽) 우선 §14갱신
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

  // ⚠️ 전 단계 공통(2026-06-11) = filter + pickBest = "있는 쪽 승리" (§19)
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
        if (!samePlace(c, p)) return false; // ⚠️ PID게이트 veto(2026-07-05 §14재갱신) = 양쪽 PID 있고 PID/URI 다르면 다른 장소
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
  // ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 4·6·7순위 = 이름 (로컬=불변 4순위 > 영어=의심 6 > 한국어=의심 7)
  //   = 입력 이름 1개를 후보의 어느 이름칸(en/local/ko)과든 비교 (= 9조합 집합, 우선순위만 부여).
  //   = 범위:
  //     • name_local(4, 불변=병합) = 무제한(도시무관) = 크로스도시 겹침 18개뿐 실측 = 재과금 근본 차단(같은 장소 재활용).
  //     • name_en/ko(6·7, 의심=메모)·고유명사 = 같은장소 반경조건 = nearSamePlaceRadius(같은 도시 OR 100km 이내)
  //       (도시번호 단독 한정 폐기 = 2026-07-17 사장님 SSOT = 장소는 지리적 실체 = 순수 확장·퇴행0).
  //       'Genoa'·'Cathedral' 등 일반명의 크로스도시 의심그룹 폭발(9,826개 실측)은 100km 가드가 차단 = 근교만 통과.
  //   veto = samePlace(PID게이트) 단일 = 양쪽 PID 있고 PID/URI 다르면 차단, PID 없으면 이름으로 매칭 §14재갱신.
  const nameStep = (key: string, by: MatchedBy, nearGuard: boolean) => {
    if (match || !key) return;
    const found = pickBest(candidates.filter((c) => samePlace(c, p) && (!nearGuard || nearSamePlaceRadius(c, p)) && nameKeys(c).includes(key)));
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
  // 4순위 = 로컬이름(name_local) = 불변(확정) = 도시무관(cityGuard=false, 재과금 근본 차단)
  nameStep(normName(p.nameLocal), 'name_local', false); // veto=samePlace(PID게이트) 단일 §14재갱신

  // 5순위 = 좌표 10m (= 같은 건물. 2026-06-11 = 로컬이름 아래로 강등: LLM 좌표 316m 편향·도심밀집 오병합 위험)
  if (!match && p.latitude && p.longitude) {
    match = pickBest(candidates.filter((c) => {
      const close =
        c.latitude != null && c.longitude != null &&
        Math.abs(Number(c.latitude) - p.latitude!) < 0.0001 &&
        Math.abs(Number(c.longitude) - p.longitude!) < 0.0001;
      if (!close) return false;
      return samePlace(c, p); // PID게이트 veto = 양쪽 PID 있고 PID/URI 다르면 다른 장소(차단), PID 없으면 좌표10m 로 병합 §14재갱신
    }));
    if (match) matchedBy = 'coords';
  }
  // ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 고유명사 매칭(불변=병합) = 이름 완전일치(6·7)로 안 잡히는 레거시 오염행 흡수.
  //   = 일반명사 걷어낸 고유명사키 일치 = 같은 장소(Palais de↔du Tau, Taittinger↔Champagne Taittinger). PID veto 유지.
  //   = 랭스 전수 실측 오병합 0. 범위 = nearSamePlaceRadius(같은 도시 OR 100km 이내, 2026-07-17 사장님 SSOT)
  //     = 원거리 짧은 고유명사 크로스도시 우연겹침은 100km 가드가 방지(3글자가드와 2중).
  if (!match && (p.nameEn || p.nameLocal || p.nameKo)) {
    const pk = properKeys(p);
    if (pk.size > 0) {
      // ⚠️ 고유명사 "키 완전일치"만 흡수 = 한쪽 이름칸의 고유명사키가 상대 이름칸의 키와 정확히 동일할 때만.
      //   랭스 실증: 부분겹침(some)이면 Les Crayères(crayeres) ⊂ Le Jardin Les Crayères(crayeresjardin) 오병합(저택 vs 그 안 식당).
      //   완전일치면 그 오병합 0 유지 + Palais de/du Tau(tau=tau)·Taittinger·Moët et/& Chandon 차이는 여전히 흡수.
      match = pickBest(candidates.filter((c) =>
        samePlace(c, p) && nearSamePlaceRadius(c, p) &&
        [...properKeys(c)].some((ck) => pk.has(ck))));
      if (match) matchedBy = 'name_local'; // 불변(confirmed) tier = 병합 (INVARIANT_MATCH 포함)
    }
  }

  nameStep(normName(p.nameEn), 'name_en', true);  // 6순위 = 가변(의심) = 반경조건(같은 도시 OR 100km, 원거리 일반명 노이즈 차단)
  nameStep(normName(p.nameKo), 'name_ko', true);  // 7순위 = 가변(의심) = 반경조건(같은 도시 OR 100km)

  return { match, matchedBy, tier: tierOverride ?? tierOf(matchedBy) };
}

// ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 후보 사전인덱스(pre-bucket) = 전체 PSR 도시무관 매칭 성능 (§16 매칭 SSOT 여기 1곳).
//   = 문제: 도시무관화로 후보가 전체 PSR(1.2만행) → matchCandidate 가 place 마다 전체를 filter = 24곳×150만비교 = 4.3초(디종 실측).
//   = 해결: 후보를 1회만 인덱싱(PID·URI·name·좌표셀·우편) → 각 place 는 자기 키의 후보 서브셋(수십개)만 matchCandidate 에 넘김.
//   = 매칭 결과 불변 보장: matcher 7단계가 찾을 수 있는 후보는 전부 서브셋에 포함(보수적). matchCandidate 로직 무변경.
//     PID/URI = 등가 Map / name(en·local·ko 9조합) = 정규화 Map / 좌표10m = 0.0001 그리드셀 ±1 / 주소3순위 = 우편 동일강제(matcher.ts:116)라 우편 Map.
const GRID = 0.0001; // 좌표 셀 크기 = matcher 좌표10m 임계와 동일
const cellKey = (lat: number, lng: number) => `${Math.round(lat / GRID)}:${Math.round(lng / GRID)}`;
const postalKeys = (addr: string | null | undefined): string[] => {
  const out: string[] = [];
  for (const t of new Set(addrTokens(addr))) { const m = t.match(/(?<!\d)\d{5}(?!\d)/); if (m) out.push(m[0]); }
  return out;
};
export interface CandidateIndex<C extends MatchCandidate> {
  byPid: Map<string, C[]>;
  byUri: Map<string, C[]>;
  byName: Map<string, C[]>;   // name_en·local·ko 정규화 → 행들 (9조합 대응)
  byCell: Map<string, C[]>;   // 좌표 그리드셀
  byPostal: Map<string, C[]>; // 우편번호 (주소 3순위 버킷)
  all: C[];
}
export function buildCandidateIndex<C extends MatchCandidate>(cands: C[]): CandidateIndex<C> {
  const byPid = new Map<string, C[]>(), byUri = new Map<string, C[]>(), byName = new Map<string, C[]>(),
        byCell = new Map<string, C[]>(), byPostal = new Map<string, C[]>();
  const push = (m: Map<string, C[]>, k: string, c: C) => { const a = m.get(k); if (a) a.push(c); else m.set(k, [c]); };
  for (const c of cands) {
    if (c.googlePlaceId) push(byPid, c.googlePlaceId, c);
    if (c.googleMapsUri) push(byUri, c.googleMapsUri, c);
    for (const nk of nameKeys(c)) push(byName, nk, c);
    if (c.latitude != null && c.longitude != null) push(byCell, cellKey(Number(c.latitude), Number(c.longitude)), c);
    for (const pk of postalKeys(c.address)) push(byPostal, pk, c);
  }
  return { byPid, byUri, byName, byCell, byPostal, all: cands };
}
// 이 입력(p)에 대해 matchCandidate 가 검사할 수 있는 후보 서브셋 = 7단계 키의 합집합(중복 제거).
export function candidatesFor<C extends MatchCandidate>(idx: CandidateIndex<C>, p: MatchInput): C[] {
  const seen = new Set<number>(), out: C[] = [];
  const add = (arr?: C[]) => { if (arr) for (const c of arr) if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } };
  if (p.googlePlaceId) add(idx.byPid.get(p.googlePlaceId));                        // 1순위 PID
  if (p.googleMapsUri) add(idx.byUri.get(p.googleMapsUri));                        // 2순위 URI
  for (const pk of postalKeys(p.address)) add(idx.byPostal.get(pk));              // 3순위 주소(우편 동일강제)
  for (const nk of [normName(p.nameLocal), normName(p.nameEn), normName(p.nameKo)]) // 4·6·7순위 이름(9조합)
    if (nk) add(idx.byName.get(nk));
  if (p.latitude != null && p.longitude != null) {                                // 5순위 좌표10m = 셀 ±1(인접 흡수)
    const ci = Math.round(p.latitude / GRID), cj = Math.round(p.longitude / GRID);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) add(idx.byCell.get(`${ci + di}:${cj + dj}`));
  }
  return out;
}
