// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 승인 = 외부호출 429(한도초과) 재시도 1벌 (§16 = 텍스트·영상 공용).
// = 근거: 구글 공식 권고(지수 대기 재시도) + 2026-08-06 리서치·대시보드 실측(한도 = 프로젝트 단위·모델별 분리).
// = 옛 video-gen-client 로컬 withQuotaRetry 를 이 파일로 승격(§19 이동) — 실증 딜레이(20/40/60초)는 호출부가 인자로 유지.
// = 텍스트(geminiClient) 기본 딜레이 = 1→2→4→8초(스파이크용, 구글 troubleshooting 권고 형태).
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
