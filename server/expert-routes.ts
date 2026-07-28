// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 문의 API (하단 '전문가' 탭 백엔드)
//   계획서 = docs/2026-07-13 전문가탭 구현계획.md 2단계. 시안 = docs/design/2026-07-13 전문가탭 화면구성안.html
//   흐름 = 사용자(여정+AI의견 첨부) 문의 접수 → 전문가(role='expert'/'admin') 답변 → notificationService 1줄로 인앱 알림(+VAPID 있으면 푸시).
//   경로 규약 = FE(VerificationRequestScreen)·admin-dashboard 기존 호출 그대로(/api/verification/*) = 양쪽 수정 최소화(§16).
import type { Express, Request } from "express";
import { db as _db } from "./db";
import { expertInquiries, users } from "@shared/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { notificationService } from "./notificationService";

// db 널 가드 = place-upsert 'db_unavailable' 규약과 동일 취지(각 핸들러 try/catch가 500 처리)
function db() {
  if (!_db) throw new Error("db_unavailable");
  return _db;
}

// Bearer 토큰 → userId = server/auth.ts:259-263 규약 1벌 그대로(§16 재발명 금지)
function getUserIdFromReq(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  const id = h.split(" ")[1].replace("simple_auth_token_v1_", "");
  return id || null;
}

// 역할 조회 = users.role ('user' | 'expert' | 'admin')
async function getRole(userId: string): Promise<string> {
  const [u] = await db()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return u?.role || "user";
}

export function registerExpertRoutes(app: Express): void {
  // ── 1) 문의 접수 = POST /api/verification/request ──
  //   body = { userId, itineraryData(여정+AI의견 스냅샷), userMessage, itineraryId?, kind?, dayNumber? }
  //   kind = 'booking'(일별 바로 예약하기, 2026-07-24 사장님 승인) 만 인정, 그 외 전부 'expert'(기존 검증 문의).
  //   🪙 크레딧 차감(10) = 8단계에서 이 지점에 useCredits 1줄(로그인 정식화 후 사장님 지시 시) — routes.ts:803 AI의견 앵커와 동일 패턴.
  app.post("/api/verification/request", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const {
        userId,
        itineraryData,
        userMessage,
        itineraryId,
        kind,
        dayNumber,
      } = req.body || {};
      const uid = authId || userId; // 3단계(FE 토큰 첨부) 전 과도기 = body userId 허용. FK가 실존 사용자만 통과시킴.
      if (!uid || !userMessage) {
        return res
          .status(400)
          .json({ error: "userId and userMessage are required" });
      }
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
      res.json({ success: true, requestId: row.id });
    } catch (e: any) {
      console.error("[Expert] 접수 실패:", e?.message);
      const msg = String(e?.message);
      // user_id FK 위반만 = 미로그인/가짜 id = 로그인 유도. (itinerary_id FK 위반은 별개 = 400, 리뷰 발견 2026-07-13)
      if (msg.includes("expert_inquiries_user_id_fkey")) {
        return res.status(401).json({ error: "login_required" });
      }
      if (msg.includes("expert_inquiries_itinerary_id_fkey")) {
        return res.status(400).json({ error: "invalid_itinerary" }); // 지워진 여정 id = 재선택 유도(로그인 루프 방지)
      }
      res.status(500).json({ error: "Failed to create inquiry" });
    }
  });

  // ── 2) 목록 = GET /api/verification/requests?userId=&status= ──
  //   일반 사용자 = 본인 것만(내문의함) / expert·admin = 전체(답변함). 응답 = 배열(admin-dashboard 기존 규약 호환).
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
      // ⚠️ 보안(리뷰 발견 2026-07-13) = 일반 사용자는 자기 신원(uid)만 조회 = qUserId 무시(타인 문의 열람 스푸핑 차단, 옛 폴백 폐기 §19).
      //   expert·admin 만 qUserId 로 특정 사용자 필터 허용(답변함 검색용).
      if (!isExpert) conds.push(eq(expertInquiries.userId, uid));
      else if (qUserId) conds.push(eq(expertInquiries.userId, qUserId));
      if (status) conds.push(eq(expertInquiries.status, status));
      const rows = await db()
        .select()
        .from(expertInquiries)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(expertInquiries.createdAt));
      res.json(rows);
    } catch (e: any) {
      console.error("[Expert] 목록 실패:", e?.message);
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  // ── 3) 배지 카운트 = GET /api/verification/unread-count = 답변완료인데 사용자가 안 읽은 수(전문가 탭 아이콘 배지) ──
  app.get("/api/verification/unread-count", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const uid = authId || (req.query.userId as string) || undefined;
      if (!uid) return res.json({ count: 0 }); // 미로그인 = 배지 없음(에러 아님)
      const rows = await db()
        .select({ id: expertInquiries.id })
        .from(expertInquiries)
        .where(
          and(
            eq(expertInquiries.userId, uid),
            eq(expertInquiries.status, "answered"),
            eq(expertInquiries.isReadByUser, false),
          ),
        );
      res.json({ count: rows.length });
    } catch (e: any) {
      res.json({ count: 0 }); // 배지는 실패해도 앱 흐름 안 막음
    }
  });

  // ── 4) 상세 = GET /api/verification/requests/:id (본인 or expert·admin). 본인이 답변 열람 시 읽음 처리(배지 감소). ──
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
      // ⚠️ 읽음 처리 = 실 토큰(authId) 본인 열람일 때만 = 쿼리스푸핑(?userId=피해자)으로 남의 배지 지우기 차단(리뷰 발견 2026-07-13).
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

  // ── 5) 답변/상태 갱신 = PATCH /api/verification/requests/:id = expert·admin 전용 ──
  //   body = { status?, expertReply?(admin-dashboard 는 adminComment 로 보냄 → 매핑) }
  //   status='answered' = answered_at 기록 + 질문자에게 알림 1줄(인앱 저장+VAPID 있으면 푸시 = notificationService 완결).
  app.patch("/api/verification/requests/:id", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(authId);
      if (role !== "expert" && role !== "admin")
        return res.status(403).json({ error: "expert_only" });

      const { status, expertReply, adminComment } = req.body || {};
      // 빈 문자열('')은 "값 없음"으로 취급 = 상태만 바꿀 때 기존 답변을 ''로 지우는 사고 차단(리뷰 발견 2026-07-13).
      const rawReply = expertReply ?? adminComment; // admin-dashboard 호환 매핑
      const reply =
        typeof rawReply === "string" && rawReply.trim() !== ""
          ? rawReply
          : undefined;
      // status 화이트리스트 = admin-dashboard VERIFICATION_STATUS_MAP 규약. 오타/임의값 저장 차단.
      const VALID = ["pending", "in_review", "answered", "rejected"];
      if (status !== undefined && !VALID.includes(status)) {
        return res.status(400).json({ error: "invalid_status" });
      }
      // 답변완료 = 반드시 답변 본문 필요(배지만 뜨고 빈 답변인 유령상태 차단).
      if (status === "answered" && !reply) {
        // 이미 저장된 답변이 있으면 그걸로 완료 처리 허용, 없으면 거부
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

      // 답변완료로 전환 = 항상 알림(빈답변은 위에서 이미 400 = 여기 도달 = 답변 존재 보장).
      if (status === "answered") {
        const body = updated.expertReply || "전문가가 답변을 등록했습니다";
        // 알림 = 기존 notificationService 1벌(§16) = DB 알림 + 개인 푸시(VAPID 있을 때) + 만료구독 정리
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

  // ── 5-2) 문의 삭제 = DELETE /api/verification/requests/:id (본인 또는 expert/admin) ──
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

      // 본인 작성글이 아니거나 전문가/관리자가 아니면 403
      if (!isExpert && row.userId !== authId) {
        return res.status(403).json({ error: "forbidden" });
      }

      await db()
        .delete(expertInquiries)
        .where(eq(expertInquiries.id, req.params.id));

      res.json({ success: true, id: req.params.id });
    } catch (e: any) {
      console.error("[Expert] 삭제 실패:", e?.message);
      res.status(500).json({ error: "Failed to delete inquiry" });
    }
  });

  // ── 6) 전문가 공개 프로필 = GET /api/expert/profile (미인증 공개) = 소개카드 표시용. 단일 전문가(사장님=is_admin 우선). ──
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

  // ── 6-2) 전문가 본인 프로필 = GET /api/expert/profile/me (expert·admin) = 편집화면 프리필용.
  //   리뷰 2026-07-13 = 공용 대표전문가(is_admin 우선)가 아니라 "로그인한 본인" 행 = 전문가 다수 시 정체성 덮어쓰기 방지.
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

  // ── 7) 전문가 본인 프로필 저장 = PATCH /api/expert/profile = expert·admin 전용 ──
  app.patch("/api/expert/profile", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(authId);
      if (role !== "expert" && role !== "admin")
        return res.status(403).json({ error: "expert_only" });
      const { nickname, career, bio, character } = req.body || {};
      const s = (v: unknown, n: number) =>
        typeof v === "string" && v.trim() !== "" ? v.slice(0, n) : undefined;
      const profile = {
        nickname: s(nickname, 40),
        career: s(career, 60),
        bio: s(bio, 300),
        character: s(character, 20),
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
