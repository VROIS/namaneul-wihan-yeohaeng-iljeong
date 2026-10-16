// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 승인 = 외부호출 429(한도초과) 재시도 1벌 (§16 = 텍스트·영상 공용).
const DEFAULT_DELAYS_MS = [1000, 2000, 4000, 8000];

export async function withQuotaRetry<T>(
  fn: () => Promise<T>,
  opts?: { delaysMs?: number[]; label?: string },
): Promise<T> {
  const delays = opts?.delaysMs ?? DEFAULT_DELAYS_MS;
  const label = opts?.label || "external";
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || "");
      const is429 =
        e?.status === 429 ||
        msg.includes('"code":429') ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (!is429 || attempt >= delays.length) throw e;
      console.warn(
        `[retry-429] ${label} 한도 = ${delays[attempt] / 1000}초 대기 후 재시도(${attempt + 1}/${delays.length})`,
      );
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}
