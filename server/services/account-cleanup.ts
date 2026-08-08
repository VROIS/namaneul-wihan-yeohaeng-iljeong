// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **탈퇴 6개월 뒤 정리 = 이 함수 1벌.**
//
// 무엇을 지우고 무엇을 남기는가 (사장님 SSOT):
//   남긴다 = 여정 · 담은 영상 · **우리 재료로 만든 해설**  → 회사 자산
//   지운다 = **개인이 직접 찍은 사진** + 그 R2 파일 + 개인정보 칸
//
//   ⚠️ 구분 기준 = **image_url 이 `{R2_PUBLIC_URL}/guides/` 로 시작하는가**(= 개인 사진 전용 폴더).
//     장소번호 기반 옛 기준 폐기 = 2026-08-08 §19 — 그 칸이 2026-08-02 에 생겨서
//     그 전 해설은 **공용 장소 사진으로 만든 것도 place_id 가 비어 있다**(실측 41건 중 2건이 place-images).
//     그 기준으로 지우면 전 사용자가 보는 **공용 장소 사진이 영구 삭제**된다(§ DB=원재료 창고 위반).
//
// ⚠️ users 행 자체는 지우지 않는다. guides.user_id 가 CASCADE 라(credits.ts:34)
//    행을 지우면 **창고 해설까지 딸려 사라진다** = 남들이 보던 해설이 없어진다.
//    대신 개인정보 칸만 비운다 = 누구인지 알 수 없게 되고(익명화), 연쇄삭제도 안 터진다.
//
// 부르는 곳 2군데(함수는 1벌) = ① data-scheduler 자동 ② 관리자 화면 버튼(즉시 실행·검증용).
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

/** R2 공개주소에서 열쇠(키)만 뽑는다. 우리 주소가 아니면 null = 건드리지 않는다. */
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

  // ⚠️ 2026-08-08 §22 판단검증(3차) = 저장소 설정이 없으면 **아예 시작하지 않는다.**
  //   사유: 사진을 못 지우는데 DB 부터 지우면 주소를 잃어 영영 못 지운다. 다음 실행 때 다시 하면 된다.
  //   검사 = 이미 있는 단일 진입점 재사용(§16 = env 검사 재발명 금지).
  if (!isR2Configured()) {
    console.warn("[정리] R2 미설정 = 이번 정리 건너뜀(사진을 지울 수 없음)");
    return { 대상계정: 0, 정리완료: 0, 보류: 0, 삭제한사진: 0, 실패한사진: 0 };
  }

  // 1) 유예가 끝난 계정 = 탈퇴 표시 + 탈퇴시각이 6개월보다 오래됨 + **탈퇴 뒤 로그인한 적 없음**
  //    ⚠️ 수정금지(승인필요) 2026-08-08 §22 판단검증(3차) = 기준은 **last_login_at** 이다.
  //      옛 갱신시각 기반 조건 폐기 = 2026-08-08 §19 — updateUserLogin(storage.ts:192)이 그 값을 **일부러 떼어내고**
  //      저장해 로그인해도 그 값이 안 바뀐다 = 늘 참이 되는 죽은 조건("되는 척하는 안전장치")이었다.
  //      last_login_at 은 로그인마다 실제로 갱신되므로, 재로그인한 사람은 여기서 걸러진다
  //      (재로그인하면 applyLogin 이 account_status 를 'active' 로 되돌려 애초에 대상에서 빠진다).
  //    ⚠️ 알려진 한계(정직 명시) = 토큰은 폐기되지 않으므로 **재로그인 없이** 옛 토큰으로 6개월 내내 쓰는 기기는
  //      이 조건으로 못 거른다. 토큰에 만료가 생기면 자연히 해소된다.
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
    // 2) 그 사람이 **직접 찍은 사진**만 고른다 = 주소가 우리 개인사진 폴더(guides/)인 것.
    //    ⚠️ 수정금지(승인필요) 2026-08-08 §22 판단검증(4차) = 옛 장소번호 기반 판정 폐기 = 2026-08-08 §19.
    //      사유(실측): place_id 칸은 2026-08-02 에 생겼다. 그 전에 만든 해설은 **우리 DB 장소 사진으로 만든 것도
    //      전부 place_id 가 비어 있고**, 그 image_url 은 `place-images/...` = **전 사용자가 보는 공용 사진**이다.
    //      실측 = place_id 없는 해설 41건 중 2건이 place-images 를 가리켰다 → 옛 판정으로는 그 **공용 장소 사진이
    //      영구 삭제**됐다(§ DB=원재료 창고 위반). 주소 프리픽스로 보면 개인·공용이 정확히 갈린다.
    const rows: any = await d.execute(sql`
      SELECT id, image_url FROM guides
      WHERE user_id = ${userId}
        AND image_url IS NOT NULL
        AND image_url LIKE ${guidesPrefix + "%"}`);
    const personal = rows.rows ?? rows;

    // 3) R2 파일 먼저 지운다(주소를 잃기 전에). 한 장 실패해도 나머지는 계속.
    //    ⚠️ 2026-08-08 §22 판단검증(3차) = **주소를 못 알아본 것도 '실패'로 센다.**
    //      조용히 넘기던 옛 처리 폐기 = 2026-08-08 §19 — R2_PUBLIC_URL 이 없거나 다른 저장소 주소면
    //      전부 null 이 되어 실패 0으로 집계되고, 아래 보호가 안 걸린 채 DB 만 지워져 **영구 고아 파일**이 됐다.
    //    위 SELECT 가 이미 guides/ 프리픽스만 뽑았으므로 열쇠는 항상 나온다 = 남는 실패는 **통신 실패뿐**(재시도 의미 있음).
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
    //   사유: DB 행에는 사진 주소가 들어 있다. 행을 먼저 지우면 **주소를 잃어 다시는 못 지우는 고아 파일**이 된다
    //        (예: 배포에 R2 열쇠가 빠지면 전부 실패 → 사진은 남고 주소만 사라짐 = 화면 약속 위반).
    //   그대로 두면 다음 실행에서 다시 시도한다(account_status='deleted' 유지 = 대상에 계속 걸림).
    if (failedHere > 0) {
      held++;
      console.warn(
        `[정리] ${userId} = 사진 ${failedHere}장 삭제 실패 → DB 정리 보류(다음 실행에서 재시도)`,
      );
      continue;
    }

    // 4) 개인 사진 해설 행 삭제 + 개인정보 칸 비우기 + **끝났다 표시**
    //    ⚠️ 2026-08-08 §22 판단검증 = account_status='purged' 로 바꾸지 않으면
    //       위 1) SELECT 에 **매일 또 걸려** 같은 계정을 영구히 재처리한다(그 사람이 새로 찍은 사진까지 계속 삭제).
    //    ⚠️ 지우는 기준 = 위 SELECT 와 **같은 조건 1벌**(주소가 guides/ 인 것만).
    //      다른 기준으로 지우면 공용 장소 사진으로 만든 해설(회사 자산)까지 사라진다 = 폐기 2026-08-08 §19.
    await d.execute(sql`
      DELETE FROM guides
      WHERE user_id = ${userId}
        AND image_url IS NOT NULL
        AND image_url LIKE ${guidesPrefix + "%"}`);
    // 소셜 신원도 끊는다 = 안 끊으면 같은 구글·카카오로 그 계정에 다시 들어와진다
    //   (화면 문구 "회원 정보가 완전히 삭제됩니다" 와 어긋남 = §22 판단검증 지적).
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
