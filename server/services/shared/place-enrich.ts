/**
 * ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 정규화·타입 유틸 단일 모듈 (= 옛 matcher.ts 매칭블록 완전삭제 §19).
 *
 * = 중복 판정(매칭)은 앱 코드가 하지 않는다 = DB 트리거 `place_seed_raw_prevent_dup` 단일 관문이 전담(§14/§16/§20).
 *   옛 matcher.ts 의 matchCandidate(코드 7단계 매칭) = 트리거와 2벌 = 재발명 기계 = 완전삭제 2026-07-18 §19.
 *   입력은 무엇이든 upsertPlace → INSERT → 막히면 트리거가 준 id 흡수(recoverTriggerDup). 코드 매칭 없음.
 * = 이 파일에 남은 것 = 트리거 SQL 과 byte 동형인 순수 정규화 함수 + place-upsert 가 쓰는 MatchedBy 타입뿐.
 *   (normAddr/normName/nameKeys = 트리거 LOWER(TRIM) 정합 / properNameKey/properKeys = psr_proper_key 동형.)
 */

export type MatchedBy = 'pid' | 'uri' | 'address' | 'coords' | 'name_local' | 'name_en' | 'name_ko' | 'none';
// ⚠️ 2026-06-08 = 매칭 신뢰 등급 = 불변(확정) / 가변(의심) / 무매칭
export type MatchTier = 'confirmed' | 'suspect' | 'none';
const INVARIANT_MATCH: MatchedBy[] = ['pid', 'uri', 'address', 'coords', 'name_local'];
export const tierOf = (m: MatchedBy): MatchTier =>
  m === 'none' ? 'none' : INVARIANT_MATCH.includes(m) ? 'confirmed' : 'suspect';

// 주소 정규화 = 소문자 + 구두점→공백 + 공백압축 + trim (= DB 트리거 주소 정규식과 동형 §16)
export const normAddr = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// 이름 정규화 = trim + 소문자 (= DB 트리거 `LOWER(TRIM)` 과 동일 식 §16 = 앱↔DB 일관성)
export const normName = (s: string | null | undefined): string => (s || '').trim().toLowerCase();

// 이름 후보키 (en/local/ko) = 후보 행의 모든 이름칸 정규화 배열
export const nameKeys = (x: { nameEn?: string | null; nameLocal?: string | null; nameKo?: string | null }): string[] =>
  [normName(x.nameEn), normName(x.nameLocal), normName(x.nameKo)].filter(Boolean);

// ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = 고유명사 키 = "첫 글자 대문자=고유명사"(라틴권 공통) + 업종/시설어 최소사전 제거.
//   = DB psr_proper_key 와 byte 동형(§16). 대문자 시작 토큰만 남기되 업종/시설어(GENERIC_FACILITY)는 대문자여도 걷어냄.
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
    .filter((t) => !GENERIC_FACILITY.has(t))                 // 업종/시설어(대문자여도) 제거
    .sort()
    .join('');
};
// 후보 x 의 라틴이름칸(en/local)에서 뽑은 고유명사 키 집합 (빈 키·3글자미만 = 우연겹침 위험이라 제외).
//   ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT = name_ko(한글) 제외 = "첫 대문자=고유명사" 원칙 불가.
export const properKeys = (x: { nameEn?: string | null; nameLocal?: string | null; nameKo?: string | null }): Set<string> => {
  const out = new Set<string>();
  for (const raw of [x.nameEn, x.nameLocal]) {
    const k = properNameKey(raw);
    if (k.length >= 3) out.add(k);
  }
  return out;
};
