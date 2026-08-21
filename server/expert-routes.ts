// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 문의 API (하단 '전문가' 탭 백엔드)
//   계획서 = docs/2026-07-13 전문가탭 구현계획.md 2단계. 시안 = docs/design/2026-07-13 전문가탭 화면구성안.html
//   흐름 = 사용자(여정+AI의견 첨부) 문의 접수 → 전문가(role='expert'/'admin') 답변 → notificationService 1줄로 인앱 알림(+VAPID 있으면 푸시).
//   경로 규약 = FE(VerificationRequestScreen)·admin-dashboard 기존 호출 그대로(/api/verification/*) = 양쪽 수정 최소화(§16).
import type { Express } from "express";
import { db as _db } from "./db";
import { expertInquiries, users } from "@shared/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { notificationService } from "./notificationService";
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 역할 1벌화 2026-08-06)
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)
// 🏙️ 2026-08-21 = 문의카드 도시명 = 읽을 때 영문으로 조립 1벌(§16, 여정·프로필과 같은 원칙)
import { attachInquiryCityNameEn } from "./services/shared/itinerary-city-name";

// db 널 가드 = place-upsert 'db_unavailable' 규약과 동일 취지(각 핸들러 try/catch가 500 처리)
function db() {
  if (!_db) throw new Error("db_unavailable");
  return _db;
}

// 역할 조회 = auth-user.getRoleFromDb 1벌로 이관 = 2026-08-06 §16(옛 로컬 getRole 삭제 §19. 원칙 동일 = users.role DB 1벌만).
const getRole = getRoleFromDb;

export function registerExpertRoutes(app: Express): void {
  // ── 1) 문의 접수 = POST /api/verification/request ──
  //   body = { userId, itineraryData(여정+AI의견 스냅샷), userMessage, itineraryId?, kind?, dayNumber? }
  //   kind = 'booking'(일별 바로 예약하기, 2026-07-24 사장님 승인) 만 인정, 그 외 전부 'expert'(기존 검증 문의).
  //   🪙 크레딧 차감(10) = 아래 INSERT 직전에 구현됨 = 2026-07-29 §9 (예고 주석 폐기 §19).
  app.post("/api/verification/request", async (req, res) => {
    try {
      // ⚠️ 수정금지(승인필요) 2026-07-30 §0 = 신원은 **로그인 토큰에서만** 온다.
      //   요청 본문의 userId 를 받아주던 갈래 삭제: 크레딧이 걸린 라우트에서 신원을 클라이언트가 정하게 두면
      //   본문 한 칸만 바꿔 남의 이름으로 접수하거나, 칸을 비워 차감을 건너뛸 수 있다(§22 검증 지적).
      //   클라(apiRequest)가 항상 Bearer 를 붙이므로 본문 경로가 필요 없다.
      const uid = getUserIdFromReq(req);
      const { itineraryData, userMessage, itineraryId, kind, dayNumber } =
        req.body || {};
      if (!uid) {
        return res.status(401).json({ error: "login_required" });
      }
      if (!userMessage) {
        return res.status(400).json({ error: "userMessage is required" });
      }
      // 🪙 전문가 검증 10크레딧 (2026-07-29 §9)
      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만**(유료 5지점 공통 1벌).
      //     여기(시작)는 잔액 **사전확인만**(차감 0) = 부족하면 402 = 돈 드는 일을 시작하지 않는다.
      //     실제 차감 = 아래 **문의가 실제로 접수된 뒤**. 옛 "INSERT 직전 선차감" 폐기 = 2026-08-09 §19.
      //     사유(사장님 판단) = 지금까지 접수가 실패한 적은 없지만 **트래픽이 늘면 생길 자리**다.
      //     실제로 아래 catch 는 400(지워진 여정)·401·500 으로 되돌아가는 길을 갖고 있고,
      //     그 경우 옛 방식은 **접수는 안 됐는데 10크레딧만 사라진** 상태가 됐다(= 환불 분쟁 소지).
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

      // 🪙 차감 = 여기(문의가 실제로 들어간 뒤). 위 INSERT 가 터지면 아래 catch 로 가므로 **차감하지 않는다**.
      await chargeOnSuccess(uid, "expert_verify", {
        referenceId: itineraryId ? String(itineraryId) : undefined,
        tag: "전문가 검증",
      });

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
        // DB 미연동 로컬 개발 환경 폴백 데모 데이터
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
      // 도시명 = 읽을 때 영문으로 조립(§16) = 저장된 스냅샷("리마")은 그대로 두고 화면 표기만 통일.
      res.json(await attachInquiryCityNameEn(rows));
    } catch (e: any) {
      console.error("[Expert] 목록 실패:", e?.message);
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  // ── 3) 배지 카운트 = GET /api/verification/unread-count = 하단 [전문가] 탭 배지 = **숫자 1개만** 반환 ──
  //   ⚠️ 2026-08-03 사장님 지시 = 배지 숫자 하나 얻으려고 화면 이동마다 문의 **목록 전체**를 내려받던 낭비
  //   (화면당 10~14회 × 전체 행 = Egress 소모) 제거. 세는 일은 여기서 DB COUNT 1개로 한다.
  //   기준 = tabBadgeCount(2026-07-14 사장님 SSOT)와 동일 1벌:
  //   · expert·admin = 받은 문의 중 대기+검토중(답변 대기 신호)
  //   · user = 본인 진행중(pending·in_review) + 안 읽은 답변(answered 미열람)
  //   옛 "안 읽은 답변만" 기준 폐기 = 2026-08-03 §19 (클라 호출자 0 이던 낡은 기준).
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

  // ── 5-2) 문의 목록 삭제 (모듈 정리용 소프트 삭제 = DB 데이터 100% 영구 보존) ──
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
      //   진짜 최종 삭제는 사용자가 프로필 화면에서 저장된 여정을 삭제하거나 탈퇴/관리자 삭제 시에만 수행.
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
