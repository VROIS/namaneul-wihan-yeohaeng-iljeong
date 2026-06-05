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
// 6) 이름 9조합 (PID 없음, local 일치)
const r6 = matchCandidate({ cityId: 19, nameLocal: 'Place du Trocadéro' }, C);
check('6 이름9조합 매칭(local)', r6.matchedBy === 'name' && r6.match?.id === 3);
// 7) 동명 체인 = cityId 강제 (= 다른 도시 별개 행)
const r7 = matchCandidate({ cityId: 20, nameEn: 'Angelina' }, C);
check('7 동명 다른도시 = id4(cityId강제)', r7.matchedBy === 'name' && r7.match?.id === 4);
// 8) 풀주소 + 이름 부분포함
const r8 = matchCandidate({ cityId: 19, address: '1 Parv. de la Défense, 92800 Puteaux', nameEn: 'Grande Arche' }, C);
check('8 주소+이름부분포함 매칭', r8.matchedBy === 'address' && r8.match?.id === 1);
// 9) samePlace 단위
check('9a samePlace 다른PID=false', samePlace({ googlePlaceId: 'A' }, { googlePlaceId: 'B' }) === false);
check('9b samePlace PID없음=true', samePlace({ googlePlaceId: null }, { googlePlaceId: 'B' }) === true);
check('9c samePlace 다른URI=false', samePlace({ googleMapsUri: 'X' }, { googleMapsUri: 'Y' }) === false);

console.log(`\n═══ matcher 골든 = ${pass} pass / ${fail} fail ═══`);
if (fail > 0) process.exit(1);
