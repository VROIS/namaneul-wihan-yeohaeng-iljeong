// Cloudflare Worker 이관 = 전문가 문의 8벌 + BTS 4벌 (2026-09-06)
// 원본 = server/expert-routes.ts · server/bts-routes.ts.
// 응답·상태코드·에러문구·정렬은 원본과 동일하게 옮겼다.
// 순수 계산 모듈(server/services/route-matcher, shared/**)은 그대로 import 한다(§16 재발명 금지).
// server/db.ts 를 딸려오는 모듈(storage·creditService·notificationService·pool-radius·
// place-translation·itinerary-city-name)은 Worker 번들이 불가하므로, 그 안의 쿼리만
// 여기서 openDb() 로 같은 형태로 실행한다(로직·정렬 동일).
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import * as schema from "../shared/schema";
import { pickRestaurantBySegment } from "../server/services/route-matcher";
import {
  CHARACTER_PRIMARY_CATEGORY,
  COMPANION_VIBE_CATEGORIES,
} from "../shared/bts-character-mapping";
import { normalizeImageUrl } from "../shared/lib/normalize-image-url";
// 원본 server/auth-user.ts:8 getUserIdFromReq = 헤더 정규식만(DB 무관).
// 그 파일을 import 하면 server/db.ts(pg 드라이버)가 딸려와 Worker 번들이 안 되므로
// 같은 정규식 1벌을 여기 둔다(다른 라우트 파일과 동일한 방식).
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

const {
  cities,
  creditTransactions,
  expertInquiries,
  itineraries,
  placeSeedRaw,
  placeTranslations,
  users,
} = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// ── 원본 헬퍼의 쿼리 이식 (server/db.ts 미탑재분) ───────────────────────────

/** 원본 server/auth-user.ts:16 getRoleFromDb = creditService.getUserProfile().role */
async function getRole(db: Db, userId: string): Promise<string> {
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return u?.role || "user";
}

/** 원본 server/credit-charge.ts:6 CREDIT_COSTS — 전문가 검증 단가만 사용(§9 단가표 1벌). */
const EXPERT_VERIFY_COST = 10;
const EXPERT_VERIFY_LABEL = "전문가 검증";

/**
 * 원본 server/credit-charge.ts:83 precheckFeature(feature='expert_verify').
 * 비로그인·관리자 = 면제(§9). 잔액부족 = 402 + 원본과 같은 본문.
 */
async function precheckExpertVerify(
  db: Db,
  res: Response,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return true;
  const [user] = await db
    .select({ role: users.role, credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role === "admin") return true;
  const balance = user.credits ?? 0;
  if (balance < EXPERT_VERIFY_COST) {
    res.status(402).json({
      error: "insufficient_credits",
      message: `크레딧이 부족합니다. (필요: ${EXPERT_VERIFY_COST}, 잔액: ${balance})`,
      balance,
      required: EXPERT_VERIFY_COST,
    });
    return false;
  }
  return true;
}

/**
 * 원본 server/credit-charge.ts:62 chargeOnSuccess → chargeFeature → creditService.useCredits.
 * 장부 줄 + 잔액을 한 트랜잭션으로(원본 creditService.addCredits:43). 실패해도 완성물은 보존.
 */
async function chargeExpertVerifyOnSuccess(
  db: Db,
  userId: string | null,
  referenceId?: string,
): Promise<void> {
  if (!userId) return;
  try {
    const [user] = await db
      .select({ role: users.role, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.role === "admin") return;
    if ((user.credits ?? 0) < EXPERT_VERIFY_COST) {
      console.error(
        `[credits] ${EXPERT_VERIFY_LABEL} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
      return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(creditTransactions).values({
        userId,
        type: "usage",
        amount: -EXPERT_VERIFY_COST,
        description: EXPERT_VERIFY_LABEL,
        referenceId,
      });
      await tx
        .update(users)
        .set({
          credits: sql`COALESCE(${users.credits}, 0) + ${-EXPERT_VERIFY_COST}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  } catch (e) {
    console.error(
      `[credits] ${EXPERT_VERIFY_LABEL} 차감 예외(완성물은 그대로 보존):`,
      (e as Error)?.message,
    );
  }
}

type InquiryRow = typeof expertInquiries.$inferSelect;

/** 원본 server/services/shared/itinerary-city-name.ts:14 attachInquiryCityNameEn. */
async function attachInquiryCityNameEn<T extends InquiryRow>(
  db: Db,
  rows: T[],
): Promise<T[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const itinIds = Array.from(
    new Set(
      rows
        .map((r) => Number(r?.itineraryId))
        .filter((n): n is number => Number.isFinite(n) && n > 0),
    ),
  );
  if (itinIds.length === 0) return rows;

  const joined = await db
    .select({ itinId: itineraries.id, nameEn: cities.nameEn })
    .from(itineraries)
    .leftJoin(cities, eq(cities.id, itineraries.cityId))
    .where(inArray(itineraries.id, itinIds));
  const nameByItin = new Map(joined.map((r) => [r.itinId, r.nameEn]));

  return rows.map((r) => {
    const nameEn = nameByItin.get(Number(r?.itineraryId));
    if (!nameEn || !r?.itineraryData || typeof r.itineraryData !== "object")
      return r;
    return {
      ...r,
      itineraryData: { ...(r.itineraryData as object), destination: nameEn },
    };
  });
}

// ── 전문가 문의 (원본 server/expert-routes.ts) ─────────────────────────────

export function registerExpertBtsRoutes(app: Express, openDb: OpenDb): void {
  //   kind = 'booking'(일별 바로 예약하기, 2026-07-24 사장님 승인) 만 인정, 그 외 전부 'expert'(기존 검증 문의).
  // 원본 server/expert-routes.ts:20
  app.post("/api/verification/request", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      // ⚠️ 수정금지(승인필요) 2026-07-30 §0 = 신원은 **로그인 토큰에서만** 온다.
      const uid = getUserIdFromReq(req);
      const { itineraryData, userMessage, itineraryId, kind, dayNumber } =
        req.body || {};
      if (!uid) {
        return res.status(401).json({ error: "login_required" });
      }
      if (!userMessage) {
        return res.status(400).json({ error: "userMessage is required" });
      }
      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만**(유료 5지점 공통 1벌).
      if (!(await precheckExpertVerify(db, res, uid))) return;

      const [row] = await db
        .insert(expertInquiries)
        .values({
          userId: uid,
          itineraryId: itineraryId ?? null,
          itineraryData: itineraryData ?? null,
          userMessage,
          kind: kind === "booking" ? "booking" : "expert",
          dayNumber: Number.isInteger(dayNumber) ? dayNumber : null,
        })
        .returning({ id: expertInquiries.id });

      await chargeExpertVerifyOnSuccess(
        db,
        uid,
        itineraryId ? String(itineraryId) : undefined,
      );

      res.json({ success: true, requestId: row.id });
    } catch (e) {
      const msg = String((e as Error)?.message);
      console.error("[Expert] 접수 실패:", msg);
      if (msg.includes("expert_inquiries_user_id_fkey")) {
        return res.status(401).json({ error: "login_required" });
      }
      if (msg.includes("expert_inquiries_itinerary_id_fkey")) {
        return res.status(400).json({ error: "invalid_itinerary" }); // 지워진 여정 id = 재선택 유도(로그인 루프 방지)
      }
      res.status(500).json({ error: "Failed to create inquiry" });
    } finally {
      close();
    }
  });

  //   ⚠️ 2026-08-03 사장님 지시 = 배지 숫자 하나 얻으려고 화면 이동마다 문의 **목록 전체**를 내려받던 낭비
  // 원본 server/expert-routes.ts:149 — 구체 경로를 /:id 보다 먼저 등록한다.
  app.get(
    "/api/verification/unread-count",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const authId = getUserIdFromReq(req);
        const uid = authId || (req.query.userId as string) || undefined;
        if (!uid) return res.json({ count: 0 }); // 미로그인 = 배지 없음(에러 아님)
        const role = await getRole(db, uid);
        const isExpert = role === "expert" || role === "admin";
        const where = isExpert
          ? and(
              eq(expertInquiries.isDeletedByExpert, false),
              or(
                eq(expertInquiries.status, "pending"),
                eq(expertInquiries.status, "in_review"),
              ),
            )
          : and(
              eq(expertInquiries.userId, uid),
              eq(expertInquiries.isDeletedByUser, false),
              or(
                eq(expertInquiries.status, "pending"),
                eq(expertInquiries.status, "in_review"),
                and(
                  eq(expertInquiries.status, "answered"),
                  eq(expertInquiries.isReadByUser, false),
                ),
              ),
            );
        const [row] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(expertInquiries)
          .where(where);
        res.json({ count: row?.n ?? 0 });
      } catch {
        res.json({ count: 0 }); // 배지는 실패해도 앱 흐름 안 막음
      } finally {
        close();
      }
    },
  );

  // 원본 server/expert-routes.ts:66
  app.get("/api/verification/requests", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      const qUserId = (req.query.userId as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const uid = authId || qUserId;
      if (!uid) return res.status(401).json({ error: "login_required" });

      const role = await getRole(db, uid);
      const isExpert = role === "expert" || role === "admin";
      const conds: SQL[] = [];
      if (!isExpert) {
        conds.push(eq(expertInquiries.userId, uid));
        conds.push(eq(expertInquiries.isDeletedByUser, false));
      } else {
        if (qUserId) conds.push(eq(expertInquiries.userId, qUserId));
        conds.push(eq(expertInquiries.isDeletedByExpert, false));
      }
      if (status) conds.push(eq(expertInquiries.status, status));
      // 원본의 DB 실패 시 하드코딩 demo 2건 반환 분기(expert-routes.ts:92-140)는 옮기지 않는다
      // = 가짜 데이터가 200 으로 나가 오진을 부른다(2026-09-06 이관 판단).
      const rows = await db
        .select()
        .from(expertInquiries)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(expertInquiries.createdAt));
      res.json(await attachInquiryCityNameEn(db, rows));
    } catch (e) {
      console.error("[Expert] 목록 실패:", (e as Error)?.message);
      res.status(500).json({ error: "Failed to fetch inquiries" });
    } finally {
      close();
    }
  });

  // 원본 server/expert-routes.ts:186
  app.get(
    "/api/verification/requests/:id",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const authId = getUserIdFromReq(req);
        const uid = authId || (req.query.userId as string) || undefined;
        const [row] = await db
          .select()
          .from(expertInquiries)
          .where(eq(expertInquiries.id, String(req.params.id)));
        if (!row) return res.status(404).json({ error: "Inquiry not found" });
        const role = uid ? await getRole(db, uid) : "user";
        const isExpert = role === "expert" || role === "admin";
        if (!isExpert && row.userId !== uid)
          return res.status(403).json({ error: "forbidden" });
        if (
          authId &&
          row.userId === authId &&
          row.status === "answered" &&
          !row.isReadByUser
        ) {
          await db
            .update(expertInquiries)
            .set({ isReadByUser: true })
            .where(eq(expertInquiries.id, row.id));
        }
        res.json(row);
      } catch (e) {
        console.error("[Expert] 상세 실패:", (e as Error)?.message);
        res.status(500).json({ error: "Failed to fetch inquiry" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/expert-routes.ts:217
  // ⚠️ 원본의 답변 완료 시 web-push 알림(notificationService.createAndSendNotification)은
  //    옮기지 않았다 = web-push 의 Worker 호환 미확인(2026-09-06).
  app.patch(
    "/api/verification/requests/:id",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const authId = getUserIdFromReq(req);
        if (!authId) return res.status(401).json({ error: "login_required" });
        const role = await getRole(db, authId);
        if (role !== "expert" && role !== "admin")
          return res.status(403).json({ error: "expert_only" });

        const { status, expertReply, adminComment } = req.body || {};
        const rawReply = expertReply ?? adminComment; // admin-dashboard 호환 매핑
        const reply =
          typeof rawReply === "string" && rawReply.trim() !== ""
            ? rawReply
            : undefined;
        const VALID = ["pending", "in_review", "answered", "rejected"];
        if (status !== undefined && !VALID.includes(status)) {
          return res.status(400).json({ error: "invalid_status" });
        }
        if (status === "answered" && !reply) {
          const [cur] = await db
            .select({ r: expertInquiries.expertReply })
            .from(expertInquiries)
            .where(eq(expertInquiries.id, String(req.params.id)));
          if (!cur?.r)
            return res
              .status(400)
              .json({ error: "reply_required_for_answered" });
        }
        if (status === undefined && reply === undefined) {
          return res.status(400).json({ error: "nothing_to_update" }); // 빈 PATCH = 400(옛 500 방지)
        }

        const patch: Record<string, unknown> = {};
        if (status) patch.status = status;
        if (reply !== undefined) patch.expertReply = reply;
        if (status === "answered") {
          patch.answeredAt = new Date();
          patch.expertId = authId;
          patch.isReadByUser = false; // 새 답변 = 미읽음(배지 표시)
        }
        const [updated] = await db
          .update(expertInquiries)
          .set(patch)
          .where(eq(expertInquiries.id, String(req.params.id)))
          .returning();
        if (!updated)
          return res.status(404).json({ error: "Inquiry not found" });

        res.json(updated);
      } catch (e) {
        console.error("[Expert] 답변 실패:", (e as Error)?.message);
        res.status(500).json({ error: "Failed to update inquiry" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/expert-routes.ts:280
  app.delete(
    "/api/verification/requests/:id",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const authId = getUserIdFromReq(req);
        if (!authId) return res.status(401).json({ error: "login_required" });

        const [row] = await db
          .select()
          .from(expertInquiries)
          .where(eq(expertInquiries.id, String(req.params.id)));
        if (!row) return res.status(404).json({ error: "Inquiry not found" });

        const role = await getRole(db, authId);
        const isExpert = role === "expert" || role === "admin";

        if (!isExpert && row.userId !== authId) {
          return res.status(403).json({ error: "forbidden" });
        }

        // ⚠️ 사장님 SSOT 2026-07-29 = 모듈 안에서의 삭제는 목록 정리용 소프트 삭제이며, DB 레코드는 100% 영구 보존.
        if (row.userId === authId) {
          await db
            .update(expertInquiries)
            .set({ isDeletedByUser: true })
            .where(eq(expertInquiries.id, String(req.params.id)));
        } else if (isExpert) {
          await db
            .update(expertInquiries)
            .set({ isDeletedByExpert: true })
            .where(eq(expertInquiries.id, String(req.params.id)));
        }

        res.json({ success: true, id: req.params.id });
      } catch (e) {
        console.error("[Expert] 소프트 삭제 실패:", (e as Error)?.message);
        res.status(500).json({ error: "Failed to remove inquiry from list" });
      } finally {
        close();
      }
    },
  );

  // 원본 server/expert-routes.ts:338 — 구체 경로(/me)를 /api/expert/profile 보다 먼저 등록한다.
  app.get("/api/expert/profile/me", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(db, authId);
      if (role !== "expert" && role !== "admin")
        return res.status(403).json({ error: "expert_only" });
      const [u] = await db
        .select({
          profile: users.expertProfile,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, authId));
      res.json({
        profile: u?.profile || null,
        displayName: u?.displayName || null,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch profile" });
    } finally {
      close();
    }
  });

  // 원본 server/expert-routes.ts:318
  app.get("/api/expert/profile", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const [u] = await db
        .select({
          profile: users.expertProfile,
          displayName: users.displayName,
        })
        .from(users)
        .where(or(eq(users.role, "admin"), eq(users.role, "expert")))
        .orderBy(desc(users.isAdmin))
        .limit(1);
      res.json({
        profile: u?.profile || null,
        displayName: u?.displayName || null,
      });
    } catch {
      res.json({ profile: null, displayName: null });
    } finally {
      close();
    }
  });

  registerBtsRoutes(app, openDb);
}

// ── BTS (원본 server/bts-routes.ts) ────────────────────────────────────────

// ⚠️ 수정금지(승인필요) — /api/bts/top-places 가 SELECT 하는 컬럼. 슬롯 4 곳 동일 형상 보장용.
// 원본 server/bts-routes.ts:16
const PLACE_COLS = {
  id: placeSeedRaw.id,
  nameKo: placeSeedRaw.nameKo,
  nameEn: placeSeedRaw.nameEn,
  seedCategory: placeSeedRaw.seedCategory,
  categoryTags: placeSeedRaw.categoryTags,
  imageUrl: placeSeedRaw.imageUrl,
  priceEur: placeSeedRaw.priceEur,
  summaryKo: placeSeedRaw.summaryKo,
  latitude: placeSeedRaw.latitude,
  longitude: placeSeedRaw.longitude,
  googleReviewCount: placeSeedRaw.googleReviewCount,
  bestRank: placeSeedRaw.bestRank,
  editorialSummary: placeSeedRaw.editorialSummary,
  openingHours: placeSeedRaw.openingHours,
} as const;

type PlaceRow = Pick<typeof placeSeedRaw.$inferSelect, keyof typeof PLACE_COLS>;

/** 원본 server/services/shared/pool-radius.ts:66 servingGateSql = 손님상 게이트. */
function servingGateSql() {
  return sql`(${placeSeedRaw.status} = 'active' AND (COALESCE(${placeSeedRaw.googleReviewCount}, 0) > 0 OR ${placeSeedRaw.bestRank} IS NOT NULL))`;
}

/** 원본 server/services/shared/place-translation.ts:54 readCachedPlaceTranslations = 캐시 읽기만(외부호출 0). */
async function readCachedPlaceTranslations(
  db: Db,
  ids: number[],
  language: string,
): Promise<Map<number, { summary: string | null }>> {
  const result = new Map<number, { summary: string | null }>();
  if (ids.length === 0) return result;
  const cached = await db
    .select()
    .from(placeTranslations)
    .where(
      and(
        inArray(placeTranslations.placeId, ids),
        eq(placeTranslations.language, language),
      ),
    );
  for (const c of cached) {
    result.set(c.placeId, { summary: c.summary });
  }
  return result;
}

// 원본 server/bts-routes.ts:68
function effectiveImage(p: PlaceRow | null | undefined): string | null {
  if (!p) return null;
  return normalizeImageUrl(p.imageUrl || null, 1280);
}

// 원본 server/bts-routes.ts:73 pickAliveFrom.
// ⚠️ 원본의 isImageAlive(HEAD 외부 fetch, bts-routes.ts:51)는 옮기지 않았다 = 이관 범위상 외부호출 제외(2026-09-06).
//    원본도 이 함수 안에서는 effectiveImage 유무만 보고 HEAD 를 부르지 않으므로 결과는 같다.
function pickAliveFrom<T extends PlaceRow>(
  candidates: T[],
  used: Set<number>,
): T | null {
  const eligible = candidates.filter(
    (c) => !used.has(c.id) && !!effectiveImage(c),
  );
  return eligible[0] || null;
}

// ⚠️ 수정금지(승인필요) 2026-07-30 = **D-Day 계산 = 이 함수 1벌.**
// 원본 server/bts-routes.ts:84
function calcDDay(concertDate: string, today: string): number {
  return Math.ceil(
    (new Date(concertDate + "T00:00:00Z").getTime() -
      new Date(today + "T00:00:00Z").getTime()) /
      86400000,
  );
}

function registerBtsRoutes(app: Express, openDb: OpenDb): void {
  // 원본 server/bts-routes.ts:93
  app.get("/api/bts/next-concert", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      // ⚠️ 수정금지(승인필요) — 2026-04-26 단일 SSOT: venue = place_seed_raw LEFT JOIN (seed_category='bts_venue')
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          btsRank: cities.btsRank,
          btsConcertDates: cities.btsConcertDates,
          venueName: placeSeedRaw.nameEn,
        })
        .from(cities)
        .leftJoin(
          placeSeedRaw,
          and(
            eq(placeSeedRaw.cityId, cities.id),
            eq(placeSeedRaw.seedCategory, "bts_venue"),
            sql`'bts2026' = ANY(COALESCE(${placeSeedRaw.phaseTags}, ARRAY[]::text[]))`,
          ),
        )
        .where(isNotNull(cities.btsRank))
        .orderBy(asc(cities.btsRank));

      // ⚠️ 수정금지(승인필요) — 오늘 이후 가장 가까운 공연 찾기
      const today = new Date().toISOString().slice(0, 10);
      let next: {
        cityId: number;
        city: string;
        cityKo: string;
        date: string;
        dDay: number;
        venue: string | null;
      } | null = null;

      for (const row of rows) {
        const dates = (row.btsConcertDates || []) as string[];
        for (const d of dates) {
          if (d >= today) {
            const diff = calcDDay(d, today);
            if (!next || d < next.date) {
              next = {
                cityId: row.id,
                city: row.nameEn || "",
                cityKo: row.nameKo || "",
                date: d,
                dDay: diff,
                venue: row.venueName,
              };
            }
            break; // 각 도시에서 가장 빠른 날짜만
          }
        }
      }

      // ⚠️ 수정금지(승인필요) 2026-07-30 §19 = 도시명·날짜를 글자로 박아둔 대체값 완전삭제.
      res.json(next);
    } catch (err) {
      console.error("[BTS] GET /api/bts/next-concert error:", err);
      res.status(500).json({ error: "Failed to fetch next concert" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) — 공연 임박 순 5개 필터링용 nextConcertDate 추가 (2026-04-17)
  // 원본 server/bts-routes.ts:159
  app.get("/api/bts/cities", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const rows = await db
        .select({
          id: cities.id,
          nameKo: cities.name,
          nameEn: cities.nameEn,
          btsRank: cities.btsRank,
          country: cities.country,
          countryCode: cities.countryCode,
          btsConcertDates: cities.btsConcertDates,
          btsShowTimes: cities.btsShowTimes,
          latitude: cities.latitude,
          longitude: cities.longitude,
        })
        .from(cities)
        .where(isNotNull(cities.btsRank))
        .orderBy(asc(cities.btsRank));

      // ⚠️ 수정금지(승인필요) — 오늘 이후 가장 빠른 공연일 계산
      const today = new Date().toISOString().slice(0, 10);
      const enriched = rows.map((r) => {
        const upcoming = ((r.btsConcertDates || []) as string[])
          .filter((d) => d >= today)
          .sort();
        const nextConcertDate = upcoming[0] || null;
        const dDay = nextConcertDate ? calcDDay(nextConcertDate, today) : null;
        const showTime =
          (
            ((r.btsShowTimes || []) as { date: string; time: string }[]).find(
              (s) => s.date === nextConcertDate,
            ) || {}
          ).time || null;
        return {
          id: r.id,
          nameKo: r.nameKo,
          nameEn: r.nameEn,
          btsRank: r.btsRank,
          country: r.country,
          countryCode: r.countryCode,
          nextConcertDate,
          dDay,
          showTime,
          latitude: r.latitude ? Number(r.latitude) : null,
          longitude: r.longitude ? Number(r.longitude) : null,
        };
      });

      // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = **남은 공연 도시만** 내려준다.
      res.json(enriched.filter((c) => c.nextConcertDate !== null));
    } catch (err) {
      console.error("[BTS] GET /api/bts/cities error:", err);
      res.status(500).json({ error: "Failed to fetch BTS cities" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) — 2026-08-15 사장님 승인: 8 슬롯 고정 순서 v2
  // 원본 server/bts-routes.ts:218
  app.get("/api/bts/top-places", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const cityId = parseInt(String(req.query.cityId), 10);
      const memberId = (req.query.memberId as string) || "challenger";
      // ⚠️ 수정금지(승인필요) 2026-09-02 사장님 확정 = 화면 언어(?lang=)로 카드 해설도 번역캐시에서(메인앱과 1벌)
      const lang = String(req.query.lang || "ko");
      if (!cityId || isNaN(cityId)) {
        return res.status(400).json({ error: "cityId required" });
      }

      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT: place_seed_raw 단일 테이블. collection_phase = 폐기 (= AI 과도 분류).
      const cityFilter = eq(placeSeedRaw.cityId, cityId);
      const imageNotNull = sql`${placeSeedRaw.imageUrl} IS NOT NULL`;
      // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 카드 = 메인앱 버킷 그대로 노출(로직 동일, 노출만) = 주 카테고리 우선 → rank 1등부터(베스트는 rank 안에서 이미 RC 위 등급 = autorank)
      const byCategoryTag = (tag: string, limit: number) => {
        const conditions = [
          cityFilter,
          servingGateSql(),
          sql`(${placeSeedRaw.seedCategory} = ${tag} OR ${placeSeedRaw.categoryTags} && ARRAY[${tag}]::text[])`,
          imageNotNull,
        ];
        if (tag !== "restaurant") {
          conditions.push(
            sql`NOT (${placeSeedRaw.categoryTags} && ARRAY['restaurant']::text[])`,
          );
        }
        return db
          .select(PLACE_COLS)
          .from(placeSeedRaw)
          .where(and(...conditions))
          .orderBy(
            sql`(${placeSeedRaw.seedCategory} = ${tag}) DESC`,
            asc(placeSeedRaw.rank),
          )
          .limit(limit);
      };

      const venueQuery = db
        .select(PLACE_COLS)
        .from(placeSeedRaw)
        .where(and(cityFilter, eq(placeSeedRaw.seedCategory, "bts_venue")))
        .orderBy(desc(placeSeedRaw.googleReviewCount))
        .limit(1);
      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 명시 결정성: limit 확장 (= 5/10 → 15/20)
      const restaurantQuery = byCategoryTag("restaurant", 20);

      const isCompanion = memberId === "companion";
      const vibeQuery: Promise<PlaceRow[]> = isCompanion
        ? Promise.all(
            COMPANION_VIBE_CATEGORIES.map((c) =>
              byCategoryTag(c, 3).then((r) => r),
            ),
          ).then((arr) => arr.flat())
        : byCategoryTag(
            CHARACTER_PRIMARY_CATEGORY[
              memberId as keyof typeof CHARACTER_PRIMARY_CATEGORY
            ] ?? "attraction",
            15,
          );

      const [venueRows, vibeRowsAll, restaurantPoolAll] = await Promise.all([
        venueQuery,
        vibeQuery,
        restaurantQuery,
      ]);

      const venue: PlaceRow | null = venueRows[0] ?? null;

      // ⚠️ 수정금지(승인필요) — 2026-05-07 사용자 SSOT 결정성:
      const usedIds = new Set<number>();
      if (venue) usedIds.add(venue.id);

      const vibeSlots: (PlaceRow | null)[] = [
        null,
        null,
        null,
        null,
        null,
        null,
      ];
      for (let vIdx = 0; vIdx < 6; vIdx++) {
        const next = pickAliveFrom(vibeRowsAll, usedIds);
        if (!next) break;
        usedIds.add(next.id);
        vibeSlots[vIdx] = next;
      }

      const restaurantPool = restaurantPoolAll.filter(
        (r) => !usedIds.has(r.id) && !!effectiveImage(r),
      );

      const lunch = pickRestaurantBySegment(
        restaurantPool,
        vibeSlots[2],
        vibeSlots[3],
      );
      if (lunch) usedIds.add(lunch.id);

      const slotPlaces: (PlaceRow | null)[] = [
        venue, // 1 공연장
        vibeSlots[0], // 2
        vibeSlots[1], // 3
        vibeSlots[2], // 4
        lunch, // 5 점심 ★
        vibeSlots[3], // 6
        vibeSlots[4], // 7
        vibeSlots[5], // 8
      ];

      // ⚠️ 수정금지(승인필요) 2026-05-07 사용자 SSOT = 카드 노출 필드 7개 + 좌표 2개(지도 마커) · 이미지 URL 단일 정규화
      const trMap =
        lang === "ko"
          ? new Map<number, { summary: string | null }>()
          : await readCachedPlaceTranslations(
              db,
              slotPlaces.filter((p): p is PlaceRow => !!p).map((p) => p.id),
              lang,
            );
      const slots = slotPlaces.map((p, i) => {
        if (!p) return { slot: i + 1, id: null };
        const rawUrl = p.imageUrl || null;
        const tr = trMap.get(p.id);
        return {
          slot: i + 1,
          id: p.id,
          nameKo: p.nameKo,
          nameEn: p.nameEn,
          seedCategory: p.seedCategory,
          imageUrl: normalizeImageUrl(rawUrl, 1280),
          priceEur: p.priceEur,
          summaryKo: tr?.summary ?? p.summaryKo,
          latitude: p.latitude != null ? Number(p.latitude) : null,
          longitude: p.longitude != null ? Number(p.longitude) : null,
        };
      });

      res.json(slots);
    } catch (err) {
      console.error("[BTS] GET /api/bts/top-places error:", err);
      res.status(500).json({ error: "Failed to fetch top places" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) — 2026-05-06 Screen 4 카트→지도 = WebView 안 Google Maps API key 노출
  // 원본 server/bts-routes.ts:364 — 키를 응답에 넣기만 한다(외부호출 없음). DB 도 안 쓴다.
  app.get("/api/bts/map-config", async (_req: Request, res: Response) => {
    // 이 라우트는 열쇠가 필요하다. Worker 는 부팅 시 process.env 가 비어 있으므로
    // DB api_keys 를 먼저 채운다(isolate 당 1회, keys.ts).
    const { db, close } = openDb();
    try {
      const rows = await db
        .select({ v: schema.apiKeys.keyValue })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyName, "GOOGLE_MAPS_API_KEY"));
      const v = rows[0]?.v?.trim();
      if (v) {
        process.env.GOOGLE_MAPS_API_KEY = v;
        process.env.Google_maps_api_key = v;
      }
    } catch (e) {
      console.error("[bts/map-config] 열쇠 조회 실패:", e);
    } finally {
      close();
    }
    const key =
      process.env.GOOGLE_MAPS_API_KEY || process.env.Google_maps_api_key || "";
    if (!key)
      return res.status(503).json({ error: "Google Maps API key missing" });
    res.json({ googleMapsApiKey: key });
  });
}
