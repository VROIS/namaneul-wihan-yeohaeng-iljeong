// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **탈퇴 6개월 뒤 정리 = 이 함수 1벌.**
import { db } from "../db";
import { sql } from "drizzle-orm";
import { deleteFromR2, isR2Configured } from "./shared/r2-client";

const GRACE_MONTHS = 6;

export type CleanupResult = {
  대상계정: number;
  정리완료: number;
  보류: number; // 사진을 못 지워 다음 실행으로 미룬 계정 (로그에 숨지 않게 분리 = §22 판단검증 4차)
  삭제한사진: number;
  실패한사진: number;
};

function r2KeyFromUrl(url: string | null): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!url || !base || !url.startsWith(base)) return null;
  const key = url.slice(base.length).replace(/^\/+/, "");
  return key || null;
}

export async function cleanupDeletedAccounts(): Promise<CleanupResult> {
  const d: any = db;
  if (!d)
    return { 대상계정: 0, 정리완료: 0, 보류: 0, 삭제한사진: 0, 실패한사진: 0 };

  if (!isR2Configured()) {
    console.warn("[정리] R2 미설정 = 이번 정리 건너뜀(사진을 지울 수 없음)");
    return { 대상계정: 0, 정리완료: 0, 보류: 0, 삭제한사진: 0, 실패한사진: 0 };
  }

  //    ⚠️ 수정금지(승인필요) 2026-08-08 §22 판단검증(3차) = 기준은 **last_login_at** 이다.
  const targets: any = await d.execute(sql`
    SELECT id FROM users
    WHERE account_status = 'deleted'
      AND deleted_at IS NOT NULL
      AND deleted_at < now() - (${GRACE_MONTHS} * INTERVAL '1 month')
      AND (last_login_at IS NULL OR last_login_at <= deleted_at)`);
  const ids: string[] = (targets.rows ?? targets).map((r: any) => r.id);
  if (ids.length === 0)
    return { 대상계정: 0, 정리완료: 0, 보류: 0, 삭제한사진: 0, 실패한사진: 0 };

  let removed = 0;
  let failed = 0;
  let done = 0;
  let held = 0;

  const guidesPrefix = `${(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/guides/`;

  for (const userId of ids) {
    //    ⚠️ 수정금지(승인필요) 2026-08-08 §22 판단검증(4차) = 옛 장소번호 기반 판정 폐기 = 2026-08-08 §19.
    const rows: any = await d.execute(sql`
      SELECT id, image_url FROM guides
      WHERE user_id = ${userId}
        AND image_url IS NOT NULL
        AND image_url LIKE ${guidesPrefix + "%"}`);
    const personal = rows.rows ?? rows;

    let failedHere = 0;
    for (const g of personal) {
      const key = r2KeyFromUrl(g.image_url);
      if (!key) continue; // 프리픽스로 걸렀으니 사실상 없음(방어)
      try {
        await deleteFromR2(key);
        removed++;
      } catch (e: any) {
        failed++;
        failedHere++;
        console.warn(`[정리] R2 사진 삭제 실패 ${key}: ${e?.message}`);
      }
    }

    // ⚠️ 수정금지(승인필요) 2026-08-08 §22 판단검증 = **한 장이라도 못 지웠으면 DB 를 건드리지 않는다.**
    if (failedHere > 0) {
      held++;
      console.warn(
        `[정리] ${userId} = 사진 ${failedHere}장 삭제 실패 → DB 정리 보류(다음 실행에서 재시도)`,
      );
      continue;
    }

    await d.execute(sql`
      DELETE FROM guides
      WHERE user_id = ${userId}
        AND image_url IS NOT NULL
        AND image_url LIKE ${guidesPrefix + "%"}`);
    await d.execute(sql`DELETE FROM user_providers WHERE user_id = ${userId}`);
    await d.execute(sql`
      UPDATE users SET
        display_name = NULL, email = NULL, birth_date = NULL,
        profile_image_url = NULL, provider_id = NULL, provider = NULL,
        account_status = 'purged', deleted_at = NULL,
        updated_at = now()
      WHERE id = ${userId}`);
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
