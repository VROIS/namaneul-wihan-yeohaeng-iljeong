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
  return parseJsonLoose<T>(text);
}

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 응답에서 첫 JSON 덩어리만 꺼냄(앞뒤 군더더기 무시) · 응답이 중간에 끊겼으면 마지막 완성 지점까지 닫아서 받음 (정본 2026-11-03)
function parseJsonLoose<T>(text: string): T {
  const start = text.search(/[[{]/);
  if (start < 0)
    throw new Error(`[gemini-text] JSON 없음: ${text.slice(0, 200)}`);
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let end = -1;
  let lastClose = -1;
  let openAtLastClose: string[] = [];
  for (let i = start; i < text.length && end < 0; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") open.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      open.pop();
      lastClose = i;
      openAtLastClose = [...open];
      if (!open.length) end = i;
    }
  }
  const body =
    end >= 0
      ? text.slice(start, end + 1)
      : text.slice(start, lastClose + 1) + openAtLastClose.reverse().join("");
  try {
    return JSON.parse(body) as T;
  } catch {
    return JSON.parse(body.replace(/,(\s*[}\]])/g, "$1")) as T;
  }
}
