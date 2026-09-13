// ⚠️ 수정금지(승인필요) 2026-09-12 사장님 결정 = "멈춘 영상 작업" 판정 1벌(접수·조회 공용)
// 값 = 컨테이너 sleepAfter 35m 보다 커야 한다(씬 폴링 10분 × 3바퀴 ≈ 30분 + 합성).
// 작으면 조회가 정상 작업을 실패로 뒤집고, 접수는 이중 실행 = 60크레딧 2회 차감.

import type { DayVideo } from "../shared/schema";

export const STALE_PROCESSING_MS = 40 * 60 * 1000;

export function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}
