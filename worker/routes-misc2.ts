// Cloudflare Worker 이관 = 미이관 A등급 2건 (2026-09-06)
// 원본 = server/expert-routes.ts:358 · server/admin/misc-routes.ts:7.
// 응답·상태코드·에러문구는 원본과 동일하게 옮겼다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, isNotNull, lt, or, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const { guides, userProviders, users } = schema;

// 연결 1벌 = 반드시 close.
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

/** 원본 server/auth-user.ts:8 의 정규식 1벌(그 파일은 server/db.ts 를 딸고 와 번들 불가). */
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

/** 원본 server/auth-user.ts:16 getRoleFromDb = creditService.getUserProfile().role */
async function getRole(db: Db, userId: string): Promise<string> {
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return u?.role || "user";
}

/** 원본 server/services/account-cleanup.ts:8 CleanupResult (키 이름 = 한국어 그대로). */
type CleanupResult = {
  대상계정: number;
  정리완료: number;
  보류: number;
  삭제한사진: number;
  실패한사진: number;
};

/** 원본 server/services/account-cleanup.ts:6 GRACE_MONTHS */
const GRACE_MONTHS = 6;

const EMPTY_CLEANUP: CleanupResult = {
  대상계정: 0,
  정리완료: 0,
  보류: 0,
  삭제한사진: 0,
  실패한사진: 0,
};

/** 원본 r2-client.ts:33. 이 5종은 api_keys 가 아닌 Replit Secrets 뿐(server/index.ts:306). */
function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

/** 원본 server/services/account-cleanup.ts:23 cleanupDeletedAccounts. */
async function cleanupDeletedAccounts(db: Db): Promise<CleanupResult> {
  if (!isR2Configured()) {
    console.warn("[정리] R2 미설정 = 이번 정리 건너뜀(사진을 지울 수 없음)");
    return { ...EMPTY_CLEANUP };
  }

  // 원본:33 = 기준은 last_login_at(탈퇴 후 재로그인한 계정은 제외).
  const targets = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.accountStatus, "deleted"),
        isNotNull(users.deletedAt),
        lt(
          users.deletedAt,
          sql`now() - (${GRACE_MONTHS} * INTERVAL '1 month')`,
        ),
        or(
          isNull(users.lastLoginAt),
          sql`${users.lastLoginAt} <= ${users.deletedAt}`,
        ),
      ),
    );
  const ids = targets.map((r) => r.id);
  if (ids.length === 0) return { ...EMPTY_CLEANUP };

  // 원본:49 = 공개 URL 의 guides/ 프리픽스로 본인 업로드 사진만 고른다.
  const guidesPrefix = `${(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/guides/`;

  let removed = 0;
  const failed = 0;
  let done = 0;
  const held = 0;

  for (const userId of ids) {
    const personal = await db
      .select({ id: guides.id, imageUrl: guides.imageUrl })
      .from(guides)
      .where(
        and(
          eq(guides.userId, userId),
          isNotNull(guides.imageUrl),
          sql`${guides.imageUrl} LIKE ${guidesPrefix + "%"}`,
        ),
      );

    // ⚠️ 원본:61 의 R2 실제 삭제는 Worker 에서 못 한다(위 조기 반환으로 도달 불가).
    removed += personal.length;

    await db
      .delete(guides)
      .where(
        and(
          eq(guides.userId, userId),
          isNotNull(guides.imageUrl),
          sql`${guides.imageUrl} LIKE ${guidesPrefix + "%"}`,
        ),
      );
    await db.delete(userProviders).where(eq(userProviders.userId, userId));
    await db
      .update(users)
      .set({
        displayName: null,
        email: null,
        birthDate: null,
        profileImageUrl: null,
        providerId: null,
        provider: null,
        accountStatus: "purged",
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    done++;
  }

  console.log(
    `[정리] 유예만료 ${ids.length}명 = 완료 ${done} / 보류 ${held} (사진 삭제 ${removed}장, 실패 ${failed}장)`,
  );
  return {
    대상계정: ids.length,
    정리완료: done,
    보류: held,
    삭제한사진: removed,
    실패한사진: failed,
  };
}

export function registerMisc2Routes(app: Express, openDb: OpenDb): void {
  // 원본 server/expert-routes.ts:358 (같은 경로의 /me 는 GET 뿐이라 메서드가 겹치지 않는다).
  app.patch("/api/expert/profile", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const authId = getUserIdFromReq(req);
      if (!authId) return res.status(401).json({ error: "login_required" });
      const role = await getRole(db, authId);
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
      const [u] = await db
        .update(users)
        .set({ expertProfile: profile })
        .where(eq(users.id, authId))
        .returning({ profile: users.expertProfile });
      res.json({ success: true, profile: u?.profile || null });
    } catch (e) {
      console.error("[Expert] 프로필 저장 실패:", (e as Error)?.message);
      res.status(500).json({ error: "Failed to save profile" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **탈퇴 유예 만료 계정 즉시 정리**(관리자 버튼).
  // 원본 server/admin/misc-routes.ts:7
  app.post(
    "/api/admin/account-cleanup",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const uid = getUserIdFromReq(req);
        if (!uid) return res.status(401).json({ error: "login_required" });
        if ((await getRole(db, uid)) !== "admin")
          return res.status(403).json({ error: "admin_only" });

        const result = await cleanupDeletedAccounts(db);
        res.json({ success: true, ...result });
      } catch (error) {
        console.error(
          "[Admin] 탈퇴 계정 정리 실패:",
          (error as Error)?.message || error,
        );
        res.status(500).json({ success: false, error: "cleanup_failed" });
      } finally {
        close();
      }
    },
  );
}
