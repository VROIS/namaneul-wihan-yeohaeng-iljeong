// ⚠️ 영구 컴포넌트 2026-06-12 = 사용자 SSOT = 일자 분배 + 일내 동선 = clusterIntoDays(k-means) 드롭인 교체
// = 검증 정본(파리 P1/P2/P3 + 마드리드 실데이터 시뮬, 사장님 확정):
//   ① NN 체이닝 = 전체 활동을 좌표 최인접 한 줄 동선으로 (= 붙은 곳 자연 연속 = 디즈니 2파크 안 갈라짐)
//   ② 최대간격 절단 = 상한(slots-2)까지 꽉 채움. 단 경계가 붙어있으면(<1km) 한 칸 당겨 분리 회피.
//   ③ 일자 정렬 = Day1 도심 → 외곽 날 뒤로 (= 본능: 시간없으면 도심부터, 남으면 외곽 = 그룹 평균 중심거리 오름차순)
//   ④ 일내 동선(orderHoming) = 그 날 최외곽이 1코스 → NN 으로 도심/숙소 귀환 (= 귀소 본능 = 저녁이 도심/숙소 근처)
// = 좌표만 사용 = 도시 하드코딩 0 = 300도시 공통. 외부호출 0 / 결정적(시뮬=라이브 동일).
import type { PlaceResult } from "../agents/types";
import { haversineKm } from "../agents/transit-haversine";

type LatLng = { lat: number; lng: number };

// 경계가 이보다 가까우면 = 붙은 곳(디즈니 2파크 등) = 절단 회피
const NEAR_KM = 1.0;
// 도심 날(평균 중심거리 ≤ CITY_KM)은 활동 +CITY_BONUS 더 담음 (= 가까워 많이 소화. 외곽 날은 baseCap). 사용자 SSOT 2026-06-12.
const CITY_KM = 10;
const CITY_BONUS = 1;

const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const distFrom = (p: PlaceResult, c: LatLng) =>
  haversineKm(c.lat, c.lng, p.lat, p.lng);

/**
 * 공통 NN 순서 = 그 날(또는 전체)의 최외곽에서 시작 → 미방문 최근접 점프.
 * = nnChain(일자 분배용) + orderHoming(일내 동선) 공유 = 좌표 최인접 한 줄 + 붙은 곳 연속 + 귀소(외곽→도심).
 */
function nnFromFarthest(pts: PlaceResult[], center: LatLng): PlaceResult[] {
  if (pts.length <= 1) return [...pts];
  let start = pts[0],
    sd = -1;
  for (const p of pts) {
    const d = distFrom(p, center);
    if (d > sd) {
      sd = d;
      start = p;
    }
  }
  const rem = pts.filter((p) => p !== start);
  const ord = [start];
  let cur: LatLng = start;
  while (rem.length) {
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < rem.length; i++) {
      const d = haversineKm(cur.lat, cur.lng, rem[i].lat, rem[i].lng);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    ord.push(rem[bi]);
    cur = rem[bi];
    rem.splice(bi, 1);
  }
  return ord;
}

/**
 * 일자 분배 = clusterIntoDays 동일 시그니처. slotsPerDay = 일자별 활동 한도(= slots-2).
 * @param items 활동(비식당, 좌표 보유 = route-local 이 필터·슬롯상한 적용 후 전달)
 * @param slotsPerDay 일자별 활동 수(= dc.slots-2). route-local daySlotsConfig 에서 산출.
 * @param center 도시 중심 (= 추후 숙소 좌표)
 */
export function sectorIntoDays(
  items: PlaceResult[],
  slotsPerDay: number[],
  center: LatLng,
): PlaceResult[][] {
  const pts = items.filter(hasCoord);
  const k = slotsPerDay.length;
  if (k <= 1) return [pts];
  if (pts.length <= k)
    return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));

  // ① NN 체인
  const chain = nnFromFarthest(pts, center);
  const n = chain.length;
  // 인접 거리 (절단 경계 판정용)
  const gaps: number[] = [];
  for (let i = 0; i < n - 1; i++)
    gaps.push(
      haversineKm(
        chain[i].lat,
        chain[i].lng,
        chain[i + 1].lat,
        chain[i + 1].lng,
      ),
    );

  // ⚠️ 2026-07-04 사장님 SSOT = 후보 총량이 목표(Σ slotsPerDay)보다 부족할 때, 마지막 날에 부족분이 몰리는 결함 수정(§0).
  //   = 부족분을 전 Day에 균등 비례 축소해 배분(마지막 날만 텅 비는 현상 방지). 후보 충분하면 원래 슬롯 그대로(기존 검증 로직 불변).
  const totalDemand = slotsPerDay.reduce((s, v) => s + Math.max(1, v), 0);
  const shortage = Math.max(0, totalDemand - n);
  const effectiveSlots =
    shortage === 0
      ? slotsPerDay
      : (() => {
          // 부족분(shortage)만큼 각 Day에서 균등히 1개씩 순환 차감(큰 Day부터) = 특정 Day만 0으로 몰리지 않게.
          const arr = slotsPerDay.map((v) => Math.max(1, v));
          let remain = shortage;
          while (remain > 0) {
            const maxIdx = arr.reduce((mi, v, i) => (v > arr[mi] ? i : mi), 0);
            if (arr[maxIdx] <= 1) break; // 모든 Day가 최소 1까지 내려가면 중단(0개 Day 방지)
            arr[maxIdx] -= 1;
            remain -= 1;
          }
          return arr;
        })();

  // ② 절단 = 도심 날은 활동 +1 더 담고(가까워 많이 소화) 외곽 날은 적게 = 거리별 자연 차등 (사용자 SSOT 2026-06-12).
  //   = 그룹 시작이 도심 밀집(평균 ≤ CITY_KM)이면 cap+CITY_BONUS(=활동7), 외곽이면 baseCap(=활동6). 붙은 곳(<NEAR_KM) 경계는 ±1 당겨 분리 회피.
  //   = 도심이 NN 체인상 한 덩어리로 모이므로 도심 날이 더 채워지고 외곽 날이 5~6 으로 줄어듦(= 직전 라이브 9/8/7 의도형).
  const groups: PlaceResult[][] = [];
  let start = 0;
  for (let d = 0; d < k - 1; d++) {
    const baseCap = Math.max(1, effectiveSlots[d]);
    // 이 그룹 시작 구간(baseCap+CITY_BONUS 만큼)의 평균 중심거리로 도심/외곽 판정
    const peek = chain.slice(start, start + baseCap + CITY_BONUS);
    const avgKm =
      peek.reduce((s, p) => s + distFrom(p, center), 0) / (peek.length || 1);
    const cap = avgKm <= CITY_KM ? baseCap + CITY_BONUS : baseCap;
    let cut = Math.min(start + cap, n);
    if (cut > start + 1 && cut < n && gaps[cut - 1] < NEAR_KM) cut -= 1; // 붙은 곳 분리 회피
    groups.push(chain.slice(start, cut));
    start = cut;
  }
  groups.push(chain.slice(start)); // 마지막 날 = 나머지

  // ③ 일자 정렬 = Day1 도심 → 외곽 날 뒤로 (그룹 평균 중심거리 오름차순)
  groups.sort((a, b) => {
    const ca = a.length
      ? a.reduce((s, p) => s + distFrom(p, center), 0) / a.length
      : Infinity;
    const cb = b.length
      ? b.reduce((s, p) => s + distFrom(p, center), 0) / b.length
      : Infinity;
    return ca - cb;
  });
  return groups;
}

/**
 * ④ 일내 동선 = 그 날 최외곽이 1코스 → NN 으로 도심/숙소 귀환 (= 귀소 본능)
 *   = orderByNN(폐루프) 대체. 외곽 먼저 가고 도심으로 수렴 → 저녁(마지막)이 도심/숙소 근처.
 */
export function orderHoming(
  items: PlaceResult[],
  center: LatLng,
): PlaceResult[] {
  const valid = items.filter(hasCoord);
  const invalid = items.filter((p) => !hasCoord(p));
  if (valid.length <= 1) return [...valid, ...invalid];
  return [...nnFromFarthest(valid, center), ...invalid]; // 최외곽 1코스 → 도심/숙소 귀환 (= 귀소)
}
