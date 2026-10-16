// ⚠️ 수정금지(승인필요) 2026-09-12 사장님 결정 = "멈춘 영상 작업" 판정 1벌(접수·조회 공용)

import type { DayVideo } from "../shared/schema";

const STALE_PROCESSING_MS = 40 * 60 * 1000;

export function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}
