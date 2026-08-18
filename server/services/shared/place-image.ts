// ⚠️ 수정금지(승인필요) 2026-06-11 사용자 SSOT = 이미지 = image_url(구글 PM) 1종 통일
// = best_image_url(고아·비PM 2순위 폴백) + photo_urls(고아·버그) DROP = 헛바퀴 폐기
// = 모든 호출자 (= AG2-DB / AG4-DB 식당풀·BTS카드 / AG3 match-core) = 본 함수 강제(§16 단일 진입점)
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = PID공유 이미지 폴백 = **PID 단독 키**(같은 PID = 같은 장소 원론 §14
//   = "1 PID → 이미지 멀티유저"). 옛 "{category}/{pid}" 도시단일 Set = 폐기 = 2026-08-18 §19(비판검증 확정결함:
//   ①옆도시 행 무력화 ②같은 PID가 폴더(카테고리) 다르게 저장된 실측 케이스 미스).
//   = PID중복행(트리거가 image_url 기록을 막아 컬럼이 계속 NULL인 행)도, 같은 PID 형제행이 이미 R2에
//     올려둔 이미지를 그대로 공유해서 보여준다. 병합(행 삭제·이전) 없이 읽기 경로만으로 해결(§2 안전).
//   = 존재확인 없이 URL만 조합하면 깨진 이미지가 될 수 있어, 반드시 loadImagePidMap(실제 R2 목록,
//     도시당 60초 캐시 = 한 생성흐름에서 ag2·ag4 가 각각 불러도 listR2 는 도시당 1회)으로 확인된 실키만 반환.
import { getR2PublicUrl, listR2 } from "./r2-client";

// 도시별 R2 목록 캐시(60초) = 같은 생성 요청 안에서 ag2→ag4 가 연달아 불러도 listR2 재호출 0.
//   TTL 짧아도 안전: 라이브 PM 성공분은 image_url 컬럼에 직접 기록되어 폴백 자체를 안 탐.
const CACHE_TTL_MS = 60_000;
const cityCache = new Map<number, { at: number; map: Map<string, string> }>();

/**
 * R2 place-images/ 실존 목록 = PID → 실제 R2 key. 여러 도시(요청도시+크로스도시) 한 번에.
 * 실패한 도시는 조용히 건너뜀(폴백 없이 기존 동작 = imageUrl 컬럼만).
 */
export async function loadImagePidMap(
  cityIds: number | (number | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      (Array.isArray(cityIds) ? cityIds : [cityIds]).filter(
        (n): n is number => typeof n === "number" && n > 0,
      ),
    ),
  ];
  const merged = new Map<string, string>();
  for (const cid of ids) {
    const hit = cityCache.get(cid);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      for (const [k, v] of hit.map) merged.set(k, v);
      continue;
    }
    try {
      const objs = await listR2(`place-images/${cid}/`);
      const m = new Map<string, string>();
      for (const o of objs) {
        const mm = o.key.match(/\/([^/]+)\.jpg$/);
        if (mm) m.set(mm[1], o.key); // PID(파일명) → 실키(폴더 무관 = 실제 저장 위치 그대로)
      }
      cityCache.set(cid, { at: Date.now(), map: m });
      for (const [k, v] of m) merged.set(k, v);
    } catch {
      // R2 미설정·조회실패 = 그 도시만 폴백 생략
    }
  }
  return merged;
}

/**
 * place_seed_raw 행 = 이미지 URL 결정
 * 입력 = {imageUrl}(= 구글 PM 검증 이미지, 최우선) + {googlePlaceId}
 *        + imagePidMap(선택, loadImagePidMap 으로 미리 확보 = PID공유 폴백)
 * 출력 = string ('' = 폴백까지 실패)
 */
export function pickPlaceImage(
  seed: { imageUrl?: string | null; googlePlaceId?: string | null },
  imagePidMap?: Map<string, string>,
): string {
  if (seed.imageUrl) return seed.imageUrl;
  const key = seed.googlePlaceId
    ? imagePidMap?.get(seed.googlePlaceId)
    : undefined;
  return key ? getR2PublicUrl(key) : "";
}
