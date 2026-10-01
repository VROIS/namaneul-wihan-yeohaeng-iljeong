// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = R2 창고 = 도시 번호 폴더 하나에 사진·원본·영상·보고서, 도시 없는 여정 = 여정 번호 폴더, 사용자 것 = users 폴더 하나(파일 끝 사용자 번호), 모든 파일 이름 맨 앞 = 시각 초까지(관리 통계 하루 장부만 날짜) (정본 K3)

type Id = number | string;

export const fileStamp = (d: Date = new Date()): string =>
  d.toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "");

export const stampedName = (fileName: string): string | null =>
  fileName.match(/^\d{4}-\d{2}-\d{2}_\d{6}_(.+)\.[^.]+$/)?.[1] ?? null;

export const laterKey = (a: string, b: string): string =>
  b.slice(b.lastIndexOf("/")) > a.slice(a.lastIndexOf("/")) ? b : a;

export const placeImagesDir = (cityId: Id): string => `${cityId}/images`;

export const placeImageKey = (
  cityId: Id,
  category: string,
  name: string,
): string => `${placeImagesDir(cityId)}/${category}/${fileStamp()}_${name}`;

// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 장소가 다른 도시로 가면 사진도 그 도시 폴더로 = 파일 이름은 그대로, 도시 번호만 바꾼다 (정본 §)
export const placeImageKeyInCity = (key: string, cityId: Id): string | null => {
  const m = key.match(/^\d+\/images\/(.+)$/);
  return m ? `${placeImagesDir(cityId)}/${m[1]}` : null;
};

export const itineraryContext = (
  cityId: Id | null | undefined,
  itineraryId: Id | null | undefined,
): string | null =>
  cityId ? String(cityId) : itineraryId ? `itinerary-${itineraryId}` : null;

export const userContext = (userId: Id): string => `user-${userId}`;

export const guideContext = (cityId: unknown, userId: Id): string =>
  Number.isInteger(Number(cityId)) && Number(cityId) > 0
    ? String(Number(cityId))
    : userContext(userId);

export function rawPlace(contextId: Id | null | undefined): {
  dir: string;
  suffix: string;
} {
  const ctx = contextId == null ? "" : String(contextId).trim();
  if (/^\d+$/.test(ctx)) return { dir: `${ctx}/raw`, suffix: "" };
  const itin = ctx.match(/^itinerary-(\d+)$/);
  if (itin) return { dir: `system/itineraries/${itin[1]}/raw`, suffix: "" };
  const user = ctx.match(/^user-(.+)$/);
  if (user)
    return {
      dir: "users/raw",
      suffix: `_${user[1].replace(/[^0-9a-z-]+/gi, "-")}`,
    };
  return { dir: "system/runtime/raw", suffix: "" };
}

export const videoDir = (
  cityId: Id | null | undefined,
  itineraryId: Id,
): string =>
  cityId
    ? `${cityId}/videos/${itineraryId}`
    : `system/itineraries/${itineraryId}/videos`;

export const userGuidesDir = "users/guides";

export const userGuideImageKey = (
  guideId: Id,
  userId: Id | null | undefined,
): string =>
  `${userGuidesDir}/${fileStamp()}_${guideId}_${userId || "unknown"}`;

export const adminMetricsKey = (date: string): string =>
  `system/admin-metrics/${date}.jsonl`;

export const cityReportKey = (cityId: Id, fileName: string): string =>
  `${cityId}/reports/${fileName}`;
