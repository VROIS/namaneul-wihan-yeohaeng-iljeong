// ⚠️ 2026-07-15 = routes.ts(1,049줄) 500줄 가드 초과 슬림화 = 순수 이동(로직 변경 없음) §0
//   담긴 라우트 = 도시 3 + 장소 3(단건조회·자동완성·상세) + 일정생성(+디버그) + Day 재최적화
import type { Express } from "express";
import { storage } from "./storage";
import { itineraryGenerator } from "./services/itinerary-generator";
import { db } from "./db";
// guides = 해설 창고 1벌(2026-08-02). 도시 카드 [해설] 배지를 켤지 여기서 있는지만 본다.
// savedVideos = 도시카드 선별입력(영상 override, 2026-08-25) = "영상 자신의 id"(itinerary.id 아님, 사장님 정정) 조회용.
import {
  cities,
  placeSeedRaw,
  itineraries,
  guides,
  savedVideos,
} from "../shared/schema";
// ne·isNull·isNotNull = 대표장소 조건을 city-representative-place 1벌로 옮기며 이 파일에서 안 쓰게 됨(삭제 2026-08-05 §19)
import { eq, sql, desc, and, or, inArray } from "drizzle-orm";
// ⚠️ 완비 기준 = ag2 의 상수 1벌을 가져다 쓴다(§16). 여기에 300 을 다시 적으면 기준이 두 벌이 된다.
import { READY_THRESHOLD } from "./services/agents/ag2-gemini-recommender";
// 도시 대표장소 = 조건·정렬 1벌(§16). 하이라이트 카테고리 순서도 같은 파일이 정본.
import {
  cityRepresentativeWhere,
  cityRepresentativeOrder,
  HIGHLIGHT_CATEGORIES,
  pickDisplayName,
} from "./services/shared/city-representative-place";
import {
  computeDayRouteLive,
  enrichStopsWithPsr,
} from "./services/shared/routes-client";
import { getUserIdFromReq } from "./auth-user"; // 토큰 → userId 1벌(§16)

export function registerCityPlaceRoutes(app: Express): void {
  // Cities
  app.get("/api/cities", async (req, res) => {
    try {
      const cities = await storage.getCities();
      res.json(cities);
    } catch (error) {
      console.error("Error fetching cities:", error);
      res.status(500).json({ error: "Failed to fetch cities" });
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 여정 플래너 상단 **도시버튼의 유일한 목록 소스.**
  //   DB-only 가 완비된 도시만 = place_seed_raw 전체 행수 ≥ READY_THRESHOLD(300, ag2 상수 1벌).
  //   완비도 높은 순(행수 DESC)으로 내려준다 = 사장님 "완비된 도시 순으로 노출".
  //   ⚠️ 반드시 아래 "/api/cities/:id" **앞**에 있어야 한다 = 뒤에 두면 :id 가 "ready" 를 id 로 먹어 404.
  //   도시를 더 발굴해 300 을 넘기면 **코드 수정 없이 자동으로 목록에 추가됨**(사장님 "점진적으로 늘려감").
  app.get("/api/cities/ready", async (_req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      // 화면이 쓰는 칸만 뽑는다 = 안 쓰는 칸을 뽑으면 GROUP BY 가 그만큼 길어진다(2026-07-30 §22 지적).
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          rows: sql<number>`COUNT(*)::int`,
        })
        .from(cities)
        .innerJoin(placeSeedRaw, eq(placeSeedRaw.cityId, cities.id))
        .groupBy(cities.id, cities.name, cities.nameEn)
        .having(sql`COUNT(*) >= ${READY_THRESHOLD}`)
        .orderBy(desc(sql`COUNT(*)`));
      res.json(rows);
    } catch (error) {
      console.error("[cities/ready] 완비도시 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_ready_cities" });
    }
  });

  // ⚠️ 수정금지(승인필요) 🏙️ B2 도시 카드 데이터 = 카드는 **항상** 뜬다(2026-08-02 사장님 지시로 갱신 §19).
  //   조립은 1벌 = ① 도시 DB 로 기본 카드를 채우고 ② 대표여정이 있으면 그 칸만 여정 값으로 덮는다(§0 = 폴백 분기 안 만듦).
  //   아래 "/api/cities/:id" 와 경로 충돌 없음(:id 는 슬래시를 넘지 않음) = /api/cities/ready 뒤 배치.
  app.get("/api/cities/:id/representative", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      const cityId = parseInt(req.params.id);
      if (Number.isNaN(cityId)) {
        return res.status(404).json({ error: "City not found" });
      }
      // 🎙️ 지금 화면 언어 = 화면이 넘겨준다(앱 언어 1벌). 안 넘어오면 한국어.
      //   같은 장소라도 언어가 다르면 해설 자체가 다르므로 창고를 찾는 열쇠에 반드시 들어간다.
      const lang = String(req.query.lang || "ko");

      // ③ 하이라이트 = 4 CAT 각 1위를 **조회 1번**으로(§16 = CAT마다 따로 묻지 않는다).
      //   같은 후보조건(cityRepresentativeWhere) 위에서 CAT 별로 리뷰수 1위 = 창(window) 한 번.
      //   순서 = HIGHLIGHT_CATEGORIES 배열 순서 그대로(hotspot→attraction→healing→adventure).
      //   ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 이 조회는 ①②와 서로 의존하지 않으므로 **아래
      //     Promise.all 안에서 같이** 나간다(§22 판단검증 지적). 순차 await 로 두면 도시 칩마다 불리는
      //     라우트에서 DB 왕복이 1회 더 늘어난다.
      const catOrder = sql.raw(
        HIGHLIGHT_CATEGORIES.map((cat, i) => `WHEN '${cat}' THEN ${i}`).join(
          " ",
        ),
      );
      const ranked = db
        .select({
          nameEn: placeSeedRaw.nameEn,
          nameLocal: placeSeedRaw.nameLocal,
          nameKo: placeSeedRaw.nameKo,
          rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${placeSeedRaw.seedCategory} ORDER BY ${placeSeedRaw.googleReviewCount} DESC, ${placeSeedRaw.id} DESC)`.as(
            "rn",
          ),
          catRank:
            sql<number>`CASE ${placeSeedRaw.seedCategory} ${catOrder} ELSE 99 END`.as(
              "cat_rank",
            ),
        })
        .from(placeSeedRaw)
        .where(
          and(
            cityRepresentativeWhere(cityId),
            inArray(placeSeedRaw.seedCategory, [...HIGHLIGHT_CATEGORIES]),
          ),
        )
        .as("ranked");

      // 조회 3번 = ① 도시 1행(+있으면 대표여정 LEFT JOIN) ② 대표장소 1곳(사진·태그라인) ③ 하이라이트(CAT별 1위).
      //   ②·③ 을 나눈 이유(2026-08-21 사장님 승인) = 얼굴(사진)과 하이라이트의 **기준이 서로 다르다**.
      //     · 사진 = 그 도시 리뷰수 1위(랜드마크 노출순위 유지)
      //     · 하이라이트 = 4 CAT(hotspot→attraction→healing→adventure) 각 1위 = 성격이 겹치지 않게
      //       (옛 "리뷰수 top3" 폐기 = 2026-08-21 §19 — 같은 성격만 3개 뽑히고 식당·쇼핑몰이 도시 얼굴 옆에
      //       나란히 서던 문제. 나이로비 = 쇼핑몰 3개, 파리·런던 등 5도시 = 식당이 하이라이트에 노출).
      const [[row], repRows, highlightRows] = await Promise.all([
        db
          .select({
            nameKo: cities.name,
            nameEn: cities.nameEn,
            country: cities.country,
            // ⚠️ 수정금지(승인필요) 2026-08-20 사장님 승인 = 도시대표카드 국가명 영어통일용.
            //   country 컬럼엔 영어값이 없어(전량 한국어) FE가 이 ISO코드로 영어 국가명을 변환한다(§16 = DB 새 컬럼·쓰기 없음).
            countryCode: cities.countryCode,
            itineraryId: itineraries.id, // 대표여정 없으면 null = 그대로 "없음" 신호
            title: itineraries.title,
            protagonistSentence: itineraries.protagonistSentence,
            rawData: itineraries.rawData,
            videoByDay: itineraries.videoByDay,
            // 🖼️ 2026-08-25 확정 스펙 v2 = 도시카드 선별입력(override). null = 아래 자동랭킹 그대로 사용.
            overrideHeroPlaceId: cities.overrideHeroPlaceId,
            overrideHighlightPlaceIds: cities.overrideHighlightPlaceIds,
            overrideVideoId: cities.overrideVideoId,
          })
          .from(cities)
          // ⚠️ 수정금지(승인필요) 2026-08-20 사장님 SSOT = 대표여정 고르는 순서 1벌(재정정).
          //   옛 규칙(관리자 소유 + 여정id 최신) 폐기 = 2026-08-20 §19 — 영상 없는 옛 ★대표(파리#9, 2026-05-09
          //   생성, video_by_day=null)가 그 뒤에 만든 진짜 영상 5개를 영구히 가려버린 실사고 재발 방지.
          //   새 규칙(4단계, 정렬 1벌로 표현 = 분기 코드 없음 §0):
          //     ① ★대표(status='representative') 이면서 그 여정 자체에 영상도 있으면 최우선
          //     ② ①이 아니어도 영상이 있으면(소유자 무관, 관리자 제한 폐기) **saved_videos 실제 생성시각 기준 최신** 우선
          //     ③ 영상은 없어도 ★대표면(카피·하이라이트 큐레이션 값만이라도) 그다음
          //     ④ 아무것도 없으면 null = 카드는 도시 DB 만으로 뜬다(B-0 자동 채움)
          .leftJoin(
            itineraries,
            and(
              eq(itineraries.cityId, cities.id),
              or(
                eq(itineraries.status, "representative"),
                sql`EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e
                            WHERE e.value->>'status' = 'succeeded')`,
              ),
            ),
          )
          .where(eq(cities.id, cityId))
          .orderBy(
            sql`CASE
                  WHEN ${itineraries.status} = 'representative'
                       AND EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e WHERE e.value->>'status'='succeeded')
                       THEN 0
                  WHEN EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e WHERE e.value->>'status'='succeeded')
                       THEN 1
                  WHEN ${itineraries.status} = 'representative' THEN 2
                  ELSE 3
                END`,
            sql`(SELECT MAX(sv.created_at) FROM saved_videos sv WHERE sv.itinerary_id = ${itineraries.id}) DESC NULLS LAST`,
            desc(itineraries.id),
          )
          .limit(1),
        db
          .select({
            // 🎙️ 2026-08-02 = 1위 행의 우리 장소번호. 관리자 [해설 만들기] 가 이 번호로 해설 화면을 연다.
            //   이미 뽑는 조회에 칸 하나만 더한다 = 같은 조건을 두 번 묻는 새 조회를 만들지 않는다(§16).
            id: placeSeedRaw.id,
            imageUrl: placeSeedRaw.imageUrl,
            summaryKo: placeSeedRaw.summaryKo,
            nameKo: placeSeedRaw.nameKo,
            nameEn: placeSeedRaw.nameEn,
          })
          .from(placeSeedRaw)
          // ⚠️ 수정금지(승인필요) 2026-08-05 = 조건·정렬은 **city-representative-place 1벌**을 가져다 쓴다(§16).
          .where(cityRepresentativeWhere(cityId))
          .orderBy(...cityRepresentativeOrder)
          .limit(1),
        db
          .select({
            nameEn: ranked.nameEn,
            nameLocal: ranked.nameLocal,
            nameKo: ranked.nameKo,
          })
          .from(ranked)
          .where(eq(ranked.rn, 1))
          .orderBy(ranked.catRank)
          .limit(3),
      ]);
      if (!row) return res.status(404).json({ error: "City not found" });

      // 🖼️ 2026-08-25 확정 스펙 v2 = 도시카드 선별입력(override) 적용 — 값이 있으면 위 자동랭킹(repRows/highlightRows)을
      //   덮어쓴다. null 이면 자동랭킹 그대로(원래 로직 무변경). 저장 관문 = POST /api/admin/cities/:id/content-override(관리자 전용).
      let heroPlace = repRows[0] ?? null;
      if (row.overrideHeroPlaceId != null) {
        const [overrideHero] = await db
          .select({
            id: placeSeedRaw.id,
            imageUrl: placeSeedRaw.imageUrl,
            summaryKo: placeSeedRaw.summaryKo,
            nameKo: placeSeedRaw.nameKo,
            nameEn: placeSeedRaw.nameEn,
          })
          .from(placeSeedRaw)
          .where(eq(placeSeedRaw.id, row.overrideHeroPlaceId))
          .limit(1);
        if (overrideHero) heroPlace = overrideHero;
      }

      let highlightPlaces: {
        nameEn: string | null;
        nameLocal: string | null;
        nameKo: string | null;
      }[] = highlightRows;
      const overrideHighlightIds = (row.overrideHighlightPlaceIds || []).filter(
        (id): id is number => id != null,
      );
      if (overrideHighlightIds.length > 0) {
        const overrideRows = await db
          .select({
            id: placeSeedRaw.id,
            nameEn: placeSeedRaw.nameEn,
            nameLocal: placeSeedRaw.nameLocal,
            nameKo: placeSeedRaw.nameKo,
          })
          .from(placeSeedRaw)
          .where(inArray(placeSeedRaw.id, overrideHighlightIds));
        const byId = new Map(overrideRows.map((r) => [r.id, r]));
        highlightPlaces = overrideHighlightIds
          .map((id) => byId.get(id))
          .filter((r): r is (typeof overrideRows)[number] => r != null);
      }

      // 🎙️ 2026-08-02 사장님 확정 = [해설] 배지는 **그 카드 장소의 해설이 창고에 있으면 자동으로 켠다.**
      //   대표 해설을 따로 담는 칸도, 손으로 고르는 절차도 두지 않는다 =
      //   카드가 보여주는 장소(리뷰 1위 또는 override)와 [해설 만들기]가 여는 장소가 같은 1곳이라 고를 것이 없다.
      //   찾는 열쇠 = (장소번호, 언어) 두 칸 = 색인 guides_place_lang_idx 그대로.
      //   ⚠️ 있는지만 본다 = 내용 칸은 뽑지 않고 1행에서 끊는다(이 라우트는 도시 칩마다 불린다).
      const repPlaceId = heroPlace?.id ?? null;
      const guideHit =
        repPlaceId === null
          ? []
          : await db
              .select({ id: guides.id })
              .from(guides)
              .where(
                and(eq(guides.placeId, repPlaceId), eq(guides.language, lang)),
              )
              .limit(1);

      // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 태그라인 = 대표여정 유무와 무관하게 공식 1벌(§0·§19).
      //   대표장소(사진과 같은 1위 행) 요약이 항상 중간 폴백으로 보장 = 앞으로 대표여정이 몇 개가
      //   생기든(무한대로 늘 도시카드) 주인공문장 빈 여정 5곳이 PSR 요약을 가리던 버그가 구조적으로 재발 못 함.
      //   이중 경로(기본값 설정 후 조건부 재계산) 폐기 = 2026-08-21 §19.
      const tagline =
        (row.itineraryId !== null && row.protagonistSentence) ||
        heroPlace?.summaryKo ||
        (row.itineraryId !== null && row.title) ||
        "";

      // ① 기본 카드 = 도시 DB 만으로 채움. 장소가 0개면 사진 null·하이라이트 [] 로 그대로 나간다(화면이 알아서 비움).
      const card = {
        itineraryId: row.itineraryId,
        cityId,
        nameKo: row.nameKo,
        nameEn: row.nameEn,
        country: row.country,
        countryCode: row.countryCode,
        tagline,
        // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 표시명 = pickDisplayName 1벌(§16, 규칙·사유는
        //   city-representative-place.ts 에). 옛 name_ko 우선 폐기 = 2026-08-21 §19.
        highlights: highlightPlaces.map(pickDisplayName),
        dayCount: 0, // 0 = 화면이 "N일 코스" 배지를 안 그림
        imageUrl: heroPlace?.imageUrl ?? null,
        // 🎙️ 2026-08-02 사장님 순서 ㉠ = 관리자가 [해설 만들기] 로 여는 장소 = 위 사진과 **같은 1위 행**.
        //   그 도시에 쓸 장소가 하나도 없으면 null = 화면이 [해설 만들기] 를 아예 안 그린다.
        placeId: repPlaceId,
        // 🎙️ 해설 배지 스위치 = 그 장소 + 그 언어의 해설이 창고에 1건이라도 있으면 켜짐(위 존재 확인 1벌).
        hasGuide: guideHit.length > 0,
        hasVideo: false,
        // 🎬 영상 override(선별입력)로만 채워짐 = 평소엔 null(TripisModal.tsx 가 이때는 itineraryId 그대로 재생).
        //   ⚠️ itineraryId 와 분리된 이유 = itineraryId 는 [코스] 배지가 그대로 쓰는 여정번호라 영상 override 로
        //   건드리면 코스 이동이 엉뚱한 여정으로 튐(2026-08-25 판단3종 지적, 아래 override 블록 참조).
        videoItineraryId: null as number | null,
        videoDay: null as number | null,
        // 🖼️ 2026-08-25 판단3종 지적으로 추가 = 선별입력 폼이 "지금 이 도시에 뭐가 저장돼 있는지" 다시 불러올
        //   방법이 없어서, 관리자가 슬롯 하나만 고치려 해도 나머지 저장값이 빈칸으로 보여 함께 지워지던 문제.
        //   raw override 원본값(=DB 컬럼 그대로) 을 그대로 내려준다 = admin-dashboard.html 이 폼을 채우는 데 씀.
        overrides: {
          heroPlaceId: row.overrideHeroPlaceId,
          highlightPlaceIds: row.overrideHighlightPlaceIds,
          videoId: row.overrideVideoId,
        },
      };

      // ② 대표여정이 있으면 **일수·영상 배지만** 그 여정에서 가져온다.
      //   ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 하이라이트를 여정 rawData 로 덮어쓰던 경로
      //     완전삭제 = 2026-08-21 §19. 사유 = ㉠ 하이라이트는 **그 도시 전체의 대표성**이어야 하는데 여정
      //     1일차 방문순서를 그대로 쓰면 식당·카페가 올라왔다(파리 안젤리나·런던 Bancone 등 5도시 실측).
      //     ㉡ 대표여정 유무로 로직이 두 벌 갈려 도시마다 기준이 달랐다(유럽5 = 여정 / 나머지5 = PSR).
      //     이제 하이라이트는 여정과 무관하게 PSR 1벌 = 카드가 무한대로 늘어도 전 도시 같은 기준.
      if (row.itineraryId !== null) {
        const raw = row.rawData as any;
        const days: any[] = Array.isArray(raw?.days) ? raw.days : [];
        card.dayCount = days.length;
        // hasVideo = 하루라도 영상 성공(succeeded)이면 true = ▶배지는 영상이 실제로 있을 때만(B5)
        card.hasVideo = Object.values(row.videoByDay || {}).some(
          (v) => v?.status === "succeeded",
        );
      }

      // 🎬 영상 override = saved_videos.id(영상 자신의 id) 직접 지정 — itinerary 선택과 무관(사장님 정정, 2026-08-25).
      //   ⚠️ 2026-08-25 판단3종 지적으로 2차 수정 = card.itineraryId 를 직접 덮으면 [코스] 배지(handleViewItinerary)
      //     까지 override 여정으로 끌려가 카드의 사진·하이라이트(도시 X)와 실제 이동하는 여정(override의 여정 Y)이
      //     어긋남 — itineraryId 는 **여정/코스 전용**으로 그대로 두고, 영상 재생만 쓰는 별도 칸
      //     videoItineraryId 를 새로 둔다(TripisModal.tsx 가 [Video] 눌렀을 때만 이 값으로 갈아탐, [코스]는 그대로 itineraryId).
      if (row.overrideVideoId != null) {
        const [overrideVideo] = await db
          .select({
            itineraryId: savedVideos.itineraryId,
            day: savedVideos.day,
            videoByDay: itineraries.videoByDay,
          })
          .from(savedVideos)
          .innerJoin(itineraries, eq(itineraries.id, savedVideos.itineraryId))
          .where(eq(savedVideos.id, row.overrideVideoId))
          .limit(1);
        if (overrideVideo) {
          const dayEntry = (overrideVideo.videoByDay as any)?.[
            overrideVideo.day
          ];
          card.hasVideo = dayEntry?.status === "succeeded";
          card.videoItineraryId = overrideVideo.itineraryId;
          card.videoDay = overrideVideo.day;
        }
      }

      res.json(card);
    } catch (error) {
      console.error("[cities/:id/representative] 도시 카드 조회 실패:", error);
      res.status(500).json({ error: "failed_to_fetch_representative" });
    }
  });

  // 🖼️ 2026-08-25 확정 스펙 v2 = 도시카드 선별입력(override) 저장 — /admin 페이지(admin-dashboard.html) 전용 API.
  //   ⚠️ users.role 검사 안 함 = 이 페이지의 다른 관리 기능(guide-prices PUT/POST, api-keys POST/PUT)도 전부
  //   인증 헤더 없이 열려 있음(§0 = 이 페이지 도달 자체가 "관리자" 경계, 개발단계 전체개방 §16 재사용 = 같은 컨벤션).
  //   ★대표올리기(itinerary-routes.ts)는 role 검사가 맞다 — 그건 일반 사용자도 쓰는 Profile 화면에서 불리기 때문.
  //   값을 넣으면 그 슬롯이 자동랭킹 대신 그 id로 고정, null(빈칸)로 저장하면 자동랭킹 복귀.
  app.post("/api/admin/cities/:id/content-override", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });
      const cityId = parseInt(req.params.id);
      if (Number.isNaN(cityId)) {
        return res.status(404).json({ error: "City not found" });
      }
      const toIdOrNull = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const heroPlaceId = toIdOrNull(req.body?.heroPlaceId);
      const highlightPlaceIds = Array.isArray(req.body?.highlightPlaceIds)
        ? req.body.highlightPlaceIds
            .map(toIdOrNull)
            .filter((v: number | null) => v != null)
        : null;
      const videoId = toIdOrNull(req.body?.videoId);

      await db
        .update(cities)
        .set({
          overrideHeroPlaceId: heroPlaceId,
          overrideHighlightPlaceIds:
            highlightPlaceIds && highlightPlaceIds.length > 0
              ? highlightPlaceIds
              : null,
          overrideVideoId: videoId,
        })
        .where(eq(cities.id, cityId));

      console.log(`[ContentOverride] 도시 ${cityId} 선별입력 저장 완료`);
      res.json({ cityId, heroPlaceId, highlightPlaceIds, videoId });
    } catch (error) {
      console.error("[ContentOverride] 저장 실패:", error);
      res.status(500).json({ error: "failed_to_save_content_override" });
    }
  });

  app.get("/api/cities/:id", async (req, res) => {
    try {
      const city = await storage.getCity(parseInt(req.params.id));
      if (!city) {
        return res.status(404).json({ error: "City not found" });
      }
      res.json(city);
    } catch (error) {
      console.error("Error fetching city:", error);
      res.status(500).json({ error: "Failed to fetch city" });
    }
  });

  app.post("/api/cities", async (req, res) => {
    try {
      const city = await storage.createCity(req.body);
      res.status(201).json(city);
    } catch (error) {
      console.error("Error creating city:", error);
      res.status(500).json({ error: "Failed to create city" });
    }
  });

  // ⚠️ 2026-05-23 = /api/cities/:cityId/places 완전 삭제 (= FE 호출 0 = storage.getPlacesByCity 의존 = Step 2 storage 정리 시 함수 삭제)

  // ⚠️ 2026-05-23 = /api/places/:id = PSR 직접 (= storage.getPlace 본문 PSR 사용)
  // = dataSources (= placeDataSources 의존) = 삭제
  app.get("/api/places/:id", async (req, res, next) => {
    // ⚠️ 2026-06-28 = :id 가 정수 아니면 다음 라우트로 위임 (= NaN→getPlace(NaN)→DB 22P02 500 차단). 2026-08-23 옛 프록시 2라우트 삭제 후에도 비정수 :id 방어로 유지 §19.
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return next();
    try {
      const place = await storage.getPlace(id);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(place);
    } catch (error) {
      console.error("Error fetching place:", error);
      res.status(500).json({ error: "Failed to fetch place" });
    }
  });

  // ⚠️ 2026-05-23 = /api/cities/:cityId/recommendations + /api/sync/city/* 완전 삭제
  // = FE 호출 0 = scoringEngine (= weather/places 의존 = 폐기) + DEPRECATED endpoint 정리

  // ⚠️ 2026-05-23 = /api/sync/place/*/vibe + /taste 완전 삭제 (= vibe-processor + taste-verifier 파일 삭제 = 사용자 SSOT)

  // ⚠️ 2026-05-23 = /api/cities/:cityId/weather 완전 삭제 (= FE 호출 0 = weather.ts 파일도 삭제)

  // [DROPPED 0013] reality-checks 엔드포인트 삭제

  // ⚠️ 2026-07-24 사장님 승인 = 일별 [바로가기] = 출발지+경유지+도착지 왕복(사장님 SSOT).
  //   출발/도착 = 숙소(변경시 좌표) ?? 도시명 주소(미설정 = 구글이 도시중심 지오코딩 = 좌표조회 불필요·견고, 사장님 SSOT).
  //   경유지 = 그날 슬롯(클릭 시점 순서). PSR 이름보충 + Routes API 왕복 실소요시간. 재정렬 안 함.
  app.post("/api/routes/day-live", async (req, res) => {
    try {
      const slots = Array.isArray(req.body?.slots)
        ? req.body.slots.filter(
            (s: any) =>
              typeof s?.lat === "number" && typeof s?.lng === "number",
          )
        : [];
      const accom = req.body?.accommodation; // {lat,lng,name,placeId} | null (숙소 변경시)
      const cityName =
        typeof req.body?.cityName === "string" ? req.body.cityName.trim() : "";
      if (slots.length < 1) {
        return res.status(400).json({ error: "slots(lat,lng) 필요" });
      }
      // 왕복 실소요 endpoint = 숙소 좌표(변경시) ?? 도시명 주소(구글 지오코딩). 딥링크 출발/도착은 FE 가 동일 기준으로 조립.
      const hasAccom =
        accom && typeof accom.lat === "number" && typeof accom.lng === "number";
      const endpoint = hasAccom
        ? { lat: accom.lat, lng: accom.lng }
        : cityName
          ? { address: cityName }
          : null;
      const startSrc = hasAccom ? "숙소" : cityName ? "도시명주소" : "없음";
      console.log(
        `[day-live] 슬롯 ${slots.length} | 출발/도착 기준=${startSrc}${cityName ? `(${cityName})` : ""}`,
      );
      // ① PSR 좌표조회 = 슬롯 PID+이름(구글맵 주소 대신 장소명, 사장님 SSOT). 출발/도착은 FE 가 숙소/도시명으로.
      const enriched = await enrichStopsWithPsr(slots);
      // ② Routes API 왕복 실소요시간 (선택 = 실패해도 이름은 반환). endpoint 없으면 스킵.
      let live: { durationSec: number; distanceKm: number } | null = null;
      if (endpoint) {
        try {
          live = await computeDayRouteLive(slots, endpoint);
        } catch (e: any) {
          console.error("[day-live] ETA 실패(이름은 반환):", e?.message);
        }
      }
      res.json({
        durationSec: live?.durationSec ?? null,
        distanceKm: live?.distanceKm ?? null,
        stops: enriched,
      });
    } catch (e: any) {
      console.error("[day-live] 실패:", e?.message);
      res.status(502).json({ error: "day_live_failed" }); // FE = 딥링크만 오픈(기능 불중단)
    }
  });

  // 🔧 진단용: 일정 생성 단계별 타임아웃 확인
  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 관리자 전용 잠금(§9 표7 판단기준 = users.role 1벌).
  //   옛것 = 인증·차감 전혀 없이 실제 유료 파이프라인(Gemini+TS)이 그대로 도는 구멍이었다(운영배포 시 무제한 무료호출 위험).
  app.get("/api/debug/generate-test", async (req, res) => {
    const userId = getUserIdFromReq(req);
    const user = userId ? await storage.getUser(userId) : undefined;
    if (user?.role !== "admin") {
      return res.status(403).json({ error: "관리자 전용 진단 엔드포인트" });
    }
    const steps: string[] = [];
    const start = Date.now();
    try {
      steps.push(`[${Date.now() - start}ms] Start`);

      // Gemini API 키 확인
      const geminiKey = process.env.GEMINI_API_KEY;
      steps.push(
        `[${Date.now() - start}ms] Gemini key: ${geminiKey ? "present (" + geminiKey.substring(0, 8) + "...)" : "MISSING"}`,
      );

      // DB 연결 확인
      const cityCheck = await db
        .select({ count: sql<number>`count(*)` })
        .from(cities);
      steps.push(
        `[${Date.now() - start}ms] DB OK - cities: ${cityCheck[0]?.count}`,
      );

      // 간단한 일정 생성 테스트
      const testFormData = {
        destination: "Paris",
        startDate: "2026-03-01",
        endDate: "2026-03-01",
        vibes: ["Shopping"] as any, // ⚠️ 2026-06-28 = 옛 Foodie 버튼폐기 → 정식 vibe(Shopping)로 교체(§19)
        curationFocus: "Everyone" as any,
        companionType: "Single",
        companionCount: 1,
        travelStyle: "Reasonable" as any,
        mobilityStyle: "Moderate" as any,
        travelPace: "Normal" as any,
        birthDate: "1990-01-01",
        companionAges: "",
        startTime: "10:00",
        endTime: "18:00",
        destinationCoords: { lat: 48.8566, lng: 2.3522 },
      };

      steps.push(
        `[${Date.now() - start}ms] Calling generateItinerary (4+1 Agent Pipeline)...`,
      );
      const result = await itineraryGenerator.generate(testFormData);

      const totalMs = Date.now() - start;
      const dayCount = result?.days?.length || 0;
      const placeCount =
        result?.days?.reduce(
          (sum: number, d: any) => sum + (d?.places?.length || 0),
          0,
        ) || 0;

      steps.push(`[${totalMs}ms] SUCCESS - ${dayCount}일 ${placeCount}곳`);

      // 파이프라인 단계별 타이밍 추출
      const pipelineTimings = result?.metadata?._timings || {};
      const pipelineTotal = result?.metadata?._totalMs || totalMs;

      res.json({
        status: "ok",
        steps,
        totalMs,
        pipeline: {
          version: result?.metadata?._pipelineVersion || "unknown",
          totalMs: pipelineTotal,
          stages: {
            AG1_skeleton: pipelineTimings["AG1_skeleton"] || 0,
            AG2_AG3pre_parallel: pipelineTimings["AG2_AG3pre_parallel"]
              ? pipelineTimings["AG2_AG3pre_parallel"] -
                (pipelineTimings["AG1_skeleton"] || 0)
              : 0,
            AG3_matchScore: pipelineTimings["AG3_matchScore"]
              ? pipelineTimings["AG3_matchScore"] -
                (pipelineTimings["AG2_AG3pre_parallel"] || 0)
              : 0,
            AG4_finalize: pipelineTimings["AG4_finalize"]
              ? pipelineTimings["AG4_finalize"] -
                (pipelineTimings["AG3_matchScore"] || 0)
              : 0,
          },
          summary: `AG1:${pipelineTimings["AG1_skeleton"] || "?"}ms → AG2+3pre:${pipelineTimings["AG2_AG3pre_parallel"] ? pipelineTimings["AG2_AG3pre_parallel"] - (pipelineTimings["AG1_skeleton"] || 0) : "?"}ms → AG3:${pipelineTimings["AG3_matchScore"] ? pipelineTimings["AG3_matchScore"] - (pipelineTimings["AG2_AG3pre_parallel"] || 0) : "?"}ms → AG4:${pipelineTimings["AG4_finalize"] ? pipelineTimings["AG4_finalize"] - (pipelineTimings["AG3_matchScore"] || 0) : "?"}ms = 총 ${pipelineTotal}ms`,
        },
        result: {
          days: dayCount,
          totalPlaces: placeCount,
          placeSample:
            result?.days?.[0]?.places?.slice(0, 3)?.map((p: any) => ({
              name: p.name,
              source: p.sourceType,
              score: p.finalScore,
            })) || [],
        },
      });
    } catch (error: any) {
      steps.push(`[${Date.now() - start}ms] ERROR: ${error?.message}`);
      steps.push(
        `[${Date.now() - start}ms] Stack: ${(error?.stack || "").substring(0, 500)}`,
      );
      res.json({ status: "error", steps, totalMs: Date.now() - start });
    }
  });

  // 2026-08-23 사장님 승인 = 구(legacy) Places Autocomplete/Details 프록시 2라우트 삭제 §19 = 소스 호출자 0(숙소·도시 검색은 구글 공식 위젯 직통), 옛 번들만 두드리던 유료 표면 제거.

  // Day별 동선 재최적화 API (숙소 변경 시)
  app.post("/api/routes/regenerate-day", async (req, res) => {
    try {
      const { day, accommodationCoords, places, formData } = req.body;

      if (!day || !places || !Array.isArray(places)) {
        return res.status(400).json({ error: "day, places are required" });
      }

      // 동선 재최적화 (숙소 좌표 기반 원형 경로)
      const result = await itineraryGenerator.regenerateDay({
        day,
        accommodationCoords,
        places,
        formData,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[Regenerate Day] Error:", error?.message);
      res.status(500).json({ error: "동선 재최적화 실패" });
    }
  });
}
