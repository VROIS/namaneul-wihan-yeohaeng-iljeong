// POST /api/guides/batch 1건.
// (GET /api/guides · DELETE /api/guides/:id 는 worker/routes-guide-video.ts 에 있다 = 중복 배선 금지.)
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql as dsql } from "drizzle-orm";
// 바인딩(R2) 접근 = src.ts:41 · routes-gemini.ts:27 과 같은 공식 방식.
// 타입은 `wrangler types` 산출물(worker-configuration.d.ts:5 RAW_BUCKET: R2Bucket).
import { env } from "cloudflare:workers";
import * as schema from "../shared/schema";
import { getFirstAdmin, getUserIdFromReq } from "./auth-user";
import { userGuideImageKey } from "../shared/r2-paths";

const { cities, guides } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

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

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 기기 사진(data URI) → R2 바인딩 put. 공개 주소(R2_PUBLIC_URL)가 비었거나 data URI·base64 가 깨지면 null. */
async function uploadDataUriToR2(
  bucket: R2Bucket,
  keyBase: string,
  dataUri: string,
): Promise<string | null> {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUri || "");
  if (!m) return null;

  // base64 → 바이트 배열 = atob(nodejs_compat 이라 Buffer 도 되지만 표준 API 로 두어 런타임 의존을 줄인다).
  let bytes: Uint8Array;
  try {
    const bin = atob(m[2]);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null; // 깨진 base64
  }
  if (!bytes.length) return null;

  const contentType = m[1];
  const ext = EXT_BY_MIME[contentType] || "jpg";
  const key = `${keyBase}.${ext}`;

  await bucket.put(key, bytes.buffer as ArrayBuffer, {
    httpMetadata: { contentType },
  });

  // r2-client.ts getR2PublicUrl = `${R2_PUBLIC_URL}/${key}`.
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
  // ── POST /api/guides/batch ───────────────
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

      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ error: "guides required" });

      // 창고 저장이면 주인 = 관리자, 아니면 인증 우선 → 바디 userId.
      const isWarehouse = body.warehouse === true;
      let owner: string | null;
      if (isWarehouse) {
        owner = (await getFirstAdmin(db))?.id || null;
        if (!owner)
          return res
            .status(503)
            .json({ error: "창고 주인(관리자 계정)이 없어 담지 못했습니다" });
      } else {
        owner = reqUserId || (body.userId as string | undefined) || null;
        if (!owner) return res.status(401).json({ error: "userId required" });
      }

      // 창고 저장은 (placeId, language) 가 이미 있으면 건너뛴다.
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
        // 이미 창고에 있음 = 정상(할 일 없음)
        if (!targets.length) return res.json({ guideIds: [] });
      }

      const values = await Promise.all(
        targets.map(async (g) => {
          // ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 기기 사진(base64)은 DB 에 안 넣는다(Cloudflare 이전 1단계) (정본 9-27)
          const id = crypto.randomUUID();
          // imageDataUrl 이 있을 때만 R2 로 올린다. 못 올리면(null) 아래 `deviceUrl || g.imageUrl || null` 순서로 고른다.
          const deviceUrl = g.imageDataUrl
            ? await uploadDataUriToR2(
                env.RAW_BUCKET,
                userGuideImageKey(id, owner),
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
            // ?? null (0 도 살린다)
            latitude: (g.latitude as string) ?? null,
            longitude: (g.longitude as string) ?? null,
            locationName: (g.locationName as string) || null,
            // 앱이 준 cityId 우선, 없으면 좌표 → 최근접 도시.
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

      const inserted = await db
        .insert(guides)
        .values(values)
        .returning({ id: guides.id });
      res.json({ guideIds: inserted.map((r) => r.id) });
    } catch (e) {
      console.error("[guide/guides/batch]", (e as Error)?.message || e);
      res.status(500).json({ error: "보관함 저장 실패" });
    } finally {
      close();
    }
  });
}
