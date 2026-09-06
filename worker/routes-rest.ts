// Cloudflare Worker 이관 = 나머지 미이관분 (2026-09-06)
// 지금 담긴 것 = POST /api/guides/batch 1건. 원본 = server/guide-routes.ts:354.
// (같은 파일의 형제 2건 GET /api/guides · DELETE /api/guides/:id 은 이미
//  worker/routes-guide-video.ts:119 · :145 에 있다 = 중복 배선 금지.)
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql as dsql } from "drizzle-orm";
// 바인딩(R2) 접근 = src.ts:41 · routes-gemini.ts:27 과 같은 공식 방식.
// 타입은 `wrangler types` 산출물(worker-configuration.d.ts:5 RAW_BUCKET: R2Bucket).
import { env } from "cloudflare:workers";
import * as schema from "../shared/schema";

const { cities, guides, users } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

/** 원본 server/auth-user.ts:8 getUserIdFromReq 와 같은 식(정규식 1글자까지 동일). */
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

/** 원본 server/guide-routes.ts:33 warehouseOwnerId = 창고 주인 = 가장 먼저 만들어진 관리자. */
async function warehouseOwnerId(db: Db): Promise<string | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.createdAt)
    .limit(1);
  return u?.id || null;
}

/**
 * 원본 server/city-match.ts:33 nearestCityIdByCoords.
 * 그 파일은 server/db.ts 를 딸고 와 Worker 번들이 안 되므로 같은 쿼리 1벌을 여기 둔다
 * (routes-expert-bts.ts 가 쓰는 방식과 동일). 거리식·정렬·limit 은 원본과 1:1.
 */
async function nearestCityIdByCoords(
  db: Db,
  latitude: unknown,
  longitude: unknown,
): Promise<number | null> {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .orderBy(
      dsql`6371 * acos(LEAST(1, cos(radians(${lat})) * cos(radians(${cities.latitude}))
            * cos(radians(${cities.longitude}) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(${cities.latitude}))))`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** 원본 server/services/shared/r2-client.ts:67 EXT_BY_MIME */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * 원본 server/services/shared/r2-client.ts:74 uploadDataUriToR2 의 Worker 판.
 *
 * 원본은 @aws-sdk/client-s3(S3 REST) 로 올린다. Worker 에서는 네이티브 바인딩을 쓴다
 *   근거 = workers-best-practices/rules.md:172-190 "Use bindings for Cloudflare services, not REST APIs"
 *   근거 = cloudflare/references/r2/api.md:3-20 put(key, value, { httpMetadata })
 *          value 타입에 ArrayBuffer 허용 = base64 를 푼 바이트를 그대로 넘긴다.
 *   선례 = worker/raw-store.ts:50 saveRawToR2(bucket, ...) 가 같은 바인딩을 이미 쓴다.
 *
 * 정규식·확장자표·빈 값 처리는 원본과 1:1. 다른 점은 "올린 뒤 무엇을 돌려주는가" 뿐 —
 * 원본은 getR2PublicUrl(= process.env.R2_PUBLIC_URL) 로 공개 URL 을 만든다.
 * 🔴 Worker 에는 그 값이 없다(2026-09-06 확인: wrangler.jsonc 에 vars 없음 / api_keys 19행에도 없음).
 *    그래서 값이 있을 때만 원본과 같은 URL 을 만들고, 없으면 null 을 돌려준다(= 아래 호출부 주석).
 */
async function uploadDataUriToR2(
  bucket: R2Bucket,
  keyBase: string,
  dataUri: string,
): Promise<string | null> {
  // 근거: 원본 r2-client.ts:78 과 같은 정규식(s 플래그 포함).
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUri || "");
  if (!m) return null;

  // 원본:80 Buffer.from(b64, "base64"). Worker 에서는 atob → 바이트 배열
  // (nodejs_compat 이 있어 Buffer 도 되지만, 표준 API 로 두어 런타임 의존을 줄인다).
  let bytes: Uint8Array;
  try {
    const bin = atob(m[2]);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null; // 깨진 base64 = 원본의 "빈 버퍼" 갈래와 같은 취급
  }
  if (!bytes.length) return null; // 원본:81

  const contentType = m[1];
  const ext = EXT_BY_MIME[contentType] || "jpg"; // 원본:82
  const key = `${keyBase}.${ext}`; // 원본:83 uploadToR2(`${keyBase}.${ext}`, ...)

  await bucket.put(key, bytes.buffer as ArrayBuffer, {
    httpMetadata: { contentType },
  });

  // 원본 r2-client.ts:43 getR2PublicUrl = `${R2_PUBLIC_URL}/${key}`.
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${key}`;
}

/** 앱이 보내는 1건의 모양 = client/navigation/GuideStackNavigator.tsx:118 body.guides[] */
interface GuideItem {
  localId?: unknown;
  title?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  imageDataUrl?: unknown;
  aiGeneratedContent?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  locationName?: unknown;
  cityId?: unknown;
  placeId?: unknown;
  language?: unknown;
  voiceLang?: unknown;
  voiceName?: unknown;
}

export function registerRestRoutes(app: Express, openDb: OpenDb): void {
  // ── 원본 server/guide-routes.ts:354 POST /api/guides/batch ───────────────
  //   🏷️ 2026-08-02 사장님 확정 = 같은 입구가 **창고 자동 저장**도 받는다(warehouse:true) = 저장 경로 1벌(§0).
  app.post("/api/guides/batch", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const reqUserId = getUserIdFromReq(req);
      const body = (req.body || {}) as {
        userId?: unknown;
        language?: unknown;
        guides?: unknown;
        warehouse?: unknown;
      };
      const language = body.language;
      const items = body.guides;

      // 원본:358-359
      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ error: "guides required" });

      // 원본:361-374 = 창고 저장이면 주인 = 관리자, 아니면 인증 우선 → 바디 userId.
      const isWarehouse = body.warehouse === true;
      let owner: string | null;
      if (isWarehouse) {
        owner = await warehouseOwnerId(db);
        if (!owner)
          return res
            .status(503)
            .json({ error: "창고 주인(관리자 계정)이 없어 담지 못했습니다" });
      } else {
        owner = reqUserId || (body.userId as string | undefined) || null;
        if (!owner) return res.status(401).json({ error: "userId required" });
      }

      // 원본:376-391 = 창고 저장은 (placeId, language) 가 이미 있으면 건너뛴다.
      let targets = items as GuideItem[];
      if (isWarehouse) {
        const kept: GuideItem[] = [];
        for (const g of targets) {
          const pid = Number(g.placeId);
          if (!Number.isInteger(pid) || pid <= 0) continue;
          const langOf = (g.language as string) || (language as string) || "ko";
          const dup = await db
            .select({ id: guides.id })
            .from(guides)
            .where(and(eq(guides.placeId, pid), eq(guides.language, langOf)))
            .limit(1);
          if (!dup.length) kept.push(g);
        }
        targets = kept;
        // 원본:389 = 이미 창고에 있음 = 정상(할 일 없음)
        if (!targets.length) return res.json({ guideIds: [] });
      }

      // 원본:392-415
      const values = await Promise.all(
        targets.map(async (g) => {
          // ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT(Cloudflare 이전 1단계) = 기기 사진(base64)은 DB 에 안 넣는다.
          const id = crypto.randomUUID(); // 원본:395
          // 원본:396-398 = imageDataUrl 이 있을 때만 R2 로 올린다.
          // R2_PUBLIC_URL 이 없으면 uploadDataUriToR2 가 null 을 준다 = 아래 `deviceUrl || g.imageUrl || null`
          // 이 원본과 같은 순서로 다음 후보를 고른다(= 사진 자체는 R2 에 올라가 보존됨).
          const deviceUrl = g.imageDataUrl
            ? await uploadDataUriToR2(
                env.RAW_BUCKET,
                `guides/${id}`,
                String(g.imageDataUrl),
              )
            : null;
          return {
            id,
            userId: owner as string,
            localId: (g.localId as string) || null,
            title: (g.title as string) || "여행 기록",
            description: (g.description as string) || null,
            imageUrl: deviceUrl || (g.imageUrl as string) || null,
            aiGeneratedContent: (g.aiGeneratedContent as string) || null,
            // 원본:405-406 = ?? null (0 도 살린다)
            latitude: (g.latitude as string) ?? null,
            longitude: (g.longitude as string) ?? null,
            locationName: (g.locationName as string) || null,
            // 원본:408-410 = 앱이 준 cityId 우선, 없으면 좌표 → 최근접 도시.
            cityId:
              (g.cityId as number) ??
              (await nearestCityIdByCoords(db, g.latitude, g.longitude)),
            placeId: Number(g.placeId) > 0 ? Number(g.placeId) : null,
            language: (g.language as string) || (language as string) || "ko",
            voiceLang: (g.voiceLang as string) || null,
            voiceName: (g.voiceName as string) || null,
          };
        }),
      );

      // 원본:416-419
      const inserted = await db
        .insert(guides)
        .values(values)
        .returning({ id: guides.id });
      res.json({ guideIds: inserted.map((r) => r.id) });
    } catch (e) {
      // 원본:421-423
      console.error("[guide/guides/batch]", (e as Error)?.message || e);
      res.status(500).json({ error: "보관함 저장 실패" });
    } finally {
      close();
    }
  });
}
