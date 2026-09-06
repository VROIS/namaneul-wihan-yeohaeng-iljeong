// 제미니(AI) 호출 라우트 = Worker 이관본 (2026-09-06)
// 원본 = server/guide-routes.ts(4벌) · server/itinerary-routes.ts:218(ai-opinion 1벌).
// 응답 모양·상태코드·에러문구는 원본과 같게 유지한다.
//
// 순수 계산 모듈은 원본을 그대로 import 한다(§16 재발명 금지) = 아래 3벌.
//   - place-hint-header.ts   (import 0건 = 순수)
//   - ai-opinion-prompt.ts   (→ language-instruction.ts, 둘 다 순수)
//   - google-places-sku.ts   (import 0건 = 순수, FieldMask 1벌 §15)
// 반대로 아래 3벌은 Worker 번들이 불가해 이 파일에 같은 동작을 다시 배선했다.
//   - geminiClient.ts     → save-raw(node:fs 쓰기) + external-call-log(server/db.ts pg pool)
//   - ts-client.ts        → 위와 같은 두 모듈
//   - credit-charge.ts    → creditService → server/db.ts
// 위 두 모듈이 하던 §18 raw 저장 · 유료호출 기록은 Worker 판 1벌로 대체 배선했다
// (raw-store.ts = R2 네이티브 바인딩 / call-log.ts = drizzle externalCalls).
import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
// ⚠️ 수정금지(승인필요) 2026-09-06 = 반드시 "@google/genai/web" (기본 진입점 금지).
// 근거(직접 실측, esbuild 번들 산출물 grep):
//   package.json exports "." 의 "node" 조건 = dist/node/index.mjs
//     → platform=node 로 번들 시 node:fs · node:net · node:http · node:https · node:zlib ·
//       node:stream 등 **11개** builtin 을 끌어온다. nodejs_compat 은 node:net/node:fs 의
//       실제 소켓·파일시스템을 주지 않으므로 런타임에서 깨진다.
//   exports "./web" = dist/web/index.mjs → **node: builtin 0개**(platform 무관).
//   (dist/web/index.mjs 안의 유일한 "node:" 문자열은 에러 메시지 본문 = import 아님.)
import { GoogleGenAI } from "@google/genai/web";
// 바인딩(R2) 접근 = src.ts:41 과 같은 공식 방식. 타입은 `wrangler types` 산출물(worker-configuration.d.ts:5 RAW_BUCKET: R2Bucket).
// waitUntil = 같은 모듈에서 직접 import 하는 형태(ctx 불필요). 공식 changelog 2025-08-08
// "Directly import `waitUntil` in Workers" = "extend execution ... without requiring the request context".
// httpServerHandler(Express) 경로에는 ctx 가 없으므로 이 형태가 유일한 배선이다.
import { env, waitUntil } from "cloudflare:workers";
import * as schema from "../shared/schema";
import { saveRawToR2 } from "./raw-store";
import { recordExternalCall } from "./call-log";
import { buildPlaceHintHeader } from "../server/services/shared/place-hint-header";
import {
  generateAiOpinionPrompt,
  type AiOpinionInput,
} from "../server/services/verify/ai-opinion-prompt";
import {
  STANDARD_TS_FIELD_MASK,
  validateFieldMask,
} from "../server/services/shared/google-places-sku";

type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };

const { apiKeys, cities, creditTransactions, guides, placeSeedRaw, users } =
  schema;

// ── 신원 · 열쇠 ─────────────────────────────────────────────────────────────

// 원본 server/auth-user.ts:8 getUserIdFromReq = 헤더 정규식만(DB 무관).
// 그 파일을 import 하면 server/db.ts 가 딸려와 번들이 안 되므로 다른 라우트 파일과 같은 1벌을 둔다.
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

/**
 * 제미니 열쇠를 DB api_keys 에서 직접 읽는다.
 * 배선 방식 = routes-expert-bts.ts:874 의 /api/bts/map-config 와 같은 형태
 * (그 라우트가 GOOGLE_MAPS_API_KEY 를 같은 방식으로 읽는다).
 * 별칭 = keys.ts:31 applyKey 가 GEMINI_API_KEY → AI_INTEGRATIONS_GEMINI_API_KEY 를 채우므로
 * 원본 geminiClient.ts:19-22 와 같은 우선순위(별칭 먼저)로 읽는다.
 */
async function readGeminiKey(db: Db): Promise<string> {
  const cached =
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (cached) return cached;
  const [row] = await db
    .select({ v: apiKeys.keyValue })
    .from(apiKeys)
    .where(eq(apiKeys.keyName, "GEMINI_API_KEY"));
  const v = row?.v?.trim();
  if (!v) return "";
  process.env.GEMINI_API_KEY = v;
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY = v; // keys.ts:31 과 같은 별칭
  return v;
}

/** 원본 keys.ts:35 = GOOGLE_MAPS_API_KEY → Google_maps_api_key 별칭. */
async function readMapsKey(db: Db): Promise<string> {
  const cached =
    process.env.GOOGLE_MAPS_API_KEY || process.env.Google_maps_api_key;
  if (cached) return cached;
  const [row] = await db
    .select({ v: apiKeys.keyValue })
    .from(apiKeys)
    .where(eq(apiKeys.keyName, "GOOGLE_MAPS_API_KEY"));
  const v = row?.v?.trim();
  if (!v) return "";
  process.env.GOOGLE_MAPS_API_KEY = v;
  process.env.Google_maps_api_key = v;
  return v;
}

// ── 크레딧 (§9 = 단가표 1벌, 원본 server/credit-charge.ts:6) ────────────────

const CREDIT_COSTS = { ai_opinion: 5, guide_explain: 5 } as const;
type Feature = keyof typeof CREDIT_COSTS;
// 원본 server/credit-charge.ts:16 CREDIT_LABELS 와 같은 문구(장부에 그대로 남는다).
const CREDIT_LABELS: Record<Feature, string> = {
  ai_opinion: "AI 의견",
  guide_explain: "Tripis 해설",
};

/**
 * 원본 server/credit-charge.ts:83 precheckFeature = 잔액 사전확인(차감 0).
 * 비로그인·관리자 = 면제(§9). 잔액부족 = 402 + 원본과 같은 본문.
 *
 * ⚠️ 스트리밍 라우트는 이 함수를 **첫 res.write() 전에** 끝내야 한다(§9 금지 4번 =
 * 응답 헤더를 내보낸 뒤에는 402 를 보낼 수 없다).
 */
async function precheckFeature(
  db: Db,
  res: Response,
  userId: string | null,
  feature: Feature,
): Promise<boolean> {
  if (!userId) return true;
  const amount = CREDIT_COSTS[feature];
  const [user] = await db
    .select({ role: users.role, credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role === "admin") return true;
  const balance = user.credits ?? 0;
  if (balance < amount) {
    res.status(402).json({
      error: "insufficient_credits",
      message: `크레딧이 부족합니다. (필요: ${amount}, 잔액: ${balance})`,
      balance,
      required: amount,
    });
    return false;
  }
  return true;
}

/**
 * 원본 server/credit-charge.ts:62 chargeOnSuccess → chargeFeature → creditService.useCredits.
 * 장부 줄 + 잔액을 한 트랜잭션으로(원본 creditService.addCredits). 실패해도 완성물은 보존한다.
 * (routes-expert-bts.ts:99 chargeExpertVerifyOnSuccess 와 같은 형태.)
 */
async function chargeOnSuccess(
  db: Db,
  userId: string | null,
  feature: Feature,
  referenceId?: string,
): Promise<void> {
  if (!userId) return;
  const amount = CREDIT_COSTS[feature];
  const label = CREDIT_LABELS[feature];
  try {
    const [user] = await db
      .select({ role: users.role, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.role === "admin") return;
    if ((user.credits ?? 0) < amount) {
      console.error(
        `[credits] ${label} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
      return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(creditTransactions).values({
        userId,
        type: "usage",
        amount: -amount,
        description: label,
        referenceId,
      });
      await tx
        .update(users)
        .set({
          credits: sql`COALESCE(${users.credits}, 0) + ${-amount}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  } catch (e) {
    console.error(
      `[credits] ${label} 차감 예외(완성물은 그대로 보존):`,
      (e as Error)?.message,
    );
  }
}

// ── §18 raw 저장 + 유료호출 기록 (원본 geminiClient.ts 가 부르던 두 관문) ────

/** 제미니 호출 1건이 남기는 기록거리. 호출부(라우트)가 sku·tag 를 얹어 recordGeminiCall 로 넘긴다. */
interface GeminiCallRecord {
  responseTimeMs: number;
  success: boolean;
  errorMessage?: string;
  /** 실패 호출은 원본(geminiClient.ts:87-97)도 raw 를 저장하지 않는다 = undefined. */
  raw?: { request: unknown; raw: unknown };
}

/**
 * 원본 geminiClient.ts 는 saveRaw(:113) 와 recordExternalCall(:88·:126) 을 각각 부른다.
 * Worker 판은 그 둘을 이 함수 1벌로 묶는다. 묶는 이유 = recordExternalCall 이 DB 연결을
 * 필요로 하는데, Hyperdrive gotchas.md "Failed to acquire a connection (Pool exhausted) …
 * don't hold connections during external calls" 때문에 **제미니 호출이 끝난 뒤** 연결을
 * 새로 열어야 하기 때문이다. 연결을 여는 지점이 한 곳이면 여닫기도 한 곳이다.
 *
 * 기록 실패는 절대 본 기능을 막지 않는다(§18 raw 저장은 best-effort).
 * = raw-store.ts:159 최상위 catch + call-log.ts:37 catch 와 같은 성질을 이 함수에서도 지킨다.
 */
async function recordGeminiCall(
  openDb: OpenDb,
  p: GeminiCallRecord & { sku: string; tag: string },
): Promise<void> {
  try {
    // 원본 geminiClient.ts:113 saveRaw = source "gemini" / contextId 는 호출부가 준 값
    // (guide-routes.ts:78 · ai-opinion-handler.ts:51 둘 다 "runtime") / tag = rawTag.
    if (p.raw) {
      await saveRawToR2(env.RAW_BUCKET, {
        source: "gemini",
        contextId: "runtime",
        tag: p.tag,
        request: p.raw.request,
        raw: p.raw.raw,
      });
    }
    const { db, close } = openDb();
    try {
      // 원본 geminiClient.ts:126-132 = provider "gemini" / sku = 모델 / tag = rawTag / 소요시간 / 성공여부.
      await recordExternalCall(db, {
        provider: "gemini",
        sku: p.sku,
        tag: p.tag,
        responseTimeMs: p.responseTimeMs,
        success: p.success,
        errorMessage: p.errorMessage,
      });
    } finally {
      close();
    }
  } catch (e) {
    console.error(
      "[gemini-record] 기록 실패(호출은 정상):",
      (e as Error)?.message,
    );
  }
}

// ── 제미니 호출 (원본 server/services/shared/geminiClient.ts 의 동작 재배선) ─

// 원본 geminiClient.ts:9-11 과 같은 값.
const MODEL_ID = "gemini-3-flash-preview";
const AI_OPINION_TEMPERATURE = 0.2;
const AI_OPINION_MAX_OUTPUT_TOKENS = 50000;

/**
 * 원본 server/services/shared/retry-429.ts:4 withQuotaRetry 와 같은 식(그 파일은 순수하지만
 * 1벌뿐이라 import 해도 되나, 아래 sleep 이 Worker 에서 CPU 시간을 쓰지 않는 setTimeout 이어야 해
 * 같은 지연표·같은 판정으로 여기 둔다).
 */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

async function withQuotaRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const msg = String(err?.message || "");
      const is429 =
        err?.status === 429 ||
        msg.includes('"code":429') ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (!is429 || attempt >= RETRY_DELAYS_MS.length) throw e;
      console.warn(
        `[retry-429] ${label} 한도 = ${RETRY_DELAYS_MS[attempt] / 1000}초 대기 후 재시도(${attempt + 1}/${RETRY_DELAYS_MS.length})`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * 원본 geminiClient.ts:147 geminiVisionStream 과 같은 config·같은 parts 조립.
 * §18 raw 저장 + 유료호출 기록도 원본과 같은 시점·같은 인자로 한다.
 *   · 실패(스트림 시작/도중) = 원본 :193-203 = 기록(success:false)만 하고 raw 는 저장하지 않는다, 그대로 throw.
 *   · 성공 = 원본 :205-224 = 기록(success:true) 후 조립된 전체 텍스트를 raw 로 저장.
 *     raw 모양 = { parsed: null, text: fullText, finishReason } (원본 :223 그대로, 이미지는 용량상 제외).
 *     request = { prompt, systemInstruction, model, hasImage } (원본 :217-222 그대로).
 *
 * 기록은 `record` 콜백으로 밖에 넘긴다 = 이 제너레이터가 DB·R2 를 직접 만지지 않는다.
 * 스트리밍 라우트가 res.end() 뒤에 기록해야 하기 때문(아래 라우트 주석 참조).
 */
async function* geminiVisionStream(
  apiKey: string,
  base64Image: string | null,
  prompt: string,
  systemInstruction: string | undefined,
  record: (p: GeminiCallRecord) => void,
): AsyncGenerator<string> {
  const parts: GeminiPart[] = [];
  if (base64Image) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
  }
  if (prompt && prompt.trim() !== "") {
    parts.push({ text: prompt });
  }

  const ai = new GoogleGenAI({ apiKey });

  // 원본 :170-172 = 시작시각 · 조립버퍼 · finishReason 기본값.
  const startedAt = Date.now();
  let fullText = "";
  let finishReason = "stream-end";
  try {
    // config = 원본 geminiClient.ts:160-167 와 같은 값 1벌.
    const responseStream = await withQuotaRetry(
      () =>
        ai.models.generateContentStream({
          model: MODEL_ID,
          contents: { parts },
          config: {
            systemInstruction,
            thinkingConfig: { thinkingBudget: 0 },
            temperature: 0.5,
            maxOutputTokens: 800,
            topP: 0.8,
            topK: 20,
          },
        }),
      "gemini-vision:guide-gemini",
    );

    // 원본 :184-192 = 청크마다 finishReason 을 갱신하고 텍스트를 누적하며 흘려보낸다.
    for await (const chunk of responseStream) {
      const fr = chunk.candidates?.[0]?.finishReason;
      if (fr) finishReason = fr;
      const text = chunk.text;
      if (text) {
        fullText += text;
        yield text;
      }
    }
  } catch (err) {
    record({
      responseTimeMs: Date.now() - startedAt,
      success: false,
      errorMessage: (err as Error)?.message || String(err),
    });
    throw err;
  }

  record({
    responseTimeMs: Date.now() - startedAt,
    success: true,
    raw: {
      request: {
        prompt,
        systemInstruction: systemInstruction || null,
        model: MODEL_ID,
        hasImage: !!base64Image,
      },
      raw: { parsed: null, text: fullText, finishReason },
    },
  });
}

/**
 * 원본 geminiClient.ts:52 geminiJson = JSON 응답 1회 호출(googleSearch 포함).
 * §18 raw 저장 + 유료호출 기록도 원본과 같은 시점·같은 인자로 한다.
 *   · 실패 = 원본 :87-97 = 기록(success:false)만, raw 저장 없음, 그대로 throw.
 *   · 성공 = 원본 :113-132 = **파싱을 끝낸 뒤** raw 저장(parsed 포함) → 기록(success:true).
 *     tag = 원본 :116 `rawTag || (googleSearch ? "grounded" : "json")` 에서 호출부가 준 rawTag
 *     (= ai-opinion-handler.ts:50 "ai-opinion") 가 이기므로 "ai-opinion".
 *
 * 기록은 `record` 콜백으로 밖에 넘긴다 = 라우트가 외부호출이 끝난 뒤(연결을 새로 연 시점)에 부른다
 * (Hyperdrive gotchas.md "don't hold connections during external calls").
 */
async function geminiJson<T>(
  apiKey: string,
  prompt: string,
  record: (p: GeminiCallRecord) => void,
): Promise<{ data: T | null; finishReason: string; parseError?: string }> {
  const ai = new GoogleGenAI({ apiKey });

  // 원본 :69 = 시작시각. 실패해도 기록 후 그대로 throw(기존 에러 처리 불변).
  const startedAt = Date.now();
  let response;
  try {
    // 원본 geminiClient.ts:56-66 = googleSearch 켜면 responseMimeType 을 뺀다(Gemini API 제약).
    response = await withQuotaRetry(
      () =>
        ai.models.generateContent({
          model: MODEL_ID,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature: AI_OPINION_TEMPERATURE,
            maxOutputTokens: AI_OPINION_MAX_OUTPUT_TOKENS,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ googleSearch: {} }],
          },
        }),
      "gemini-json:ai-opinion",
    );
  } catch (err) {
    record({
      responseTimeMs: Date.now() - startedAt,
      success: false,
      errorMessage: (err as Error)?.message || String(err),
    });
    throw err;
  }

  const raw = response.text || "";
  const finishReason = response.candidates?.[0]?.finishReason || "unknown";

  // 원본 geminiClient.ts:105-111 과 같은 추출식(첫 { 부터 마지막 } 까지).
  let data: T | null = null;
  let parseError: string | undefined;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) data = JSON.parse(m[0]) as T;
    else parseError = "no JSON object found in response";
  } catch (e) {
    parseError = (e as Error).message || String(e);
  }

  record({
    responseTimeMs: Date.now() - startedAt,
    success: true,
    raw: {
      // 원본 :117-121 = prompt 원본 통째 + model + googleSearch 여부(§18 = 사장님 byte 검수).
      request: { prompt, model: MODEL_ID, googleSearch: true },
      // 원본 :123 = parsed(객체)도 같이 저장해야 pretty 들여쓰기로 눈 검수가 된다.
      raw: { parsed: data ?? null, text: raw, finishReason },
    },
  });

  return { data, finishReason, parseError };
}

// ── 라우트 ─────────────────────────────────────────────────────────────────

export function registerGeminiRoutes(app: Express, openDb: OpenDb): void {
  // ① 사진 해설 = 원본 server/guide-routes.ts:49 POST /api/gemini.
  //
  // ⚠️ 수정금지(승인필요) 2026-09-06 = 원본 :69 의 `res.setHeader("Transfer-Encoding","chunked")`
  //    **1줄을 삭제**한 것이 원본과의 유일한 차이다. 그 밖의 동작은 같다.
  //    근거(workerd 소스 직접 확인, github.com/cloudflare/workerd/blob/main/src/node/):
  //      · internal_http_server.ts:464-467 = 헤더 전송 뒤의 res.write() 는 살아있는
  //        ReadableStreamController.enqueue() 로 곧장 들어간다 = **점진 전달 확정**
  //        (헤더 전 데이터만 chunks[] 에 잠깐 담겼다가 :492-499 에서 한 번에 흘려보냄).
  //      · internal_http_outgoing.ts:866-871 주석 = "Chunked transfer encoding doesn't need to
  //        use the low-level protocol (with each chunk preceded by its length)" = 런타임이 알아서
  //        프레이밍한다 = 이 헤더를 손으로 넣을 이유가 없다.
  //      · 넣으면 :1224 에서 chunkedEncoding=true 가 켜지고, 그 헤더가 :777 의 Headers 로 들어가
  //        internal_http_server.ts:542 `new Response(body, { headers })` 까지 그대로 실려간다.
  //        Transfer-Encoding 은 hop-by-hop 헤더라 런타임이 직접 관리하는 값이다 = 손대지 않는다.
  //    = 응답은 ReadableStream 으로 나가므로 스킬 rules.md:97 "Stream request and response
  //      bodies"(128MB 버퍼링 금지)도 그대로 지켜진다.
  app.post("/api/gemini", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    let closed = false;
    const closeOnce = () => {
      if (!closed) {
        closed = true;
        close();
      }
    };
    try {
      const body = (req.body || {}) as {
        base64Image?: string;
        prompt?: string;
        systemInstruction?: string;
      };
      const { base64Image, prompt, systemInstruction } = body;
      const isPromptEmpty = !prompt || String(prompt).trim() === "";
      if (isPromptEmpty && !base64Image) {
        return res.status(400).json({
          error:
            "요청 본문에 필수 데이터(prompt 또는 base64Image)가 누락되었습니다.",
        });
      }

      // 🔒 원본 :62 = 해설 새로 만들기 = 로그인 필수.
      const requesterId = getUserIdFromReq(req);
      if (!requesterId) return res.status(401).json({ error: "로그인 필요" });

      // ⚠️ 원본 :65 = 차감은 완성 시점에만. 여기서는 잔액만 본다.
      //    § 9 금지 4번 = 첫 write 전에 끝내야 402 를 보낼 수 있다.
      if (!(await precheckFeature(db, res, requesterId, "guide_explain")))
        return;

      const apiKey = await readGeminiKey(db);
      if (!apiKey) {
        return res.status(503).json({ error: "해설 생성 실패" });
      }

      // ⚠️ Hyperdrive gotchas.md:15 "Failed to acquire a connection (Pool exhausted) …
      //    don't hold connections during external calls" = 제미니 응답을 기다리는 동안
      //    DB 연결을 쥐고 있으면 안 된다. 그래서 여기서 먼저 닫고, 차감할 때 새로 연다.
      closeOnce();

      res.setHeader("Content-Type", "text/plain; charset=utf-8");

      // ⚠️ 기록 시점 = **응답을 다 흘려보낸 뒤**.
      //   근거 ① rules.md:146 "ctx.waitUntil() performs background work (analytics, cache writes)
      //          after the response is sent. Keeps response fast." = 기록은 응답을 늦출 일이 아니다.
      //        ② rules.md:335 "A Promise that is not awaited, returned, or passed to ctx.waitUntil()
      //          is a floating promise … The runtime may terminate the isolate before it completes."
      //          = 그냥 던져두면 R2 PUT·DB INSERT 가 중간에 끊길 수 있다 = waitUntil 로 넘겨 붙든다.
      //   제너레이터가 준 기록거리를 여기 담아 두고, 스트림이 끝난 뒤 한 번에 넘긴다
      //   (제너레이터 안에서 곧장 넘기면 마지막 청크가 나가기도 전에 DB 연결을 하나 더 열게 된다).
      const pending: GeminiCallRecord[] = [];

      let produced = 0; // 실제로 내보낸 글자 수 = 완성 판정 근거(원본 :71)
      try {
        for await (const text of geminiVisionStream(
          apiKey,
          base64Image || null,
          prompt || "",
          systemInstruction || undefined,
          (p) => pending.push(p),
        )) {
          res.write(text);
          produced += text.length;
        }
      } finally {
        // 성공이든 실패든 제너레이터가 남긴 기록은 반드시 넘긴다(실패 기록도 §18 자산).
        for (const p of pending.splice(0)) {
          waitUntil(
            recordGeminiCall(openDb, {
              sku: MODEL_ID,
              tag: "guide-gemini", // 원본 guide-routes.ts:80 rawTag 그대로
              ...p,
            }),
          );
        }
      }
      res.end();

      if (produced) {
        const charge = openDb();
        try {
          await chargeOnSuccess(charge.db, requesterId, "guide_explain");
        } finally {
          charge.close();
        }
      }
    } catch (e) {
      console.error("[guide/gemini]", (e as Error)?.message || e);
      if (!res.headersSent) {
        res.status(500).json({ error: "해설 생성 실패" });
      } else {
        res.end();
      }
    } finally {
      closeOnce();
    }
  });

  // ② AI 의견 = 원본 server/itinerary-routes.ts:218 POST /api/itineraries/ai-opinion (5크레딧).
  app.post(
    "/api/itineraries/ai-opinion",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      let closed = false;
      const closeOnce = () => {
        if (!closed) {
          closed = true;
          close();
        }
      };
      try {
        const body = (req.body || {}) as {
          itineraryId?: string | number;
          itinerary?: ItineraryShape;
          language?: string;
        };
        const { itineraryId, itinerary, language } = body;
        if (!itinerary || !Array.isArray(itinerary.days)) {
          return res.status(400).json({ error: "itinerary(days[]) required" });
        }

        // 원본 :226 = 언어가 다르면 캐시도 다시 만들어야 하므로 fp 에 언어를 포함한다.
        const fp = `${await computeItineraryFingerprint(itinerary)}:${language || "ko"}`;

        // 원본 :232-241 = 캐시 확인(storage.getItinerary = itineraries 단일행).
        let existingRawData: Record<string, unknown> | null = null;
        const idNum = itineraryId ? parseInt(String(itineraryId)) : NaN;
        if (!Number.isNaN(idNum)) {
          const [row] = await db
            .select({ rawData: schema.itineraries.rawData })
            .from(schema.itineraries)
            .where(eq(schema.itineraries.id, idNum))
            .limit(1);
          existingRawData = (row?.rawData as Record<string, unknown>) ?? null;
          const cached = existingRawData?.verification as
            | { fp?: string; result?: unknown }
            | undefined;
          if (cached && cached.fp === fp) {
            console.log(
              `[AiOpinion] 캐시 반환: itineraryId=${itineraryId} (Gemini 호출 없음)`,
            );
            return res.json({
              ...(cached.result as Record<string, unknown>),
              cached: true,
            });
          }
        }

        // 원본 :243-270 = Gemini 로 넘길 입력 조립. 필드·순서 그대로.
        const meta = (itinerary.metadata || {}) as Record<string, unknown>;
        const transportCategory =
          meta.transportCategory === "guide" ||
          meta.transportCategory === "transit"
            ? (meta.transportCategory as "guide" | "transit")
            : undefined;
        const opinionInput: AiOpinionInput = {
          destination: itinerary.destination as string,
          startDate: itinerary.startDate as string,
          endDate: itinerary.endDate as string,
          companionType: itinerary.companionType as string,
          companionCount: itinerary.companionCount as number,
          curationFocus: meta.curationFocus as string | undefined,
          vibeWeights: (itinerary.vibeWeights || []).map((v) => ({
            vibe: v.vibe,
            weight: v.weight,
            percentage: v.percentage,
          })),
          travelStyle: itinerary.travelStyle as string,
          mobilityStyle: itinerary.mobilityStyle as string,
          transportCategory,
          days: (itinerary.days || []).map((d) => ({
            day: d.day,
            places: (d.places || []).map((p) => ({
              name: p.name,
              startTime: p.startTime,
              endTime: p.endTime,
              priceEur: p.entranceFee ?? p.mealPrice,
            })),
          })),
          // 원본 :269 = 앱 현재 언어로 Gemini 가 직접 작문(번역기 아님).
          language: language || "ko",
        } as AiOpinionInput;

        // ⚠️ 원본 :273 = 차감은 완성 시점에만. 여기서는 잔액만 본다.
        const opinionPayerId = getUserIdFromReq(req);
        if (!(await precheckFeature(db, res, opinionPayerId, "ai_opinion")))
          return;

        const apiKey = await readGeminiKey(db);
        if (!apiKey) {
          return res.status(502).json({
            error: "AI opinion generation failed",
            details: "Gemini API key missing",
          });
        }

        // 원본 server/services/verify/ai-opinion-handler.ts:42 = 프롬프트 조립(원본 모듈 그대로 §16).
        const prompt = generateAiOpinionPrompt(opinionInput);

        // ⚠️ Hyperdrive gotchas.md:15 = 외부호출 대기 중 DB 연결을 쥐지 않는다.
        closeOnce();

        // ⚠️ 기록 시점 = 호출이 끝난 **직후**, 응답을 만들기 전에 waitUntil 로 넘긴다.
        //   근거 rules.md:146 = 기록은 응답을 늦출 일이 아니다(파싱 실패 502 경로도 기록이 남아야 한다).
        //        rules.md:335 = 던져두면 floating promise = R2 PUT·DB INSERT 가 끊길 수 있으므로 waitUntil.
        //   recordGeminiCall 이 DB 연결을 스스로 열고 닫는다 = 외부호출 대기 중에는 연결이 없다
        //   (Hyperdrive gotchas.md "don't hold connections during external calls").
        const t0 = Date.now();
        const result = await geminiJson<AiOpinionResponse>(
          apiKey,
          prompt,
          (p) => {
            waitUntil(
              recordGeminiCall(openDb, {
                sku: MODEL_ID,
                tag: "ai-opinion", // 원본 ai-opinion-handler.ts:50 rawTag 그대로
                ...p,
              }),
            );
          },
        );
        const elapsedMs = Date.now() - t0;

        // 원본 handler:56-66 + 원본 :279-284 = 파싱 실패 시 502.
        if (!result.data) {
          console.warn(
            `[AiOpinion] ⚠️ Gemini 응답 파싱 실패 (${elapsedMs}ms): ${result.parseError}`,
          );
          return res.status(502).json({
            error: "AI opinion generation failed",
            details: result.parseError,
          });
        }
        console.log(
          `[AiOpinion] ✅ Gemini 응답 (${elapsedMs}ms): verdict=${result.data.feasibility?.verdict}`,
        );

        // 차감 + 캐시 저장 = 외부호출이 끝난 뒤 연결을 새로 연다.
        const after = openDb();
        try {
          await chargeOnSuccess(
            after.db,
            opinionPayerId,
            "ai_opinion",
            itineraryId ? String(itineraryId) : undefined,
          );

          // 원본 :293-306 = 결과를 rawData.verification 에 굳힌다.
          if (!Number.isNaN(idNum) && existingRawData) {
            const rawData = {
              ...existingRawData,
              verification: {
                fp,
                result: result.data,
                generatedAt: new Date().toISOString(),
              },
            };
            await after.db
              .update(schema.itineraries)
              .set({ rawData, updatedAt: new Date() })
              .where(eq(schema.itineraries.id, idNum));
          }
        } finally {
          after.close();
        }

        res.json(result.data);
      } catch (e) {
        console.error("[AiOpinion] 실패:", (e as Error)?.message || e);
        res.status(500).json({ error: "Failed to generate AI opinion" });
      } finally {
        closeOnce();
      }
    },
  );

  // ③ 원본 server/guide-routes.ts:101 GET /api/guide/landmark.
  //   ⚠️ 원본 주석 = 이 호출이 준 좌표도 같이 돌려준다(name 만 돌려주고 버리던 것 폐기 §19).
  app.get("/api/guide/landmark", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    let closed = false;
    const closeOnce = () => {
      if (!closed) {
        closed = true;
        close();
      }
    };
    try {
      const lat = parseFloat(String(req.query.lat));
      const lng = parseFloat(String(req.query.lng));
      if (!isFinite(lat) || !isFinite(lng)) {
        return res.status(400).json({ error: "lat,lng required" });
      }
      const apiKey = await readMapsKey(db);
      if (!apiKey) return res.status(503).json({ error: "maps key missing" });

      // ⚠️ Hyperdrive gotchas.md:15 = 외부호출 대기 중 DB 연결을 쥐지 않는다.
      closeOnce();

      const places = await tsSearchNearby(apiKey, lat, lng);
      const nearest = places[0];
      res.json({
        name: nearest?.nameEn || null,
        lat: nearest?.latitude ?? null,
        lng: nearest?.longitude ?? null,
      });
    } catch (e) {
      console.error("[guide/landmark]", (e as Error)?.message || e);
      res.status(500).json({ error: "landmark 조회 실패" });
    } finally {
      closeOnce();
    }
  });

  // ④ 원본 server/guide-routes.ts:142 GET /api/guide/place-image.
  //   ⚠️ 수정금지(승인필요) = 우리 DB 장소를 TRIPIS 해설 재료로 넘기는 입구. 외부호출 0건.
  app.get("/api/guide/place-image", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const placeId = Number(req.query.placeId);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return res.status(400).json({ error: "placeId(정수) 필요" });
      }
      const lang = String(req.query.lang || "ko"); // 머리글 언어 = 해설 본문 언어와 맞춘다
      const rows = await db
        .select({
          imageUrl: placeSeedRaw.imageUrl,
          nameKo: placeSeedRaw.nameKo,
          nameEn: placeSeedRaw.nameEn,
          nameLocal: placeSeedRaw.nameLocal,
          address: placeSeedRaw.address,
          seedCategory: placeSeedRaw.seedCategory,
          googleReviewCount: placeSeedRaw.googleReviewCount,
          priceEur: placeSeedRaw.priceEur,
          editorialSummary: placeSeedRaw.editorialSummary,
          googlePlaceId: placeSeedRaw.googlePlaceId,
          googleMapsUri: placeSeedRaw.googleMapsUri,
          cityId: placeSeedRaw.cityId,
          latitude: placeSeedRaw.latitude,
          longitude: placeSeedRaw.longitude,
          summaryKo: placeSeedRaw.summaryKo,
          cityName: cities.name,
          country: cities.country,
        })
        .from(placeSeedRaw)
        .leftJoin(cities, eq(placeSeedRaw.cityId, cities.id))
        .where(eq(placeSeedRaw.id, placeId))
        .limit(1);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "그런 장소가 없습니다" });

      if (!row.googlePlaceId && !row.googleMapsUri) {
        return res
          .status(409)
          .json({ error: "검증되지 않은 장소(구글 식별정보 없음)" });
      }

      // ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 장소명 = 영어 우선 통일(landmark 경로와 동일).
      const placeName = row.nameEn || row.nameKo;
      const hintHeader = buildPlaceHintHeader(
        {
          placeName: placeName as string,
          nameLocal: row.nameLocal,
          cityName: row.cityName,
          country: row.country,
          address: row.address,
          category: row.seedCategory,
          reviewCount: row.googleReviewCount,
          // price_eur = numeric 컬럼이라 postgres.js 가 문자열로 준다(원본은 pg 드라이버라 number).
          // 머리글이 `€${priceEur}` 로 찍으므로 숫자로 되돌려 원본과 같은 글자를 낸다.
          priceEur: toNum(row.priceEur),
          summaryKo: row.summaryKo,
          editorialSummary: row.editorialSummary,
        },
        lang,
      );

      res.json({
        imageUrl: row.imageUrl,
        hintHeader, // 페르소나 앞에 붙일 확정 정보 머리글
        placeName,
        seedCategory: row.seedCategory, // 사진 없을 때 화면이 띄울 아이콘 종류
        cityId: row.cityId,
        latitude: row.latitude,
        longitude: row.longitude,
        summaryKo: row.summaryKo,
      });
    } catch (e) {
      const msg = (e as Error)?.message || e;
      console.error("[guide/place-image]", msg);
      res.status(500).json({ error: `장소 조회 실패: ${msg}` });
    } finally {
      close();
    }
  });

  // ⑤ 원본 server/guide-routes.ts:218 GET /api/guide/place-guide = 해설 창고 찾기(장소 + 언어).
  //   외부호출 0건이지만 **차감(guide_explain 5)** 이 있어 이 파일에 함께 둔다.
  app.get("/api/guide/place-guide", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const placeId = Number(req.query.placeId);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return res.status(400).json({ error: "placeId(정수) 필요" });
      }
      const lang = String(req.query.lang || "ko");

      // 🔒 원본 :227 = 창고 주인(관리자 계정, 가장 먼저 만들어진 admin) 의 해설을 정본으로 먼저 본다.
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .orderBy(users.createdAt)
        .limit(1);
      const warehouseOwner = owner?.id || null;

      const rows = await db
        .select({
          id: guides.id,
          userId: guides.userId,
          content: guides.aiGeneratedContent,
          description: guides.description,
          imageUrl: guides.imageUrl,
          locationName: guides.locationName,
          latitude: guides.latitude,
          longitude: guides.longitude,
          cityId: guides.cityId,
          voiceLang: guides.voiceLang,
          seedCategory: placeSeedRaw.seedCategory,
          nameKo: placeSeedRaw.nameKo,
          nameEn: placeSeedRaw.nameEn,
        })
        .from(guides)
        .leftJoin(placeSeedRaw, eq(guides.placeId, placeSeedRaw.id))
        .where(and(eq(guides.placeId, placeId), eq(guides.language, lang)))
        .orderBy(
          warehouseOwner
            ? sql`CASE WHEN ${guides.userId} = ${warehouseOwner} THEN 0 ELSE 1 END`
            : sql`0`,
          desc(guides.createdAt),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return res.status(204).end(); // 창고에 없음 = 화면이 새로 만든다

      // 🔖 원본 :253 = 한 사용자 = 한 장소 = 해설 1행 + 면제 기준 1벌.
      const requester = getUserIdFromReq(req);
      let mine = false;
      if (requester) {
        mine = row.userId === requester;
        if (!mine) {
          const [own] = await db
            .select({ id: guides.id })
            .from(guides)
            .where(
              and(
                eq(guides.placeId, placeId),
                eq(guides.language, lang),
                eq(guides.userId, requester),
              ),
            )
            .limit(1);
          mine = !!own;
        }
      }

      // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 SSOT = 무료/차감은 "출발화면"이 정한다.
      // 원본 :272-277 은 chargeFeature(= 잔액확인 + 즉시차감)를 쓴다. 여기도 같은 순서로
      // 잔액부족이면 402 를 내고 멈춘다(응답 본문 전이므로 §9 금지 4번에 걸리지 않는다).
      const fromCityCard = String(req.query.from || "") === "card";
      const deliverable = (row.content || row.description || "").trim();
      if (deliverable && !mine && requester && !fromCityCard) {
        if (!(await precheckFeature(db, res, requester, "guide_explain")))
          return;
        await chargeOnSuccess(db, requester, "guide_explain");
      }

      res.json({
        mine, // 화면 = 이 값으로 [저장] 중복 차단 상태를 처음부터 켠다
        guideId: row.id,
        content: row.content || row.description || "",
        imageUrl: row.imageUrl,
        // ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = place-image 와 동일하게 영어 우선 통일(§16).
        locationName: row.locationName || row.nameEn || row.nameKo,
        latitude: row.latitude,
        longitude: row.longitude,
        cityId: row.cityId,
        voiceLang: row.voiceLang,
        seedCategory: row.seedCategory,
      });
    } catch (e) {
      const msg = (e as Error)?.message || e;
      console.error("[guide/place-guide]", msg);
      res.status(500).json({ error: `창고 조회 실패: ${msg}` });
    } finally {
      close();
    }
  });
}

// ── 보조 ───────────────────────────────────────────────────────────────────

/** numeric 컬럼(postgres.js = 문자열) → number. 값이 없으면 null. */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface ItineraryPlaceShape {
  name?: string;
  startTime?: string;
  endTime?: string;
  entranceFee?: number;
  mealPrice?: number;
  lat?: unknown;
  lng?: unknown;
}
interface ItineraryDayShape {
  day?: number;
  places?: ItineraryPlaceShape[];
}
interface ItineraryShape {
  destination?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  companionType?: unknown;
  companionCount?: unknown;
  travelStyle?: unknown;
  mobilityStyle?: unknown;
  metadata?: Record<string, unknown>;
  vibeWeights?: { vibe: string; weight: number; percentage: number }[];
  days?: ItineraryDayShape[];
}

/** 원본 server/services/verify/ai-opinion-handler.ts:26 AiOpinionResponse. */
interface AiOpinionResponse {
  feasibility: { verdict: "ok" | "caution" | "risky"; reason: string };
  route_review: { issues: string[]; optimization: string[] };
  price_check: {
    daily: {
      day: number;
      transport_eur: number;
      meals_eur: number;
      entrance_eur: number;
      total_eur: number;
    }[];
    total_est_eur: number;
  };
  cautions: string[];
}

/**
 * 원본 server/itinerary-save.ts:6 computeItineraryFingerprint = AI 의견 캐싱용 여정 지문.
 * 원본은 node:crypto 의 createHash("sha1") 을 동기로 쓴다. Worker 에서도 nodejs_compat 으로
 * 쓸 수 있으나(routes-itinerary.ts:5 가 그렇게 한다), 여기서는 런타임 기본 WebCrypto 를 써서
 * 같은 SHA-1 16진 문자열을 만든다(동일 입력 → 동일 지문 = 원본 캐시와 호환).
 */
async function computeItineraryFingerprint(
  itinerary: ItineraryShape,
): Promise<string> {
  const material = {
    destination: itinerary.destination,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate,
    days: (itinerary.days || []).map((d) => ({
      day: d.day,
      places: (d.places || []).map((p) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        startTime: p.startTime,
      })),
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(material));
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface TsPlaceLite {
  nameEn: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * 원본 server/services/shared/ts-client.ts:113 tsSearch(method:"searchNearby") 중
 * /api/guide/landmark 가 실제로 쓰는 경로만 같은 요청·같은 FieldMask 로 재배선한 것.
 * ts-client.ts 를 그대로 import 하지 못하는 이유 = save-raw(node:fs 쓰기) ·
 * external-call-log(server/db.ts pg pool) 을 정적으로 물고 온다 = Worker 번들 불가.
 *
 * FieldMask 는 원본 상수(STANDARD_TS_FIELD_MASK) 를 그대로 import 해서 쓴다 = §15 Atmosphere 금지
 * 준수가 코드로 보장된다(validateFieldMask 도 원본 1벌을 그대로 호출).
 */
async function tsSearchNearby(
  apiKey: string,
  latitude: number,
  longitude: number,
): Promise<TsPlaceLite[]> {
  validateFieldMask(STANDARD_TS_FIELD_MASK); // §15 = Atmosphere 필드 감지 시 throw

  // 요청 본문 = 원본 guide-routes.ts:110-124 가 tsSearch 에 넘긴 값 그대로
  // (circleRadiusM:100 → locationRestriction 원, maxResults:5, includedTypes 7종).
  // rankPreference:"POPULARITY" = 원본 ts-client.ts:178.
  const resp = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": STANDARD_TS_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: [
          "tourist_attraction",
          "museum",
          "church",
          "park",
          "lodging",
          "restaurant",
          "cafe",
        ],
        maxResultCount: 5,
        rankPreference: "POPULARITY",
        locationRestriction: {
          circle: { center: { latitude, longitude }, radius: 100 },
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  const j = (await resp.json()) as {
    places?: {
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
    }[];
    error?: { message?: string };
  };
  if (!resp.ok) {
    throw new Error(
      `[tsSearch] ${resp.status} ${j?.error?.message || JSON.stringify(j?.error || {})}`,
    );
  }
  // 원본 ts-client.ts:74 mapPlace 중 이 라우트가 읽는 3개 필드만.
  return (j.places || []).map((p) => ({
    nameEn: p.displayName?.text ?? null,
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
  }));
}

// ⚠️ 원본과 다를 수 있는 지점 = §18 raw 는 **R2 1곳**에만 남는다.
//   원본 save-raw.ts 는 로컬 docs/raw + Storage 2곳에 쓰지만, Worker 에는 파일시스템이 없다.
//   재활용·비용보호의 실체는 R2 쪽이고 로컬은 사장님 열람용 사본이므로, 로컬 사본은
//   `raw-storage-recall` 스킬(pull)로 언제든 내려받는다 = 2곳 동형은 그 경로로 유지된다.
