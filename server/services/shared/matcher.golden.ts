/**
 * ⚠️ 2026-06-03 = matcher.ts 골든 검증 (= 300도시 일관성 안전망, 헌법 §17)
 * 실행: npx tsx server/services/shared/matcher.golden.ts
 * = 매처가 1벌로 통합된 뒤 = 이 1개 테스트가 전 경로(upsert/ag3/트리거/발굴) 동작 보증.
 * = 핵심: PID/URI 다르면 = 같은 좌표·이름이어도 별개(none) = 오병합 0 (개선문↔La promenade 사고 재발 방지).
 */
import { matchCandidate, samePlace, type MatchCandidate } from './matcher';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ FAIL: ${name}`); }
};

// 가상 후보 풀 (= 파리 시내 행 모사)
const C: MatchCandidate[] = [
  { id: 1, cityId: 19, googlePlaceId: 'PID_ARCHE', googleMapsUri: 'cid_arche', address: '1 Parv. de la Défense, 92800 Puteaux', latitude: 48.8926, longitude: 2.2361, nameEn: 'Grande Arche de la Défense', nameLocal: 'Grande Arche de la Défense', nameKo: null },
  { id: 2, cityId: 19, googlePlaceId: null, googleMapsUri: null, address: '226 Rue de Rivoli, 75001 Paris', latitude: 48.8651, longitude: 2.3278, nameEn: 'Angelina', nameLocal: 'Angelina', nameKo: '안젤리나' },
  { id: 3, cityId: 19, googlePlaceId: 'PID_TROC', googleMapsUri: null, address: null, latitude: 48.8617, longitude: 2.2876, nameEn: 'Trocadéro Square', nameLocal: 'Place du Trocadéro', nameKo: null },
  { id: 4, cityId: 20, googlePlaceId: null, googleMapsUri: null, address: null, latitude: null, longitude: null, nameEn: 'Angelina', nameLocal: 'Angelina', nameKo: null },
];

// 1) PID 정확 매칭
check('1 PID 매칭', matchCandidate({ cityId: 19, googlePlaceId: 'PID_ARCHE', nameEn: 'x' }, C).matchedBy === 'pid');
// 2) URI 매칭
check('2 URI 매칭', matchCandidate({ cityId: 19, googleMapsUri: 'cid_arche', nameEn: 'x' }, C).matchedBy === 'uri');
// 3) ⭐ 같은 좌표 + 다른 PID = 절대 안 합침 (= 개선문↔La promenade 사고 핵심)
const r3 = matchCandidate({ cityId: 19, googlePlaceId: 'PID_PROMENADE', latitude: 48.8926, longitude: 2.2361, nameEn: 'La promenade' }, C);
check('3 같은좌표 다른PID = 별개(none)', r3.matchedBy === 'none' && !r3.match);
// 4) PID 없는 후보 + 좌표 일치 = coords 매칭 (= TS 가 미검증 행에 PID 채움)
const r4 = matchCandidate({ cityId: 19, googlePlaceId: 'PID_NEW', latitude: 48.8651, longitude: 2.3278, nameEn: 'Angelina' }, C);
check('4 PID없는후보 좌표매칭', r4.matchedBy === 'coords' && r4.match?.id === 2);
// 5) ⭐ 같은 이름 + 다른 PID = 안 합침 (= 이름 단계도 PID veto)
const r5 = matchCandidate({ cityId: 19, googlePlaceId: 'PID_OTHER', nameLocal: 'Place du Trocadéro' }, C);
check('5 같은이름 다른PID = 별개(none)', r5.matchedBy === 'none' && !r5.match);
// 6) 로컬이름 매칭 (PID 없음, name_local 일치) = 불변 = 확정
const r6 = matchCandidate({ cityId: 19, nameLocal: 'Place du Trocadéro' }, C);
check('6 로컬이름 매칭(불변=확정)', r6.matchedBy === 'name_local' && r6.tier === 'confirmed' && r6.match?.id === 3);
// 7) 영어명 매칭 = 가변 = 의심 + 동명 체인 cityId 강제 (= 다른 도시 별개 행)
const r7 = matchCandidate({ cityId: 20, nameEn: 'Angelina' }, C);
check('7 영어명 매칭(가변=의심) + cityId강제 id4', r7.matchedBy === 'name_en' && r7.tier === 'suspect' && r7.match?.id === 4);
// 8) 풀주소 + 이름 부분포함
const r8 = matchCandidate({ cityId: 19, address: '1 Parv. de la Défense, 92800 Puteaux', nameEn: 'Grande Arche' }, C);
check('8 주소+이름부분포함 매칭', r8.matchedBy === 'address' && r8.match?.id === 1);
// 9) samePlace 단위
check('9a samePlace 다른PID=false', samePlace({ googlePlaceId: 'A' }, { googlePlaceId: 'B' }) === false);
check('9b samePlace PID없음=true', samePlace({ googlePlaceId: null }, { googlePlaceId: 'B' }) === true);
check('9c samePlace 다른URI=false', samePlace({ googleMapsUri: 'X' }, { googleMapsUri: 'Y' }) === false);

// ⭐ 2026-06-10 = 주소 약어("C."→Calle) + 구區 segment 변형 흡수 (= 박물관 76534↔77182 재입력 중복 재발 방지, 매처 갭 회귀)
const C2: MatchCandidate[] = [
  { id: 10, cityId: 37, googlePlaceId: 'PID_MUSEO', googleMapsUri: null, address: 'C. de José Gutiérrez Abascal, 2, Chamartín, 28006 Madrid', latitude: 40.4412, longitude: -3.69019, nameEn: 'Museo Nacional de Ciencias Naturales (MNCN) - CSIC', nameLocal: 'Museo Nacional de Ciencias Naturales (MNCN) - CSIC', nameKo: '국립 자연과학 박물관' },
];
// 10) 약어 + 구segment 다른 같은 주소 = address 확정매칭 (= 병합)
const r10 = matchCandidate({ cityId: 37, address: 'Calle de José Gutiérrez Abascal, 2, 28006 Madrid', nameLocal: 'Museo Nacional de Ciencias Naturales' }, C2);
check('10 주소약어+구변형 = address 확정매칭', r10.matchedBy === 'address' && r10.tier === 'confirmed' && r10.match?.id === 10);
// 11) ⭐ 같은 거리·우편 다른 번지(99) = 주소 안 합침 (= 토큰부분집합 오병합 방지)
const r11 = matchCandidate({ cityId: 37, address: 'Calle de José Gutiérrez Abascal, 99, 28006 Madrid', nameLocal: 'Museo Nacional de Ciencias Naturales' }, C2);
check('11 같은거리 다른번지 = 주소매칭 안함', r11.matchedBy !== 'address');

// ⭐ 2026-06-11 = 보강 3종 회귀 (= 사용자 SSOT: 좌표 5순위 강등 + "있는 쪽 승리" pickBest + 주소 노이즈 흡수)
const C3: MatchCandidate[] = [
  // Botero 모사: 같은 로컬이름 2행 = PID 완비 원본(20) vs PID 없는 신규 형제(21, id 더 큼)
  { id: 20, cityId: 37, googlePlaceId: 'PID_BOTERO', googleMapsUri: null, address: 'Calle Ciudad, 5, 45002 Toledo, Spain', latitude: 39.856, longitude: -4.03, nameEn: 'Taberna El Botero', nameLocal: 'Taberna El Botero', nameKo: null },
  { id: 21, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: 'Calle de la Ciudad, 5, 45001 Toledo', latitude: null, longitude: null, nameEn: 'Taberna El Botero', nameLocal: 'Taberna El Botero', nameKo: null },
  // 순서검증: 로컬이름은 30과, 좌표는 31과 일치하는 입력 → name_local(30) 승리해야
  { id: 30, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: null, latitude: 40.50, longitude: -3.50, nameEn: 'Casa Mira', nameLocal: 'Casa Mira', nameKo: null },
  { id: 31, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: null, latitude: 40.42, longitude: -3.70, nameEn: 'Otro Sitio', nameLocal: 'Otro Sitio', nameKo: null },
  // 노이즈: DB 주소에 Spain 접미 / s/n
  { id: 40, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: 'Calle de Ferraz, 1, 28008 Madrid, Spain', latitude: null, longitude: null, nameEn: 'Templo de Debod', nameLocal: 'Templo de Debod', nameKo: null },
  { id: 41, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: 'Plaza de Cibeles, s/n, 28014 Madrid, Spain', latitude: null, longitude: null, nameEn: 'Fuente de Cibeles', nameLocal: 'Fuente de Cibeles', nameKo: null },
  // 오병합 안전선: 같은 우편+번지(같은 건물) 다른 가게
  { id: 50, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: 'Gran Via, 12, 28013 Madrid', latitude: null, longitude: null, nameEn: 'Bar Uno', nameLocal: 'Bar Uno', nameKo: null },
];
// 12) ⭐ pickBest "있는 쪽 승리" = 같은 단계(로컬이름)에서 후보 2(PID완비 20 vs PID없는 형제 21) → 20 keep (= Botero 회귀)
//    (주소 입력 없음 = 로컬이름 단계에서 둘 다 매칭 → 신뢰점수 PID8+주소2+좌표1=11 > 주소2 → 원본 승)
const r12 = matchCandidate({ cityId: 37, nameLocal: 'Taberna El Botero', nameEn: 'Taberna El Botero' }, C3);
check('12 pickBest = PID완비 원본 keep', r12.match?.id === 20 && r12.tier === 'confirmed');
// 13) ⭐ 좌표 5순위 강등 = 로컬이름(30) vs 좌표(31) 동시 매칭 → name_local 승리
const r13 = matchCandidate({ cityId: 37, nameLocal: 'Casa Mira', latitude: 40.42, longitude: -3.70 }, C3);
check('13 로컬이름 > 좌표 (순서 SSOT)', r13.matchedBy === 'name_local' && r13.match?.id === 30);
// 14) ⭐ Spain 접미 노이즈 회복 = 국가명 한쪽만 있어도 address 확정매칭
const r14 = matchCandidate({ cityId: 37, address: 'Calle de Ferraz, 1, 28008 Madrid', nameLocal: 'Templo de Debod' }, C3);
check('14 Spain접미 흡수 = address 매칭', r14.matchedBy === 'address' && r14.match?.id === 40);
// 15) ⭐ s/n(번지없음) 회복 = 한쪽 s/n 이면 번지 면제 = address 확정매칭
const r15 = matchCandidate({ cityId: 37, address: 'Plaza de Cibeles, 28014 Madrid', nameLocal: 'Fuente de Cibeles' }, C3);
check('15 s/n 흡수 = address 매칭', r15.matchedBy === 'address' && r15.match?.id === 41);
// 16) ⭐ 오병합 안전선 = 같은 우편+번지(같은 건물) 다른 이름 = address 안 합침 (로컬이름 보조판별)
const r16 = matchCandidate({ cityId: 37, address: 'Gran Via, 12, 28013 Madrid', nameLocal: 'Bar Dos' }, C3);
check('16 같은건물 다른가게 = 안 합침', r16.matchedBy !== 'address');

// ⭐ 2026-06-11 = 마드리드 재입력 신규21 누수 실측 회귀 (= 주소 양방향·s/n내장·sta약어·strip보조·suspect승격)
const C4: MatchCandidate[] = [
  // 루프탑: DB 구區명(Centro) 포함 = 토큰수 동률 (옛 단방향 부분집합이 차단했던 케이스)
  { id: 60, cityId: 37, googlePlaceId: 'PID_CBA', googleMapsUri: null, address: 'C. Alcalá, 42, Centro, 28014 Madrid', latitude: null, longitude: null, nameEn: 'Círculo de Bellas Artes', nameLocal: 'Círculo de Bellas Artes', nameKo: null },
  // Balconada: DB 가 s/n(번지없음) — raw 는 번지 30
  { id: 61, cityId: 37, googlePlaceId: 'PID_BALC', googleMapsUri: null, address: 'Pl. Mayor, s/n, 28370 Chinchón, Madrid', latitude: null, longitude: null, nameEn: 'Restaurante La Balconada', nameLocal: 'Restaurante La Balconada', nameKo: null },
  // Locum: 주소 완전 동일 + 이름 5자(min6 가드에 막혔던 케이스)
  { id: 62, cityId: 37, googlePlaceId: null, googleMapsUri: null, address: 'Calle del Locum, 6, 45001 Toledo, Spain', latitude: null, longitude: null, nameEn: 'Restaurante Locum', nameLocal: 'Restaurante Locum', nameKo: null },
  // San Antón: 관사(de) + 악센트 변형
  { id: 63, cityId: 37, googlePlaceId: 'PID_ANTON', googleMapsUri: null, address: 'C. de Augusto Figueroa, 24, Centro, 28004 Madrid', latitude: null, longitude: null, nameEn: 'Mercado San Antón', nameLocal: 'Mercado San Antón', nameKo: null },
  // Trébol: 'Sta.' 약어 + 같은 거리 1↔10 번지 다른 가게 실재 (오병합 차단 검증)
  { id: 64, cityId: 37, googlePlaceId: 'PID_TRE1', googleMapsUri: null, address: 'C. de Sta. Fe, 1, 45001 Toledo', latitude: null, longitude: null, nameEn: 'El Trébol', nameLocal: 'El Trébol', nameKo: null },
  { id: 65, cityId: 37, googlePlaceId: 'PID_TRE10', googleMapsUri: null, address: 'Calle de Santa Fe, 10, 45001 Toledo, Spain', latitude: null, longitude: null, nameEn: 'El Trébol II', nameLocal: 'El Trébol II', nameKo: null },
  // Botero: 이름 exact + 거리·번지 동일 + 우편 인접구 환각(45001↔45002) = 승격 대상
  { id: 66, cityId: 37, googlePlaceId: 'PID_BOT', googleMapsUri: null, address: 'Calle Ciudad, 5, 45002 Toledo, Spain', latitude: null, longitude: null, nameEn: 'Taberna El Botero', nameLocal: 'Taberna El Botero', nameKo: null },
  // Matilde: 같은 권역(city 37) 다른 도시(Aranjuez) 동명 식당 = 승격 금지 검증
  { id: 67, cityId: 37, googlePlaceId: 'PID_MAT', googleMapsUri: null, address: 'Carr. de Madrid, 2, 28300 Aranjuez, Madrid', latitude: null, longitude: null, nameEn: 'Restaurante Matilde', nameLocal: 'Matilde', nameKo: null },
];
// 17) 주소 양방향 부분집합 = 구區명 동률 흡수 + 이름 includes
const r17 = matchCandidate({ cityId: 37, address: 'Calle de Alcalá, 42, 28014 Madrid', nameLocal: 'Azotea del Círculo de Bellas Artes', nameEn: 'Círculo de Bellas Artes Rooftop' }, C4);
check('17 주소 양방향(구명 동률) = address 매칭', r17.matchedBy === 'address' && r17.match?.id === 60);
// 18) DB s/n vs raw 번지 = s/n 면제 내장
const r18 = matchCandidate({ cityId: 37, address: 'Plaza Mayor, 30, 28370 Chinchón, Spain', nameLocal: 'La Balconada' }, C4);
check('18 DB s/n vs raw 번지30 = address 매칭', r18.matchedBy === 'address' && r18.match?.id === 61);
// 19) 주소 동일 + 5자 이름 = strip토큰 보조 (min6 가드 해소)
const r19 = matchCandidate({ cityId: 37, address: 'Calle del Locum, 6, 45001 Toledo, Spain', nameLocal: 'Locum' }, C4);
check('19 주소동일+Locum(5자) = strip 보조 매칭', r19.matchedBy === 'address' && r19.match?.id === 62);
// 20) 관사(de)+악센트 변형 = strip토큰 보조
const r20 = matchCandidate({ cityId: 37, address: 'Calle de Augusto Figueroa, 24, 28004 Madrid', nameLocal: 'Mercado de San Antón' }, C4);
check('20 관사+악센트 = strip 보조 매칭', r20.matchedBy === 'address' && r20.match?.id === 63);
// 21) Sta. 약어 흡수 + 같은 거리 다른 번지(10) 오병합 차단 = 1번지(64)만 매칭
const r21 = matchCandidate({ cityId: 37, address: 'Calle de Santa Fe, 1, 45001 Toledo, Spain', nameLocal: 'Cervecería El Trébol' }, C4);
check('21 Sta.약어 + 번지1만 매칭(10 차단)', r21.matchedBy === 'address' && r21.match?.id === 64);
// 22) ⭐ suspect 승격 = name_en exact + 거리·번지 동일 + 우편 앞3 호환(450xx) → confirmed
const r22 = matchCandidate({ cityId: 37, address: 'Calle de la Ciudad, 5, 45001 Toledo, Spain', nameEn: 'Taberna El Botero', nameLocal: 'El Botero' }, C4);
check('22 Botero 승격 = name_en + 주소보강 = confirmed', r22.matchedBy === 'name_en' && r22.tier === 'confirmed' && r22.match?.id === 66);
// 23) ⭐ 승격 금지 = name_en exact 지만 주소 비보강(다른 도시권) = suspect 유지
const r23 = matchCandidate({ cityId: 37, address: 'C. Orégano, 45004 Toledo', nameEn: 'Restaurante Matilde' }, C4);
check('23 Matilde = 주소 비보강 = suspect 유지', r23.matchedBy === 'name_en' && r23.tier === 'suspect' && r23.match?.id === 67);

console.log(`\n═══ matcher 골든 = ${pass} pass / ${fail} fail ═══`);
if (fail > 0) process.exit(1);
