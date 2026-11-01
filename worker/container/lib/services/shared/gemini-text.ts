// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "플로우 안에 있는 모델과 같이 맞춰서 한 벌 더" = 지금 코드: 컨테이너의 제미니 글 호출 1벌(장면 대본) · 모델 = Flow 대본 도구와 같은 gemini-3-flash-preview · 원본 저장·장부 같이 (정본 2026-11-01)
import { recordExternalCall } from "./external-call-log";
import { saveRaw } from "./save-raw";
import { withQuotaRetry } from "./retry-429";

const TEXT_MODEL = "gemini-3-flash-preview";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function geminiTextJson<T>(
  prompt: string,
  opts: {
    apiKey: string;
    contextId?: string | number | null;
    rawTag?: string | null;
  },
): Promise<T> {
  const startedAt = Date.now();
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  };
  let json: any;
  try {
    json = await withQuotaRetry(
      async () => {
        const res = await fetch(
          `${API_BASE}/models/${TEXT_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": opts.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60000),
          },
        );
        const j: any = await res.json();
        if (!res.ok) {
          const err: Error & { status?: number } = new Error(
            `[gemini-text] ${res.status}: ${JSON.stringify(j).slice(0, 500)}`,
          );
          err.status = res.status;
          throw err;
        }
        return j;
      },
      { label: "gemini-text" },
    );
  } catch (e) {
    void recordExternalCall({
      provider: "gemini",
      sku: TEXT_MODEL,
      tag: opts.rawTag ?? null,
      responseTimeMs: Date.now() - startedAt,
      success: false,
      errorMessage: String((e as Error)?.message || e).slice(0, 300),
    });
    throw e;
  }
  const candidate = json?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p: any) => p?.text || "")
    .join("");
  await saveRaw({
    source: "gemini",
    contextId: opts.contextId,
    tag: opts.rawTag || "gemini-text",
    request: { prompt, model: TEXT_MODEL },
    raw: { parsed: null, text, finishReason: candidate?.finishReason ?? null },
  });
  void recordExternalCall({
    provider: "gemini",
    sku: TEXT_MODEL,
    tag: opts.rawTag ?? null,
    responseTimeMs: Date.now() - startedAt,
    success: true,
  });
  return JSON.parse(text) as T;
}
