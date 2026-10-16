// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = "지금 Worker 안인가" 판별 1벌(§16) = db.ts·r2-client.ts 가 같은 3줄을 갖고 있던 것을 합침
export const IS_WORKER =
  typeof navigator !== "undefined" &&
  /Cloudflare-Workers/.test(String((navigator as any).userAgent ?? ""));
