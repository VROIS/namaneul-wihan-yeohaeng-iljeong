// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 판단 AI Clef 단일 진입점 = 클라우드플레어 REST(키 = DB api_keys CLOUDFLARE_AI_TOKEN) · 원본 저장 · 비용 장부 (정본 Clef)
import { recordExternalCall } from "./external-call-log";
import { saveRaw } from "./save-raw";
import { withQuotaRetry } from "./retry-429";

const ACCOUNT_ID = "51bcbc629c76db55d6a9aac934b2195f";

export type ClefModel = "clef" | "clef-flash";

export type ClefQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export interface ClefAnswer {
  type: string;
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  score?: number;
}

export async function clefDecide(
  state: string,
  questions: Record<string, ClefQuestion>,
  opts: {
    model?: ClefModel;
    contextId?: string | number | null;
    rawTag?: string | null;
  } = {},
): Promise<Record<string, ClefAnswer>> {
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  if (!token) throw new Error("[clef] CLOUDFLARE_AI_TOKEN 없음 (DB api_keys)");
  const model = opts.model || "clef";
  const body = { model, state, questions };
  const startedAt = Date.now();
  let json: any;
  try {
    json = await withQuotaRetry(
      async () => {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/cloudflare/${model}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000),
          },
        );
        const j: any = await res.json();
        if (!res.ok || !j?.success) {
          const err: Error & { status?: number } = new Error(
            `[clef] ${res.status}: ${JSON.stringify(j).slice(0, 400)}`,
          );
          err.status = res.status;
          throw err;
        }
        return j;
      },
      { label: `clef:${opts.rawTag || "call"}` },
    );
  } catch (err: any) {
    void recordExternalCall({
      provider: "clef",
      sku: model,
      tag: opts.rawTag ?? null,
      responseTimeMs: Date.now() - startedAt,
      success: false,
      errorMessage: err?.message || String(err),
    });
    throw err;
  }
  await saveRaw({
    source: "clef",
    contextId: opts.contextId,
    tag: opts.rawTag || "decide",
    request: body,
    raw: json.result,
    localSkip: true,
  });
  void recordExternalCall({
    provider: "clef",
    sku: model,
    units: json.result?.usage?.input_tokens ?? 0,
    tag: opts.rawTag ?? null,
    responseTimeMs: Date.now() - startedAt,
    success: true,
  });
  return json.result.answers;
}
