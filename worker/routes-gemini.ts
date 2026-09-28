// 제미니(AI) 호출 라우트. 순수 계산 모듈(place-hint-header · ai-opinion-prompt · google-places-sku)은 엔진 것을 그대로 import 한다(§16 재발명 금지).
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
import { guideContext, itineraryContext } from "../shared/r2-paths";
import { recordExternalCall } from "./call-log";
import { buildPlaceHintHeader } from "./lib/services/shared/place-hint-header";
import {
  generateAiOpinionPrompt,
  type AiOpinionInput,
} from "./lib/services/verify/ai-opinion-prompt";
import {
  STANDARD_TS_FIELD_MASK,
  validateFieldMask,
} from "./lib/services/shared/google-places-sku";
import { getFirstAdmin, getUserIdFromReq } from "./auth-user";
import { computeItineraryFingerprint } from "./itinerary-fingerprint";
import { chargeOnSuccess, precheckFeature } from "../shared/credits";
import { readGeminiKey, readMapsKey } from "./keys";

type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };

const { cities, guides, placeSeedRaw } = schema;

interface GeminiCallRecord {
  responseTimeMs: number;
  success: boolean;
  errorMessage?: string;
  /** 실패 호출은 geminiClient.ts 도 raw 를 저장하지 않는다 = undefined. */
  raw?: { request: unknown; raw: unknown };
}

// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 해설 raw = 도시 번호(없으면 user-{번호}), AI 의견 raw = 여정의 도시 번호(없으면 itinerary-{번호}) (정본 K3)
async function recordGeminiCall(
  openDb: OpenDb,
  p: GeminiCallRecord & { sku: string; tag: string; ctx: string | null },
): Promise<void> {
  try {
    if (p.raw) {
      await saveRawToR2(env.RAW_BUCKET, {
        source: "gemini",
        contextId: p.ctx,
        tag: p.tag,
        request: p.raw.request,
        raw: p.raw.raw,
      });
    }
    const { db, close } = openDb();
    try {
      // geminiClient.ts 와 같은 기록 = provider "gemini" / sku = 모델 / tag = rawTag / 소요시간 / 성공여부.
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

// ── 제미니 호출 ─

// geminiClient.ts 와 같은 값.
const MODEL_ID = "gemini-3-flash-preview";
const AI_OPINION_TEMPERATURE = 0.2;
const AI_OPINION_MAX_OUTPUT_TOKENS = 50000;

/** withQuotaRetry 와 같은 지연표·판정 = sleep 이 Worker 에서 CPU 를 쓰지 않는 setTimeout 이어야 해서 여기 둔다. */
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

/** 사진 해설 스트림. §18 = 실패(시작/도중)는 기록(success:false)만·raw 저장 없음·그대로 throw / 성공은 기록(success:true) 후 raw = { parsed: null, text: fullText, finishReason }(이미지는 용량상 제외) · request = { prompt, systemInstruction, model, hasImage }.
 *  기록은 `record` 콜백으로 밖에 넘긴다 = 이 제너레이터는 DB·R2 를 직접 만지지 않는다(스트리밍 라우트가 응답을 끝낸 뒤 기록한다). */
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

  // 시작시각 · 조립버퍼 · finishReason 기본값.
  const startedAt = Date.now();
  let fullText = "";
  let finishReason = "stream-end";
  try {
    // config = geminiClient.ts 와 같은 값 1벌.
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

    // 청크마다 finishReason 을 갱신하고 텍스트를 누적하며 흘려보낸다.
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

/** JSON 응답 1회 호출(googleSearch 포함). §18 = 실패는 기록(success:false)만·raw 저장 없음·그대로 throw / 성공은 **파싱을 끝낸 뒤** raw 저장(parsed 포함) → 기록(success:true), tag = 호출부가 준 rawTag("ai-opinion").
 *  기록은 `record` 콜백으로 밖에 넘긴다 = 라우트가 외부호출이 끝난 뒤(연결을 새로 연 시점)에 부른다. */
async function geminiJson<T>(
  apiKey: string,
  prompt: string,
  record: (p: GeminiCallRecord) => void,
): Promise<{ data: T | null; finishReason: string; parseError?: string }> {
  const ai = new GoogleGenAI({ apiKey });

  // 시작시각. 실패해도 기록 후 그대로 throw(기존 에러 처리 불변).
  const startedAt = Date.now();
  let response;
  try {
    // googleSearch 켜면 responseMimeType 을 뺀다(Gemini API 제약).
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

  // geminiClient.ts 와 같은 추출식(첫 { 부터 마지막 } 까지).
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
      // prompt 원본 통째 + model + googleSearch 여부(§18 = 사장님 byte 검수).
      request: { prompt, model: MODEL_ID, googleSearch: true },
      // parsed(객체)도 같이 저장해야 pretty 들여쓰기로 눈 검수가 된다.
      raw: { parsed: data ?? null, text: raw, finishReason },
    },
  });

  return { data, finishReason, parseError };
}

// ── 라우트 ─────────────────────────────────────────────────────────────────

export function registerGeminiRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-09-06 = `res.setHeader("Transfer-Encoding","chunked")` 를 넣지 않는다 = 워커 런타임이 청크를 알아서 나눠 보낸다(hop-by-hop 헤더는 런타임이 관리).
  //    근거 = workerd 소스 직접 확인(github.com/cloudflare/workerd, src/node 의 http 서버 구현) = 헤더 전송 뒤 res.write() 는 곧장 스트림으로 들어가 점진 전달된다.
  //    응답은 ReadableStream 으로 나간다 = 128MB 버퍼링 없음.
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
        cityId?: unknown;
      };
      const { base64Image, prompt, systemInstruction } = body;
      const isPromptEmpty = !prompt || String(prompt).trim() === "";
      if (isPromptEmpty && !base64Image) {
        return res.status(400).json({
          error:
            "요청 본문에 필수 데이터(prompt 또는 base64Image)가 누락되었습니다.",
        });
      }

      // 🔒 해설 새로 만들기 = 로그인 필수.
      const requesterId = getUserIdFromReq(req);
      if (!requesterId) return res.status(401).json({ error: "로그인 필요" });

      // ⚠️ 차감은 완성 시점에만. 여기서는 잔액만 본다.
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

      // ⚠️ 기록 시점 = **응답을 다 흘려보낸 뒤** waitUntil 로 넘긴다 = 기록은 응답을 늦출 일이 아니고, 그냥 던져두면 R2 PUT·DB INSERT 가 중간에 끊길 수 있다.
      //   제너레이터가 준 기록거리를 여기 담아 두고 스트림이 끝난 뒤 한 번에 넘긴다
      //   (제너레이터 안에서 곧장 넘기면 마지막 청크가 나가기도 전에 DB 연결을 하나 더 열게 된다).
      const pending: GeminiCallRecord[] = [];

      let produced = 0; // 실제로 내보낸 글자 수 = 완성 판정 근거
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
              tag: "guide-gemini",
              ctx: guideContext(body.cityId, requesterId),
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

  // ② AI 의견 = POST /api/itineraries/ai-opinion (5크레딧).
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

        // 언어가 다르면 캐시도 다시 만들어야 하므로 fp 에 언어를 포함한다.
        const fp = `${computeItineraryFingerprint(itinerary)}:${language || "ko"}`;

        let existingRawData: Record<string, unknown> | null = null;
        let aiContext: string | null = null;
        const idNum = itineraryId ? parseInt(String(itineraryId)) : NaN;
        if (!Number.isNaN(idNum)) {
          const [row] = await db
            .select()
            .from(schema.itineraries)
            .where(eq(schema.itineraries.id, idNum))
            .limit(1);
          existingRawData = (row?.rawData as Record<string, unknown>) ?? null;
          aiContext = itineraryContext(row?.cityId, idNum);
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

        // Gemini 로 넘길 입력 조립. 필드·순서 그대로.
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
          // 앱 현재 언어로 Gemini 가 직접 작문(번역기 아님).
          language: language || "ko",
        } as AiOpinionInput;

        // ⚠️ 차감은 완성 시점에만. 여기서는 잔액만 본다.
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

        // 프롬프트 조립(§16).
        const prompt = generateAiOpinionPrompt(opinionInput);

        // ⚠️ 외부호출 대기 중 DB 연결을 쥐지 않는다(Hyperdrive 연결 고갈 방지).
        closeOnce();

        // ⚠️ 기록 = 호출 직후 waitUntil 로 넘긴다(응답을 늦추지 않고, 파싱 실패 502 도 기록이 남게. 던져두면 R2 PUT·DB INSERT 가 끊길 수 있다).
        //   recordGeminiCall 이 DB 연결을 스스로 열고 닫는다 = 외부호출 대기 중에는 연결이 없다.
        const t0 = Date.now();
        const result = await geminiJson<AiOpinionResponse>(
          apiKey,
          prompt,
          (p) => {
            waitUntil(
              recordGeminiCall(openDb, {
                sku: MODEL_ID,
                tag: "ai-opinion",
                ctx: aiContext,
                ...p,
              }),
            );
          },
        );
        const elapsedMs = Date.now() - t0;

        // 파싱 실패 시 502.
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

          // 결과를 rawData.verification 에 굳힌다.
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

  // ③ GET /api/guide/landmark.
  //   이 호출이 준 좌표도 같이 돌려준다.
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

      // ⚠️ 외부호출 대기 중 DB 연결을 쥐지 않는다(Hyperdrive 연결 고갈 방지).
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

  // ④ GET /api/guide/place-image.
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
          // price_eur = numeric 컬럼이라 postgres 드라이버가 문자열로 준다 = 머리글이 `€${priceEur}` 로 찍으므로 숫자로 되돌린다.
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

  // ⑤ GET /api/guide/place-guide = 해설 창고 찾기(장소 + 언어).
  //   외부호출 0건이지만 **차감(guide_explain 5)** 이 있어 이 파일에 함께 둔다.
  app.get("/api/guide/place-guide", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const placeId = Number(req.query.placeId);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return res.status(400).json({ error: "placeId(정수) 필요" });
      }
      const lang = String(req.query.lang || "ko");

      // 🔒 창고 주인(가장 먼저 만들어진 관리자 = getFirstAdmin) 의 해설을 정본으로 먼저 본다.
      const warehouseOwner = (await getFirstAdmin(db))?.id || null;

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

      // 🔖 한 사용자 = 한 장소 = 해설 1행 + 면제 기준 1벌.
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
      // 순서 = 잔액 확인(precheckFeature) → 즉시 차감(chargeOnSuccess). 먼저 확인해
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

interface TsPlaceLite {
  nameEn: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** /api/guide/landmark 가 쓰는 TS searchNearby 경로 1벌(같은 요청·같은 FieldMask).
 *  FieldMask = STANDARD_TS_FIELD_MASK 를 그대로 import · validateFieldMask 호출 = §15 Atmosphere 금지 보장. */
async function tsSearchNearby(
  apiKey: string,
  latitude: number,
  longitude: number,
): Promise<TsPlaceLite[]> {
  validateFieldMask(STANDARD_TS_FIELD_MASK); // §15 = Atmosphere 필드 감지 시 throw

  // 요청 본문
  // (circleRadiusM:100 → locationRestriction 원, maxResults:5, includedTypes 7종).
  // rankPreference:"POPULARITY" = ts-client.ts 와 같다.
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
  // ts-client.ts mapPlace 중 이 라우트가 읽는 3개 필드만.
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
