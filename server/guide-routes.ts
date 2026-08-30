// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT (§12 4단계) = 가이드 미니앱 서버 배선.
//   ⑤ GET  /api/guide/place-image   = 우리 DB 장소→ 해설 재료(확정 정보 머리글 + 화면에 띄울 우리 사진 URL). 2026-08-03 사장님 지시.

import type { Express } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db as _db } from "./db";
import {
  cities,
  guides,
  placeSeedRaw,
  prompts,
  users,
  voiceConfigs,
} from "../shared/schema";
import { geminiVisionStream } from "./services/shared/geminiClient";
import { tsSearch } from "./services/shared/ts-client";
import { buildPlaceHintHeader } from "./services/shared/place-hint-header"; // 확정 정보 머리글 단일 관문(2026-08-02 §16)
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 상황판 2026-08-06)
import { nearestCityIdByCoords } from "./city-match"; // 좌표 → 최근접 도시 단일 관문(2026-08-02 §16)
import {
  chargeFeature,
  chargeOnSuccess,
  precheckFeature,
} from "./credit-charge";
import { uploadDataUriToR2 } from "./services/shared/r2-client"; // 기기 사진(base64) → R2 guides/ 파일화 1벌(2026-08-06 §16, Cloudflare 이전 1단계)

function getDb() {
  if (!_db) throw new Error("DB unavailable");
  return _db;
}

// 🏷️ 2026-08-02 사장님 확정 = **창고 주인 = 관리자 계정**.
async function warehouseOwnerId(): Promise<string | null> {
  const [u] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.createdAt)
    .limit(1);
  return u?.id || null;
}

export function registerGuideRoutes(app: Express): void {
  app.get("/api/guide/health", (_req, res) => {
    res.json({ status: "ok", service: "guide", version: "2.0.0" });
  });

  // ① 사진 해설 = 원본 레거시 POST /api/gemini 그대로 (2026-07-20 사장님 SSOT).
  app.post("/api/gemini", async (req, res) => {
    try {
      const { base64Image, prompt, systemInstruction } = req.body || {};
      const isPromptEmpty = !prompt || String(prompt).trim() === "";
      if (isPromptEmpty && !base64Image) {
        return res.status(400).json({
          error:
            "요청 본문에 필수 데이터(prompt 또는 base64Image)가 누락되었습니다.",
        });
      }

      // 🔒 수정금지(승인필요) 2026-08-05 사장님 SSOT = **해설 새로 만들기 = 로그인 필수**.
      //   외부호출 0 경로이고, 도시 대표카드의 미가입 맛보기(사장님 2026-08-05)가 그 경로를 쓴다.
      const requesterId = getUserIdFromReq(req);
      if (!requesterId) return res.status(401).json({ error: "로그인 필요" });

      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만.**
      if (!(await precheckFeature(res, requesterId, "guide_explain"))) return;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");

      let produced = 0; // 실제로 내보낸 글자 수 = 완성 판정 근거
      for await (const text of geminiVisionStream(
        base64Image || null,
        prompt || "",
        {
          systemInstruction: systemInstruction || undefined,
          contextId: "runtime",
          rawTag: "guide-gemini",
        },
      )) {
        res.write(text);
        produced += text.length;
      }
      res.end();

      if (produced)
        await chargeOnSuccess(requesterId, "guide_explain", {
          tag: "Tripis 해설",
        });
    } catch (e: any) {
      console.error("[guide/gemini]", e?.message || e);
      if (!res.headersSent) {
        res.status(500).json({ error: "해설 생성 실패" });
      } else {
        res.end();
      }
    }
  });

  //   ⚠️ 2026-08-02 사장님 지시 = **이 호출이 준 좌표도 같이 돌려준다**(name 만 돌려주고 버리던 것 폐기 = §19).
  app.get("/api/guide/landmark", async (req, res) => {
    try {
      const lat = parseFloat(String(req.query.lat));
      const lng = parseFloat(String(req.query.lng));
      if (!isFinite(lat) || !isFinite(lng)) {
        return res.status(400).json({ error: "lat,lng required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
      if (!apiKey) return res.status(503).json({ error: "maps key missing" });
      const places = await tsSearch({
        apiKey,
        method: "searchNearby",
        latitude: lat,
        longitude: lng,
        circleRadiusM: 100,
        maxResults: 5,
        includedTypes: [
          "tourist_attraction",
          "museum",
          "church",
          "park",
          "lodging",
          "restaurant",
          "cafe",
        ],
        rawTag: "guide-landmark",
      });
      const nearest = places[0];
      res.json({
        name: nearest?.nameEn || null,
        lat: nearest?.latitude ?? null,
        lng: nearest?.longitude ?? null,
      });
    } catch (e: any) {
      console.error("[guide/landmark]", e?.message || e);
      res.status(500).json({ error: "landmark 조회 실패" });
    }
  });

  // ①-c ⚠️ 수정금지(승인필요) 2026-08-02 사장님 지시 = **우리 DB 장소를 TRIPIS 해설 재료로 넘기는 입구**.
  //   ⚠️ 2026-08-03 사장님 지시 = 그래서 이 입구는 **머리글만** 내려준다. 사진은 Gemini 에 보내지 않으므로
  app.get("/api/guide/place-image", async (req, res) => {
    try {
      const placeId = Number(req.query.placeId);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return res.status(400).json({ error: "placeId(정수) 필요" });
      }
      const lang = String(req.query.lang || "ko"); // 머리글 언어 = 해설 본문 언어와 맞춘다
      const rows = await getDb()
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

      // ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 위치정보창 장소명 = 영어 우선 통일(landmark 경로와 동일).
      const placeName = row.nameEn || row.nameKo;
      const hintHeader = buildPlaceHintHeader(
        {
          placeName,
          nameLocal: row.nameLocal,
          cityName: row.cityName,
          country: row.country,
          address: row.address,
          category: row.seedCategory,
          reviewCount: row.googleReviewCount,
          priceEur: row.priceEur,
          summaryKo: row.summaryKo,
          editorialSummary: row.editorialSummary,
        },
        lang,
      );

      res.json({
        //   있는 그대로 뜬다 = 나중에 진짜 사진으로 갈아끼우면 화면도 같이 좋아지는 구조(2026-08-03 사장님 지시).
        imageUrl: row.imageUrl,
        hintHeader, // 페르소나 앞에 붙일 확정 정보 머리글
        placeName,
        seedCategory: row.seedCategory, // 사진 없을 때 화면이 띄울 아이콘 종류
        cityId: row.cityId,
        latitude: row.latitude,
        longitude: row.longitude,
        summaryKo: row.summaryKo,
      });
    } catch (e: any) {
      console.error("[guide/place-image]", e?.message || e);
      res.status(500).json({ error: `장소 조회 실패: ${e?.message || e}` });
    }
  });

  // ①-d ⚠️ 수정금지(승인필요) 2026-08-02 사장님 확정 = **해설 창고 찾기**(장소 + 언어).
  app.get("/api/guide/place-guide", async (req, res) => {
    try {
      const placeId = Number(req.query.placeId);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return res.status(400).json({ error: "placeId(정수) 필요" });
      }
      const lang = String(req.query.lang || "ko");

      // 🔒 정본 우선 (2026-08-03 §22 검수 실증 = 사장님 승인 1번 수정의 같은 뿌리. 최신행 1기준 폐기 = 2026-08-03 §19):
      const warehouseOwner = await warehouseOwnerId();
      const rows = await getDb()
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

      // 🔖 ⚠️ 수정금지(승인필요) 2026-08-03 사장님 지시 = **한 사용자 = 한 장소 = 해설 1행** + 면제 기준 1벌.
      const requester = getUserIdFromReq(req);
      let mine = false;
      if (requester) {
        mine = row.userId === requester;
        if (!mine) {
          const [own] = await getDb()
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
      //   ⚠️ 수정금지(승인필요) 2026-08-21 사장님 SSOT = **무료/차감은 "출발화면"이 정한다.**
      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만.**
      const fromCityCard = String(req.query.from || "") === "card";
      const deliverable = (row.content || row.description || "").trim();
      if (deliverable && !mine && requester && !fromCityCard) {
        if (!(await chargeFeature(res, requester, "guide_explain"))) return;
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
    } catch (e: any) {
      console.error("[guide/place-guide]", e?.message || e);
      res.status(500).json({ error: `창고 조회 실패: ${e?.message || e}` });
    }
  });

  app.get("/api/prompts/:language/:type", async (req, res) => {
    try {
      const { language, type } = req.params;
      const rows = await getDb()
        .select()
        .from(prompts)
        .where(
          and(
            eq(prompts.language, language),
            eq(prompts.type, type),
            eq(prompts.isActive, true),
          ),
        )
        .orderBy(desc(prompts.version))
        .limit(1);
      if (!rows.length)
        return res.status(404).json({ error: "prompt not found" });
      res.json({
        content: rows[0].content,
        language,
        type,
        version: rows[0].version,
      });
    } catch (e: any) {
      console.error("[guide/prompts]", e?.message || e);
      res.status(500).json({ error: "프롬프트 조회 실패" });
    }
  });

  app.get("/api/voice-configs", async (_req, res) => {
    try {
      const rows = await getDb()
        .select()
        .from(voiceConfigs)
        .where(eq(voiceConfigs.isActive, true));
      res.json(
        rows.map((r) => ({
          langCode: r.langCode,
          platform: r.platform,
          voicePriorities: r.voicePriorities,
          excludeVoices: r.excludeVoices || [],
        })),
      );
    } catch (e: any) {
      console.error("[guide/voice-configs]", e?.message || e);
      res.status(500).json({ error: "음성설정 조회 실패" });
    }
  });

  //   🏷️ 2026-08-02 사장님 확정 = 같은 입구가 **창고 자동 저장**도 받는다(warehouse:true) = 저장 경로 1벌(§0).
  app.post("/api/guides/batch", async (req, res) => {
    try {
      const reqUserId = getUserIdFromReq(req);
      const { userId, language, guides: items, warehouse } = req.body || {};
      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ error: "guides required" });

      const isWarehouse = warehouse === true;
      let owner: string | null;
      if (isWarehouse) {
        owner = await warehouseOwnerId();
        if (!owner)
          return res
            .status(503)
            .json({ error: "창고 주인(관리자 계정)이 없어 담지 못했습니다" });
      } else {
        owner = reqUserId || userId; // 인증 우선, 없으면 바디 userId(당분간 사장님만)
        if (!owner) return res.status(401).json({ error: "userId required" });
      }

      let targets = items;
      if (isWarehouse) {
        const kept: any[] = [];
        for (const g of items) {
          const pid = Number(g.placeId);
          if (!Number.isInteger(pid) || pid <= 0) continue;
          const langOf = g.language || language || "ko";
          const dup = await getDb()
            .select({ id: guides.id })
            .from(guides)
            .where(and(eq(guides.placeId, pid), eq(guides.language, langOf)))
            .limit(1);
          if (!dup.length) kept.push(g);
        }
        targets = kept;
        if (!targets.length) return res.json({ guideIds: [] }); // 이미 창고에 있음 = 정상(할 일 없음)
      }
      // 🏙️ 2026-08-02 사장님 지시 = TRIPIS 도 도시와 잇는다. 도시를 아는 두 갈래:
      const values = await Promise.all(
        targets.map(async (g: any) => {
          // ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT(Cloudflare 이전 1단계) = 기기 사진(base64)은 DB 에 안 넣는다.
          const id = crypto.randomUUID();
          const deviceUrl = g.imageDataUrl
            ? await uploadDataUriToR2(`guides/${id}`, g.imageDataUrl)
            : null;
          return {
            id,
            userId: owner,
            localId: g.localId || null,
            title: g.title || "여행 기록",
            description: g.description || null,
            imageUrl: deviceUrl || g.imageUrl || null,
            aiGeneratedContent: g.aiGeneratedContent || null,
            latitude: g.latitude ?? null,
            longitude: g.longitude ?? null,
            locationName: g.locationName || null,
            cityId:
              g.cityId ??
              (await nearestCityIdByCoords(g.latitude, g.longitude)),
            placeId: Number(g.placeId) > 0 ? Number(g.placeId) : null,
            language: g.language || language || "ko",
            voiceLang: g.voiceLang || null,
            voiceName: g.voiceName || null,
          };
        }),
      );
      const inserted = await getDb()
        .insert(guides)
        .values(values)
        .returning({ id: guides.id });
      res.json({ guideIds: inserted.map((r) => r.id) });
    } catch (e: any) {
      console.error("[guide/guides/batch]", e?.message || e);
      res.status(500).json({ error: "보관함 저장 실패" });
    }
  });

  //   ⚠️ 2026-08-06 사장님 승인 = **관리자(Bearer 토큰 role) = 전체 상황판** = 모든 사용자의 해설(소유권 = 회사).
  app.get("/api/guides", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const owner = authId || (req.query.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      const isAdmin = authId
        ? (await getRoleFromDb(authId)) === "admin"
        : false;
      const rows = await (isAdmin
        ? getDb().select().from(guides).orderBy(desc(guides.createdAt))
        : getDb()
            .select()
            .from(guides)
            .where(eq(guides.userId, owner))
            .orderBy(desc(guides.createdAt)));
      res.json(rows);
    } catch (e: any) {
      console.error("[guide/guides]", e?.message || e);
      res.status(500).json({ error: "보관함 조회 실패" });
    }
  });

  app.delete("/api/guides/:id", async (req, res) => {
    try {
      const owner = getUserIdFromReq(req) || (req.body?.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      await getDb()
        .delete(guides)
        .where(and(eq(guides.id, req.params.id), eq(guides.userId, owner)));
      res.json({ success: true });
    } catch (e: any) {
      console.error("[guide/guides delete]", e?.message || e);
      res.status(500).json({ error: "보관함 삭제 실패" });
    }
  });
}
