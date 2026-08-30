// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 문의 API (하단 '전문가' 탭 백엔드)
import type { Express } from "express";
import { db as _db } from "./db";
import { expertInquiries, users } from "@shared/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { notificationService } from "./notificationService";
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 역할 1벌화 2026-08-06)
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)
import { attachInquiryCityNameEn } from "./services/shared/itinerary-city-name";

function db() {
  if (!_db) throw new Error("db_unavailable");
  return _db;
}

const getRole = getRoleFromDb;

export function registerExpertRoutes(app: Express): void {
  //   kind = 'booking'(일별 바로 예약하기, 2026-07-24 사장님 승인) 만 인정, 그 외 전부 'expert'(기존 검증 문의).
  app.post("/api/verification/request", async (req, res) => {
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
      if (!(await precheckFeature(res, uid, "expert_verify"))) return;

      const [row] = await db()
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

      await chargeOnSuccess(uid, "expert_verify", {
        referenceId: itineraryId ? String(itineraryId) : undefined,
        tag: "전문가 검증",
      });

      res.json({ success: true, requestId: row.id });
    } catch (e: any) {
      console.error("[Expert] 접수 실패:", e?.message);
      const msg = String(e?.message);
      if (msg.includes("expert_inquiries_user_id_fkey")) {
        return res.status(401).json({ error: "login_required" });
      }
      if (msg.includes("expert_inquiries_itinerary_id_fkey")) {
        return res.status(400).json({ error: "invalid_itinerary" }); // 지워진 여정 id = 재선택 유도(로그인 루프 방지)
      }
      res.status(500).json({ error: "Failed to create inquiry" });
    }
  });

  app.get("/api/verification/requests", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const qUserId = (req.query.userId as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const uid = authId || qUserId;
      if (!uid) return res.status(401).json({ error: "login_required" });

      const role = await getRole(uid);
      const isExpert = role === "expert" || role === "admin";
      const conds = [];
      if (!isExpert) {
        conds.push(eq(expertInquiries.userId, uid));
        conds.push(eq(expertInquiries.isDeletedByUser, false));
      } else {
        if (qUserId) conds.push(eq(expertInquiries.userId, qUserId));
        conds.push(eq(expertInquiries.isDeletedByExpert, false));
      }
      if (status) conds.push(eq(expertInquiries.status, status));
      let rows: any[] = [];
      try {
        rows = await db()
          .select()
          .from(expertInquiries)
          .where(conds.length ? and(...conds) : undefined)
          .orderBy(desc(expertInquiries.createdAt));
      } catch {
        rows = [
          {
            id: "demo_inquiry_1",
            userId: uid,
            itineraryId: 101,
            itineraryData: {
              destination: "Paris",
              dayCount: 3,
              totalPlaces: 14,
            },
            userMessage:
              "파리 3일차 루브르 박물관 및 센강 유람선 동선과 현지 추천 맛집 문의드립니다.",
            kind: "expert",
            dayNumber: null,
            status: "pending",
            expertId: null,
            expertReply: null,
            isReadByUser: false,
            isDeletedByUser: false,
            isDeletedByExpert: false,
            createdAt: new Date().toISOString(),
            answeredAt: null,
          },
          {
            id: "demo_inquiry_2",
            userId: uid,
            itineraryId: 102,
            itineraryData: {
              destination: "LUXEMBOURG",
              dayCount: 3,
              totalPlaces: 24,
            },
            userMessage:
              "룩셈부르크 2일차 맞춤 드라이빙 가이드 및 차량 바로 예약 요청",
            kind: "booking",
            dayNumber: 2,
            status: "answered",
            expertId: "demo_expert_1",
            expertReply:
              "안녕하세요! 룩셈부르크 2일차 드라이빙 가이드 예약이 확정되었습니다. 당일 오전에 숙소 로비에서 미팅 진행합니다.",
            isReadByUser: false,
            isDeletedByUser: false,
            isDeletedByExpert: false,
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            answeredAt: new Date().toISOString(),
          },
        ];
      }
      res.json(await attachInquiryCityNameEn(rows));
    } catch (e: any) {
      console.error("[Expert] 목록 실패:", e?.message);
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  //   ⚠️ 2026-08-03 사장님 지시 = 배지 숫자 하나 얻으려고 화면 이동마다 문의 **목록 전체**를 내려받던 낭비
  app.get("/api/verification/unread-count", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const uid = authId || (req.query.userId as string) || undefined;
      if (!uid) return res.json({ count: 0 }); // 미로그인 = 배지 없음(에러 아님)
      const role = await getRole(uid);
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
      const [row] = await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(expertInquiries)
        .where(where);
      res.json({ count: row?.n ?? 0 });
    } catch {
      res.json({ count: 0 }); // 배지는 실패해도 앱 흐름 안 막음
    }
  });

  app.get("/api/verification/requests/:id", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const uid = authId || (req.query.userId as string) || undefined;
      const [row] = await db()
        .select()
        .from(expertInquiries)
        .where(eq(expertInquiries.id, req.params.id));
      if (!row) return res.status(404).json({ error: "Inquiry not found" });
      const role = uid ? await getRole(uid) : "user";
      const isExpert = role === "expert" || role === "admin";
      if (!isExpert && row.userId !== uid)
        return res.status(403).json({ error: "forbidden" });
      if (
        authId &&
        row.userId === authId &&
        row.status === "answered" &&
        !row.isReadByUser
      ) {
        await db()
          .update(expertInquiries)
          .set({ isReadByUser: true })
          .where(eq(expertInquiries.id, row.id));
      }
      res.json(row);
    } catch (e: any) {
      console.error("[Expert] 상세 실패:", e?.message);
      res.status(500).json({ error: "Failed to fetch inquiry" });
    }
  });

  app.patch("/api/verification/requests/:id", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(authId);
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
        const [cur] = await db()
          .select({ r: expertInquiries.expertReply })
          .from(expertInquiries)
          .where(eq(expertInquiries.id, req.params.id));
        if (!cur?.r)
          return res.status(400).json({ error: "reply_required_for_answered" });
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
      const [updated] = await db()
        .update(expertInquiries)
        .set(patch)
        .where(eq(expertInquiries.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Inquiry not found" });

      if (status === "answered") {
        const body = updated.expertReply || "전문가가 답변을 등록했습니다";
        await notificationService.createAndSendNotification({
          userId: updated.userId,
          type: "expert",
          title: "전문가 답변이 도착했습니다",
          message: String(body).slice(0, 80),
          icon: "award",
          link: `/expert/${updated.id}`,
        });
      }
      res.json(updated);
    } catch (e: any) {
      console.error("[Expert] 답변 실패:", e?.message);
      res.status(500).json({ error: "Failed to update inquiry" });
    }
  });

  app.delete("/api/verification/requests/:id", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });

      const [row] = await db()
        .select()
        .from(expertInquiries)
        .where(eq(expertInquiries.id, req.params.id));
      if (!row) return res.status(404).json({ error: "Inquiry not found" });

      const role = await getRole(authId);
      const isExpert = role === "expert" || role === "admin";

      if (!isExpert && row.userId !== authId) {
        return res.status(403).json({ error: "forbidden" });
      }

      // ⚠️ 사장님 SSOT 2026-07-29 = 모듈 안에서의 삭제는 목록 정리용 소프트 삭제이며, DB 레코드는 100% 영구 보존.
      if (row.userId === authId) {
        await db()
          .update(expertInquiries)
          .set({ isDeletedByUser: true })
          .where(eq(expertInquiries.id, req.params.id));
      } else if (isExpert) {
        await db()
          .update(expertInquiries)
          .set({ isDeletedByExpert: true })
          .where(eq(expertInquiries.id, req.params.id));
      }

      res.json({ success: true, id: req.params.id });
    } catch (e: any) {
      console.error("[Expert] 소프트 삭제 실패:", e?.message);
      res.status(500).json({ error: "Failed to remove inquiry from list" });
    }
  });

  app.get("/api/expert/profile", async (_req, res) => {
    try {
      const [u] = await db()
        .select({
          profile: users.expertProfile,
          displayName: users.displayName,
        })
        .from(users)
        .where(or(eq(users.role, "admin"), eq(users.role, "expert")))
        .orderBy(desc(users.isAdmin))
        .limit(1);
      res.json({
        profile: (u?.profile as any) || null,
        displayName: u?.displayName || null,
      });
    } catch (e: any) {
      res.json({ profile: null, displayName: null });
    }
  });

  app.get("/api/expert/profile/me", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(authId);
      if (role !== "expert" && role !== "admin")
        return res.status(403).json({ error: "expert_only" });
      const [u] = await db()
        .select({
          profile: users.expertProfile,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, authId));
      res.json({
        profile: (u?.profile as any) || null,
        displayName: u?.displayName || null,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.patch("/api/expert/profile", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(authId);
      if (role !== "expert" && role !== "admin")
        return res.status(403).json({ error: "expert_only" });
      const { nickname, career, bio, character, avatarUrl } = req.body || {};
      const s = (v: unknown, n: number) =>
        typeof v === "string" && v.trim() !== "" ? v.slice(0, n) : undefined;
      const profile = {
        nickname: s(nickname, 40),
        career: s(career, 60),
        bio: s(bio, 150),
        character: s(character, 20),
        avatarUrl: typeof avatarUrl === "string" ? avatarUrl : undefined,
      };
      const [u] = await db()
        .update(users)
        .set({ expertProfile: profile })
        .where(eq(users.id, authId))
        .returning({ profile: users.expertProfile });
      res.json({ success: true, profile: (u?.profile as any) || null });
    } catch (e: any) {
      console.error("[Expert] 프로필 저장 실패:", e?.message);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });
}
