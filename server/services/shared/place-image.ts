// ⚠️ 수정금지(승인필요) 2026-06-11 사용자 SSOT = 이미지 = image_url(구글 PM) 1종 통일
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = PID공유 이미지 폴백 = **PID 단독 키**(같은 PID = 같은 장소 원론 §14
import { getR2PublicUrl, listR2 } from "./r2-client";

const CACHE_TTL_MS = 60_000;
const cityCache = new Map<number, { at: number; map: Map<string, string> }>();

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
    } catch {}
  }
  return merged;
}

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
