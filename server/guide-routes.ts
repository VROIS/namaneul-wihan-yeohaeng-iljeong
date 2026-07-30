// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT (§12 4단계) = 가이드 미니앱 서버 배선.
// = 레거시 카메라 모듈(client/screens/guide, 내부 0수정)이 부르는 엔드포인트 = 여기서 배선.
//   ① POST /api/gemini             = 사진 해설 스트리밍 (검증된 레거시 원본 그대로 = 2026-07-20 사장님 SSOT).
//   ② GET  /api/prompts/:lang/:type = 언어별 페르소나 (DB prompts, is_active+version DESC = §12 함정 필터).
//   ③ GET  /api/voice-configs       = 웹TTS 음성 우선순위 (DB voice_configs).
//   ④ /api/guides (batch·목록·삭제)  = 보관함 (DB guides). 당분간 사장님만 = auth.ts 재사용.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db as _db } from "./db";
import { guides, prompts, voiceConfigs } from "../shared/schema";
import { geminiVisionStream } from "./services/shared/geminiClient";
import { tsSearch } from "./services/shared/ts-client";
import { getUserIdFromReq } from "./auth-user"; // Bearer → userId 단일 관문(2026-07-29 §16, 이 파일 사본 삭제 §19)
import { chargeFeature } from "./credit-charge"; // 크레딧 차감 단일 관문(2026-07-29 §9)

// ⚠️ db 는 DB 미연결 시 null 가능(server/db.ts) = 라우트 진입 시 확정(bts-routes 패턴). null 이면 throw → 각 라우트 catch 가 503.
function getDb() {
  if (!_db) throw new Error("DB unavailable");
  return _db;
}

export function registerGuideRoutes(app: Express): void {
  // === 헬스 체크 ===
  app.get("/api/guide/health", (_req, res) => {
    res.json({ status: "ok", service: "guide", version: "2.0.0" });
  });

  // ① 사진 해설 = 원본 레거시 POST /api/gemini 그대로 (2026-07-20 사장님 SSOT).
  //   = body { base64Image, prompt, systemInstruction } → text/plain 청크 스트리밍(res.write).
  //   = 🪙 Tripis 해설 5크레딧 차감 = 2026-07-29 §9 (옛 "차감 제외 바이패스" 폐기 §19).
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

      // 🪙 Tripis 해설 5크레딧 차감 (2026-07-29 §9).
      //   ⚠️ 반드시 아래 setHeader/write **전에** 있어야 한다 = 헤더가 나가면 잔액부족(402)을 보낼 수 없다.
      if (!(await chargeFeature(res, getUserIdFromReq(req), "guide_explain")))
        return;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");

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
      }
      res.end();
    } catch (e: any) {
      console.error("[guide/gemini]", e?.message || e);
      if (!res.headersSent) {
        res.status(500).json({ error: "해설 생성 실패" });
      } else {
        res.end();
      }
    }
  });

  // ①-b 위치창 랜드마크 = 운영앱 getNearbyLandmark 클론 (2026-07-20 사장님 SSOT = 위치창 복원).
  //   = 주변 100m 인기순 장소의 현지어 이름 1건. TS 단일관문 tsSearch 재사용(§16).
  //   = 비용: TS 1콜/촬영·업로드 (운영앱도 Maps JS nearbySearch 동일 구조 지출).
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
        // 운영앱 getNearbyLandmark = 무필터 검색+랜드마크 우선. ts-client 기본값(식당만)이 걸리지 않게
        // 운영 우선타입+상권 타입을 명시(§22 검증 적발 = 식당명만 반환되던 클론 변질 수정).
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
      res.json({ name: places[0]?.nameEn || null });
    } catch (e: any) {
      console.error("[guide/landmark]", e?.message || e);
      res.status(500).json({ error: "landmark 조회 실패" });
    }
  });

  // ② 언어별 페르소나 = DB prompts. ⚠️ §12 함정 = 중복·구버전 존재 → is_active + version DESC 1건.
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

  // ③ 웹TTS 음성 우선순위 = DB voice_configs (모듈 웹앱 로직이 langCode·platform 별로 캐시).
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

  // ④ 보관함 저장 = 모듈 ArchiveService.saveToServer 가 { userId, language, guides:[...] } 로 POST.
  app.post("/api/guides/batch", async (req, res) => {
    try {
      const reqUserId = getUserIdFromReq(req);
      const { userId, language, guides: items } = req.body || {};
      const owner = reqUserId || userId; // 인증 우선, 없으면 바디 userId(당분간 사장님만)
      if (!owner) return res.status(401).json({ error: "userId required" });
      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ error: "guides required" });
      const inserted = await getDb()
        .insert(guides)
        .values(
          items.map((g: any) => ({
            userId: owner,
            localId: g.localId || null,
            title: g.title || "여행 기록",
            description: g.description || null,
            imageUrl: g.imageDataUrl || g.imageUrl || null, // 모듈은 data:image base64 인라인 전달
            aiGeneratedContent: g.aiGeneratedContent || null,
            latitude: g.latitude ?? null,
            longitude: g.longitude ?? null,
            locationName: g.locationName || null,
            language: g.language || language || "ko",
            voiceLang: g.voiceLang || null,
            voiceName: g.voiceName || null,
          })),
        )
        .returning({ id: guides.id });
      res.json({ guideIds: inserted.map((r) => r.id) });
    } catch (e: any) {
      console.error("[guide/guides/batch]", e?.message || e);
      res.status(500).json({ error: "보관함 저장 실패" });
    }
  });

  // ④ 보관함 목록 = GET /api/guides?userId=
  app.get("/api/guides", async (req, res) => {
    try {
      const owner = getUserIdFromReq(req) || (req.query.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      const rows = await getDb()
        .select()
        .from(guides)
        .where(eq(guides.userId, owner))
        .orderBy(desc(guides.createdAt));
      res.json(rows);
    } catch (e: any) {
      console.error("[guide/guides]", e?.message || e);
      res.status(500).json({ error: "보관함 조회 실패" });
    }
  });

  // ④ 보관함 삭제 = DELETE /api/guides/:id (본인 것만).
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
