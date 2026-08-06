// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT (§12 4단계) = 가이드 미니앱 서버 배선.
// = 레거시 카메라 모듈(client/screens/guide, 내부 0수정)이 부르는 엔드포인트 = 여기서 배선.
//   ① POST /api/gemini             = 사진 해설 스트리밍 (검증된 레거시 원본 그대로 = 2026-07-20 사장님 SSOT).
//   ② GET  /api/prompts/:lang/:type = 언어별 페르소나 (DB prompts, is_active+version DESC = §12 함정 필터).
//   ③ GET  /api/voice-configs       = 웹TTS 음성 우선순위 (DB voice_configs).
//   ④ /api/guides (batch·목록·삭제)  = 보관함 (DB guides). 당분간 사장님만 = auth.ts 재사용.
//   ⑤ GET  /api/guide/place-image   = 우리 DB 장소→ 해설 재료(확정 정보 머리글 + 화면에 띄울 우리 사진 URL). 2026-08-03 사장님 지시.
//   ⑥ GET  /api/guide/place-guide   = **해설 창고**(장소+언어)에 이미 만들어 둔 해설 찾기. 2026-08-02 사장님 지시.
// ═══════════════════════════════════════════════════════════════════════════════

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
import { chargeFeature } from "./credit-charge"; // 크레딧 차감 단일 관문(2026-07-29 §9)
import { isCityRepresentativePlace } from "./services/shared/city-representative-place"; // 도시 대표장소=맛보기 무료 판정 1벌(2026-08-05 §16)
import { uploadDataUriToR2 } from "./services/shared/r2-client"; // 기기 사진(base64) → R2 guides/ 파일화 1벌(2026-08-06 §16, Cloudflare 이전 1단계)

// ⚠️ db 는 DB 미연결 시 null 가능(server/db.ts) = 라우트 진입 시 확정(bts-routes 패턴). null 이면 throw → 각 라우트 catch 가 503.
function getDb() {
  if (!_db) throw new Error("DB unavailable");
  return _db;
}

// 🏷️ 2026-08-02 사장님 확정 = **창고 주인 = 관리자 계정**.
//   새로 만든 해설을 자동으로 담을 때 그 행의 주인이다(= 공용 창고). 사용자 '나의 TRIPIS' 는
//   사용자가 [저장]을 눌렀을 때만 따로 1건 생긴다.
//   판단 기준 = users.role='admin' 1벌 (§9 표7 = is_admin 칸·아이디 문자열로 관리자를 판단하지 않는다).
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

      // 🔒 수정금지(승인필요) 2026-08-05 사장님 SSOT = **해설 새로 만들기 = 로그인 필수**.
      //   사유(실측): chargeFeature 는 비로그인을 차감 없이 통과시키므로(credit-charge.ts = §9 게스트 개방),
      //   이 줄이 없으면 토큰 없는 요청이 유료 Gemini 를 그대로 태운다(무과금 = 회사 지출).
      //   ⚠️ 창고 조회(GET /api/guide/place-guide)는 **열어 둔다** = 이미 만들어 둔 해설을 그대로 내주는
      //   외부호출 0 경로이고, 도시 대표카드의 미가입 맛보기(사장님 2026-08-05)가 그 경로를 쓴다.
      const requesterId = getUserIdFromReq(req);
      if (!requesterId) return res.status(401).json({ error: "로그인 필요" });

      // 🪙 Tripis 해설 5크레딧 차감 (2026-07-29 §9).
      //   ⚠️ 반드시 아래 setHeader/write **전에** 있어야 한다 = 헤더가 나가면 잔액부족(402)을 보낼 수 없다.
      if (!(await chargeFeature(res, requesterId, "guide_explain"))) return;

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
  //   ⚠️ 2026-08-02 사장님 지시 = **이 호출이 준 좌표도 같이 돌려준다**(name 만 돌려주고 버리던 것 폐기 = §19).
  //     이미 값을 받아 놓고도 안 쓰던 것이라 추가 비용 0(같은 TS 응답의 9요소 중 좌표). FieldMask 변경 0(§15).
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
      // 화면 표시는 이름(name) 그대로. lat/lng = 저장용(사용자 화면에는 안 보임).
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
  //   = 해설의 정확도를 만드는 것은 사진이 아니라 **확정 정보 머리글**이다(사장님 4종 실측):
  //       사진이 엉뚱해도(부산 경기장) 머리글이 루브르면 → 루브르 해설 / 사진이 아예 없어도 머리글만으로 → 정상 해설.
  //   ⚠️ 2026-08-03 사장님 지시 = 그래서 이 입구는 **머리글만** 내려준다. 사진은 Gemini 에 보내지 않으므로
  //     여기서 사진을 내려받지도 않는다(안 쓰는 800KB 를 Storage 에서 받아 폰으로 또 내려보내면
  //     응답 6.0초 → 3.9초 손해 + 저장소 전송량만 나간다). 화면에 뜨는 우리 사진은 아래 imageUrl 그대로다.
  //   = 여기는 **재료 전달만** = 크레딧 차감 없음. 과금은 /api/gemini 1지점 그대로(§9 단일 진입점).
  //   = 새 구글 호출 0 (§15) · 사진 내려받기 0.
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

      // 🔒 검증 관문 = 구글 식별정보(PID 또는 구글맵 URI)가 하나라도 있는 행만 해설 재료로 쓴다.
      //   이유: 아래 머리글은 "이것은 확인된 사실"이라고 모델에게 못 박는 글이다. 검증 안 된 행(이름만 있는 행)에
      //   머리글을 붙이면 **틀린 사실을 확신시키는 해설**이 나온다. PID·URI 가 있으면 구글로 실재가 확인된 행이다.
      if (!row.googlePlaceId && !row.googleMapsUri) {
        return res
          .status(409)
          .json({ error: "검증되지 않은 장소(구글 식별정보 없음)" });
      }

      const placeName = row.nameKo || row.nameEn;
      // 머리글 조립 = place-hint-header.ts 1벌(§16). 여기서 문구를 새로 만들지 않는다.
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
        // 사진 = 화면이 이 URL 을 그대로 띄운다(우리 이미지). 아이콘밖에 없는 장소도, 사진이 오염된 장소도
        //   있는 그대로 뜬다 = 나중에 진짜 사진으로 갈아끼우면 화면도 같이 좋아지는 구조(2026-08-03 사장님 지시).
        //   보관함 저장도 이 URL 그대로(사진을 base64 로 다시 담으면 장당 110KB 낭비). 없으면 null = 화면이 아이콘.
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
  //   있는 해설을 그대로 내주면 유료 외부호출이 0 이 된다. 없으면 204(본문 없음) = 화면이 새로 만든다.
  //   ⚠️ 찾는 열쇠는 반드시 **(장소, 언어) 두 칸**이다. 언어권마다 프롬프트의 관심사가 달라
  //     같은 장소라도 언어가 다르면 아예 다른 해설이다(독일어=사실·논리 / 프랑스어=미적 감동 / 일본어=역사 …).
  //   🪙 차감 = 있다. 창고에 있어 호출이 없어도 **볼 때마다 5크레딧**(사장님 확정):
  //     우리 원가는 호출비용만이 아니다(저장소·DB·서버·개발 유지비). 첫 사람만 내면 먼저 쓴 사람이 손해다.
  //     무료 예외 = **그 해설의 주인 본인**(= 자기 '나의 TRIPIS' 에 담아둔 것을 다시 보는 것). 관리자 면제는 chargeFeature 가 이미 한다.
  //   ⚠️ 차감은 반드시 res.json 보다 **먼저** = 응답이 나간 뒤에는 잔액부족(402)을 보낼 수 없다(§9 표4).
  app.get("/api/guide/place-guide", async (req, res) => {
    try {
      const placeId = Number(req.query.placeId);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return res.status(400).json({ error: "placeId(정수) 필요" });
      }
      const lang = String(req.query.lang || "ko");

      // 🔒 정본 우선 (2026-08-03 §22 검수 실증 = 사장님 승인 1번 수정의 같은 뿌리. 최신행 1기준 폐기 = 2026-08-03 §19):
      //   사용자 [저장] 본문은 클라이언트가 보내는 값이라 정본이 될 수 없는데, 최신 행이면 전원에게 그대로
      //   서빙되는 오염 경로가 검수 중 실증됐다(시험 행이 손님에게 나감 → 즉시 삭제·복구).
      //   → **창고 주인(관리자) 행이 있으면 항상 그것**, 없을 때만 최신 행.
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
          // 사진이 없는 장소일 때 화면이 띄울 아이콘 종류 + 이름 보정용(place-image 와 같은 재료).
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
      //   mine = 요청자 본인이 이 (장소, 언어) 해설을 이미 자기 것으로 담아 두었는지.
      //   이 값 하나가 두 가지를 다 정한다(§0 = 같은 사실에 판정 두 벌 금지):
      //   ① 차감 면제 = "내가 담아둔 것 재열람 = 무료"(사장님 SSOT). ② 화면의 [저장] 잠금("이미 저장되었습니다").
      //   ⚠️ 그래서 mine 을 차감보다 **먼저** 센다 — 옛 판정(최신 1행 주인만 비교)은 타인이 나중에
      //   같은 (장소,언어)를 [저장]하면 내 것인데도 차감되던 결함 = 폐기 2026-08-03 §22 검수.
      //   · 비로그인 = 거짓. · 최신 행 주인이 곧 요청자면 조회 없이 참(같은 사실을 두 번 묻지 않는다).
      //   · 가볍게 = id 1칸 + limit 1 (색인 guides_place_lang_idx).
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
      // 🪙 차감 = 내 것이 아닐 때만(볼 때마다 5, 사장님 확정). res.json 보다 먼저(§9 표4).
      //   ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = **도시 대표장소 해설 = 맛보기 = 조건 없이 무료.**
      //     사유(사장님 실측): 도시 카드의 [해설]은 대표 이미지 1장짜리 **샘플**인데, 옛 코드는 비로그인만
      //     우연히 공짜였고(§9 게스트 통과) **로그인하면 5가 깎였다** = 로그인할수록 손해인 앞뒤 안 맞는 상태.
      //     판정은 서버가 단독으로 한다(city-representative-place 1벌) = 화면이 무엇을 보내도 흉내낼 수 없다.
      //     ⚠️ requester 를 먼저 본다 = 비로그인은 어차피 무과금(chargeFeature)이라 대표장소 판정(조회 2회)이
      //       순수 낭비다. 도시카드 맛보기가 가장 잦은 경로라 그 길에서 0회가 된다.
      if (!mine && requester && !(await isCityRepresentativePlace(placeId))) {
        if (!(await chargeFeature(res, requester, "guide_explain"))) return;
      }

      res.json({
        mine, // 화면 = 이 값으로 [저장] 중복 차단 상태를 처음부터 켠다
        guideId: row.id,
        content: row.content || row.description || "",
        imageUrl: row.imageUrl,
        locationName: row.locationName || row.nameKo || row.nameEn,
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
  //   🏷️ 2026-08-02 사장님 확정 = 같은 입구가 **창고 자동 저장**도 받는다(warehouse:true) = 저장 경로 1벌(§0).
  //     · warehouse 없음 = 지금 그대로 = 사용자가 [저장]을 눌러 **본인 '나의 TRIPIS'** 에 담는 것.
  //     · warehouse:true = 새로 만든 해설을 **공용 창고**에 담는 것 = 주인은 관리자, 장소번호 필수.
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

      // 창고에 담을 것 고르기 = ① 장소번호가 있는 것만(창고 열쇠가 없으면 아무도 못 찾는다)
      //   ② (장소, 언어)에 이미 있으면 담지 않는다 = 같은 칸 두 벌 금지(§0). 두 사람이 동시에 열었을 때의 겹침도 여기서 막힌다.
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
      //   ① 우리 DB 장소 사진으로 만든 해설 = 그 장소의 city_id 를 body 로 받아 그대로 넣는다(가장 정확).
      //   ② 기기 사진 = 도시를 모르니 좌표로 최근접 1곳 계산(city-match.ts 1벌 §16, 외부호출 0).
      //   좌표도 도시도 없으면 null 로 그대로 저장 = 사장님이 나중에 지정.
      const values = await Promise.all(
        targets.map(async (g: any) => {
          // ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT(Cloudflare 이전 1단계) = 기기 사진(base64)은 DB 에 안 넣는다.
          //   = id 를 먼저 만들어 R2 guides/{id}.{확장자} 로 올리고 DB 에는 주소만(옛 base64 직저장 = 행당 수백 KB = DB 비대 근본 = 폐기 §19).
          //   = 우리 DB 장소 사진(imageUrl = 이미 r2.dev 주소)은 그대로. R2 업로드 실패 = catch 로 500 = 무성실패 없음(폴백 분기 없음 §0).
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
            // 🏷️ 창고 열쇠 = 어느 장소의 해설인지. 기기 사진이면 장소번호가 없어 null 그대로(= 창고에는 안 뜬다).
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

  // ④ 보관함 목록 = GET /api/guides?userId=
  //   ⚠️ 2026-08-06 사장님 승인 = **관리자(Bearer 토큰 role) = 전체 상황판** = 모든 사용자의 해설(소유권 = 회사).
  //     전문가 문의함 패턴 동형. 쿼리 userId 폴백(비토큰 레거시 경로)은 admin 판정에 안 씀 = 스푸핑 차단.
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
