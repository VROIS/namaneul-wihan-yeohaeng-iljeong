// ⚠️ 수정금지(승인필요) 2026-07-05 사용자 SSOT(헌법 제14조) = place_seed_raw INSERT/UPDATE 유일 진입점, 7단계 매칭(1~5순위 자동병합/6·7순위 의심메모), UPDATE는 새값 우선+tags UNION — 상세 경위는 정본문서
import { db } from "../db";
import { placeSeedRaw } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { type MatchedBy, properKeys } from "./shared/place-enrich";

export interface UpsertPayload {
  cityId: number;
  seedCategory: string; // 'restaurant' | 'attraction' | 'heritage' | ...
  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = rowId 직행 UPDATE(#45 repair.ts WHERE id=$1 방식).
  targetRowId?: number | null;
  // ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = targetRowId 직행이 트리거 '[중복차단] id=N' 판정을 받으면 그 원행(N)으로 병합(회수)할지 opt-in.
  followTriggerDup?: boolean;
  dupCheckOnWrite?: boolean;
  // 🗑️ 2026-07-07 개정헌법(사장님) = rank 필드 삭제 §19 = upsertPlace 는 랭킹을 받지도·넣지도 않음. 랭킹은 DB autorank 트리거(RC순)가 전담.
  googlePlaceId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nameEn?: string | null;
  nameKo?: string | null;
  nameLocal?: string | null;
  selectionReasonKo?: string | null; // → summary_ko
  shortformKo?: string | null; // → editorial_summary
  googleReviewCount?: number | null;
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 영업상태(OPERATIONAL | CLOSED_PERMANENTLY | CLOSED_TEMPORARILY) → business_status. gmaps-pid-identity 가 구글맵 페이지에서 읽어 채움 = 서빙 관문이 폐업행을 제외할 근거.
  businessStatus?: string | null;
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 무엇으로 확인했는지(예: 'gmaps-pid-page'). 넘기면 verified_at 이 그 시각으로 찍힌다 = 태그 대신 포렌식 근거.
  verifySource?: string | null;
  googlePrimaryType?: string | null;
  googleMapsUri?: string | null; // 2026-05-15 = 13번째 SSOT = 최후의 보루
  priceEur?: number | null;
  imageUrl?: string | null;
  imageAttribution?: string | null;
  dayZone?: string | null;
  distanceKmFromCenter?: number | null;
  categoryTags?: string[];
  phaseTags?: string[];
  // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 좌표 쓰기 보호 = true 면 기존 행 좌표(NULL·0 제외)를 유지하고 빈칸·0만 채움.
  preserveExistingCoords?: boolean;
  // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 흡수(있는 행 직행) 때 원행의 이름·요약은 지키고 빈 칸만 채운다 = 뒤에 온 제미니 표기가 원행 이름을 갈아치워 다음 판 알아보기가 깨지던 병(매직 워터·아르마스 광장 실측).
  preserveExistingNames?: boolean;
  // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 이번 호출이 방금 만든 행인가 = PID 쌍둥이 흡수 때 지워도 되는지(껍데기) / 남겨야 하는지(원래 있던 행)의 유일한 기준.
  rowIsNew?: boolean;
}

export type { MatchedBy };

export interface UpsertResult {
  action: "inserted" | "updated" | "skipped";
  rowId: number | null;
  matchedBy: MatchedBy;
  suspect?: boolean;
  reason?: string;
  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌 폐기 재설계 = 트리거 흡수(recoverTriggerDup) 시 원행의 재활용 데이터(RETURNING).
  enriched?: {
    imageUrl: string | null;
    googleReviewCount: number | null;
    nameKo: string | null;
    nameLocal: string | null;
    summaryKo: string | null;
    editorialSummary: string | null;
    googlePlaceId: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

// ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = 직행 UPDATE SQL 1벌(§16) = targetRowId 직행·회수 병합 공용.
function buildDirectUpdateSql(p: UpsertPayload, targetId: number) {
  const catTags =
    p.categoryTags && p.categoryTags.length > 0
      ? p.categoryTags
      : [p.seedCategory];
  const phTags = p.phaseTags || [];
  return sql`
      UPDATE place_seed_raw SET
        name_en       = ${p.preserveExistingNames ? sql`COALESCE(NULLIF(name_en, ''), ${p.nameEn ?? null}, name_en)` : sql`COALESCE(${p.nameEn ?? null}, name_en)`},
        name_ko       = ${p.preserveExistingNames ? sql`COALESCE(NULLIF(name_ko, ''), ${p.nameKo ?? null}, name_ko)` : sql`COALESCE(${p.nameKo ?? null}, name_ko)`},
        name_local    = ${p.preserveExistingNames ? sql`COALESCE(NULLIF(name_local, ''), ${p.nameLocal ?? null}, name_local)` : sql`COALESCE(${p.nameLocal ?? null}, name_local)`},
        latitude      = ${p.preserveExistingCoords ? sql`COALESCE(NULLIF(latitude, 0), ${p.latitude ?? null}::real, latitude)` : sql`COALESCE(${p.latitude ?? null}::real, latitude)`},
        longitude     = ${p.preserveExistingCoords ? sql`COALESCE(NULLIF(longitude, 0), ${p.longitude ?? null}::real, longitude)` : sql`COALESCE(${p.longitude ?? null}::real, longitude)`},
        address       = COALESCE(${p.address ?? null}, address),
        google_place_id = COALESCE(${p.googlePlaceId ?? null}, google_place_id),
        google_review_count = COALESCE(${p.googleReviewCount ?? null}::integer, google_review_count),
        business_status = COALESCE(${p.businessStatus ?? null}, business_status),
        google_primary_type = COALESCE(${p.googlePrimaryType ?? null}, google_primary_type),
        google_maps_uri = COALESCE(${p.googleMapsUri ?? null}, google_maps_uri),
        image_url     = COALESCE(${p.imageUrl ?? null}, image_url),
        image_attribution = COALESCE(${p.imageAttribution ?? null}, image_attribution),
        price_eur     = COALESCE(${p.priceEur ?? null}::real, price_eur),
        editorial_summary = ${p.preserveExistingNames ? sql`COALESCE(NULLIF(editorial_summary, ''), ${p.shortformKo ?? null}, editorial_summary)` : sql`COALESCE(${p.shortformKo ?? null}, editorial_summary)`},
        summary_ko        = ${p.preserveExistingNames ? sql`COALESCE(NULLIF(summary_ko, ''), ${p.selectionReasonKo ?? null}, summary_ko)` : sql`COALESCE(${p.selectionReasonKo ?? null}, summary_ko)`},
        day_zone          = COALESCE(${p.dayZone ?? null}, day_zone),
        distance_km_from_center = COALESCE(${p.distanceKmFromCenter ?? null}::real, distance_km_from_center),
        category_tags     = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(category_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${catTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`)}))),
        phase_tags        = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ${sql.raw(`ARRAY[${phTags.length === 0 ? "" : phTags.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`)}))),
        -- ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 사진 시각은 **사진이 실제로 바뀔 때만** 찍는다. 같은 URL 을 다시 넘겨도 갱신하면 "언제 받은 사진인지"가 거짓이 된다(재링크가 기존 URL 을 재전달하는 경우).
        image_updated_at  = CASE WHEN ${p.imageUrl || null}::text IS NOT NULL AND ${p.imageUrl || null}::text IS DISTINCT FROM image_url THEN NOW() ELSE image_updated_at END,
        -- ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 검증 이력은 태그가 아니라 이 두 칸 = 언제(초 단위) 무엇으로 확인했는지. 태그는 날짜뿐이고 날짜별로 쌓여 최신 판별이 안 된다.
        verify_source     = COALESCE(${p.verifySource ?? null}, verify_source),
        verified_at       = CASE WHEN ${p.verifySource ?? null}::text IS NOT NULL THEN NOW() ELSE verified_at END,
        updated_at        = NOW()
      WHERE id = ${targetId}
      -- ⚠️ 2026-07-18 = 흡수(트리거 dup)·직행 UPDATE 후 그 행의 재활용 데이터 반환 = 매칭 폐기 후 place 재활용(§16 매칭 대체).
      RETURNING image_url, google_review_count, name_ko, name_local, summary_ko, editorial_summary, google_place_id, latitude, longitude
    `;
}

// ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 트리거(prevent_dup=최종 매처)의 '[중복차단] id=N' 회수 1벌(§0/§16).
//   = 승자 = 트리거가 지목한 N(재판정 없음 = 트리거가 이미 목적지 판단, 사장님 2026-07-17). 재시도는 followTriggerDup:false = 또 막히면 skip(무한루프 불가).
async function recoverTriggerDup(
  p: UpsertPayload,
  e: any,
): Promise<UpsertResult | null> {
  const dup = /\[중복차단\][^]*?id=(\d+)/.exec(e?.message || "");
  if (!dup) return null;
  const dupId = Number(dup[1]);
  try {
    // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 흡수 안전장치(창고문틀 교정) = 매칭 판정·흡수 동작은 그대로,
    if (db) {
      try {
        const cur = (
          await db.execute(
            sql`SELECT name_en, name_local, name_ko, google_place_id, image_url, google_review_count, latitude, longitude, summary_ko, editorial_summary FROM place_seed_raw WHERE id = ${dupId}`,
          )
        ).rows?.[0] as any;
        if (cur) {
          const oldKeys = properKeys({
            nameEn: cur.name_en,
            nameLocal: cur.name_local,
            nameKo: cur.name_ko,
          });
          const newKeys = properKeys({
            nameEn: p.nameEn,
            nameLocal: p.nameLocal,
            nameKo: p.nameKo,
          });
          const overlap = [...newKeys].some((k) => oldKeys.has(k));
          if (oldKeys.size > 0 && newKeys.size > 0 && !overlap) {
            console.warn(
              `[UPSERT] ⚠️ 이름 불일치 흡수 = id=${dupId} 기존="${cur.name_en}" ← 새job="${p.nameEn}" (고유명사 키 안 겹침) = name-mismatch-absorbed 태그 부착`,
            );
            p = {
              ...p,
              phaseTags: [...(p.phaseTags || []), "name-mismatch-absorbed"],
            };
          }
          // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(비판검증 확정결함 수정 = 옛 2026-08-17 "PID만 있으면 무조건 스킵" 폐기 §19).
          if (cur.google_place_id) {
            const sib = (
              await db.execute(
                sql`SELECT id FROM place_seed_raw WHERE google_place_id = ${cur.google_place_id} AND id <> ${dupId} LIMIT 1`,
              )
            ).rows?.[0] as any;
            if (sib) {
              console.log(
                `[UPSERT] ✅ PID 형제중복(id=${sib.id}) 존재 = id=${dupId} 쓰기 불가(불변1) = 링크만`,
              );
              return {
                action: "updated",
                rowId: dupId,
                matchedBy: "pid",
                reason: "trigger_dup_recovered_skip_write_pid_sibling",
                enriched: {
                  imageUrl: cur.image_url ?? null,
                  googleReviewCount: cur.google_review_count ?? null,
                  nameKo: cur.name_ko ?? null,
                  nameLocal: cur.name_local ?? null,
                  summaryKo: cur.summary_ko ?? null,
                  editorialSummary: cur.editorial_summary ?? null,
                  googlePlaceId: cur.google_place_id ?? null,
                  latitude: cur.latitude != null ? Number(cur.latitude) : null,
                  longitude:
                    cur.longitude != null ? Number(cur.longitude) : null,
                },
              };
            }
          }
        }
      } catch (checkErr) {
        console.warn(
          "[UPSERT] 이름불일치 확인 중 오류(흡수는 계속 진행):",
          (checkErr as Error)?.message,
        );
      }
    }
    const r = await upsertPlace({
      ...p,
      targetRowId: dupId,
      followTriggerDup: false,
    });
    return { ...r, reason: "trigger_dup_recovered" };
  } catch (e2: any) {
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: `trigger_dup_recover_failed: ${e2?.message || String(e2)}`,
    };
  }
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 지우기 전에 그 행이 가진 것(번역·동의 등급·가리키는 곳)을 남는 행으로 먼저 옮긴다(status-backfill 과 같은 순서) = 값이 든 행이 그냥 사라지지 않게.
//   ⚠️ 전부 **한 트랜잭션 + 통과증(app.skip_dup_check)** 안에서 한다. 통과증 없이 하면 keep 행 UPDATE 가 문지기 불변1(PID 일치)에 걸려 EXCEPTION → 흡수가 통째로 실패하고 그 행이 삭제된다(2026-09-09 실측 = 중복 PID 3그룹 3/3 전부 "[중복차단] 불변1 PID 일치"). 한 트랜잭션인 이유 = 중간에 끊기면 소유물이 절반만 옮겨진다.
async function moveBelongingsTo(keepId: number, loserId: number) {
  if (!db) return;
  const { bestRankUnion } = await import("./shared/best-rank");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.skip_dup_check', 'on', true)`);
    await tx.execute(
      sql`INSERT INTO place_translations (place_id, language, summary, editorial_summary)
        SELECT ${keepId}, language, summary, editorial_summary
          FROM place_translations WHERE place_id = ${loserId}
        ON CONFLICT (place_id, language) DO NOTHING`,
    );
    const lose: any = (
      await tx.execute(
        sql`SELECT best_rank FROM place_seed_raw WHERE id = ${loserId}`,
      )
    ).rows?.[0];
    if (lose?.best_rank != null) {
      const keep: any = (
        await tx.execute(
          sql`SELECT best_rank FROM place_seed_raw WHERE id = ${keepId}`,
        )
      ).rows?.[0];
      const cur = keep?.best_rank == null ? null : Number(keep.best_rank);
      const merged = bestRankUnion(cur, Number(lose.best_rank));
      if (merged !== cur)
        await tx.execute(
          sql`UPDATE place_seed_raw SET best_rank = ${merged} WHERE id = ${keepId}`,
        );
    }
    await tx.execute(
      sql`UPDATE guides SET place_id = ${keepId} WHERE place_id = ${loserId}`,
    );
    await tx.execute(
      sql`UPDATE cities SET override_hero_place_id = ${keepId} WHERE override_hero_place_id = ${loserId}`,
    );
    await tx.execute(
      sql`UPDATE cities SET override_highlight_place_ids = array_replace(override_highlight_place_ids, ${loserId}, ${keepId}) WHERE ${loserId} = ANY(override_highlight_place_ids)`,
    );
    await tx.execute(
      sql`UPDATE place_seed_raw SET merged_into = ${keepId} WHERE merged_into = ${loserId} AND id <> ${keepId}`,
    );
    await tx.execute(sql`RESET app.skip_dup_check`);
  });
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 신분(PID·리뷰) 못 갖춘 새 행은 창고에 남기지 않는다 = 삭제 1벌(번역·R2 사진 포함). MIX 가 TS 오배송·빈 페이지·좌표이탈로 못 채운 행에 쓴다.
export async function deletePlaceRow(
  rowId: number,
  opts?: { keepImageUrl?: string | null; alsoDeleteUrl?: string | null },
): Promise<void> {
  if (!db) return;
  const r: any = (
    await db.execute(
      sql`SELECT image_url FROM place_seed_raw WHERE id = ${rowId}`,
    )
  ).rows?.[0];
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`DELETE FROM place_translations WHERE place_id = ${rowId}`,
    );
    await tx.execute(sql`DELETE FROM place_seed_raw WHERE id = ${rowId}`);
  });
  // 행에 쓰여 있던 사진 + (있으면) 행에 못 쓰고 올라간 고아 사진. 흡수한 원행이 물려받은 사진은 빼고 지운다.
  await deleteR2Photos([r?.image_url, opts?.alsoDeleteUrl], opts?.keepImageUrl);
}

// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 주소 → R2 키 되돌리기 1벌(§16) = getR2PublicUrl 이 `${base}/${key}` 로 인코딩 없이 붙이므로 되돌릴 때도 그냥 자른다(디코딩하면 Café 같은 키가 어긋나 삭제가 조용히 빗나감).
async function deleteR2Photos(
  urls: (string | null | undefined)[],
  keepUrl?: string | null,
): Promise<void> {
  const r2pub = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!r2pub) return;
  const keys = new Set(
    urls
      .map((u) => (u == null ? "" : String(u)))
      .filter((u) => u && u !== keepUrl && u.startsWith(r2pub))
      // 자리수로 자르지 않고 접두어만 떼고 남은 슬래시를 지운다(R2_PUBLIC_URL 끝에 슬래시가 있어도 키가 안 어긋난다).
      .map((u) => u.slice(r2pub.length).replace(/^\/+/, "")),
  );
  if (!keys.size) return;
  const { deleteFromR2 } = await import("./shared/r2-client");
  for (const k of keys) await deleteFromR2(k).catch(() => {});
}

export async function upsertPlace(p: UpsertPayload): Promise<UpsertResult> {
  if (!db) {
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: "db_unavailable",
    };
  }
  if (!p.cityId || !p.seedCategory || !p.nameEn) {
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: "missing_required_fields",
    };
  }

  // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = PID 를 처음 받는 행에 TS PID 를 쓸 때 불변1(PID 일치)에 막히면 그 원행으로 흡수하고 **자기 행(껍데기)은 삭제**한다. 옛 "merged 로 남김(삭제 0)" 폐기 §19 = 껍데기가 남아 다음 매칭을 가로채 오염(2026-09-09 리마 MIX 11행 실측). 이미 PID 있는 확정행 직행은 면제 그대로.
  if (p.targetRowId != null) {
    try {
      let res;
      if (p.dupCheckOnWrite) {
        try {
          res = await db.execute(buildDirectUpdateSql(p, p.targetRowId));
        } catch (e: any) {
          const dup = /\[중복차단\][^]*?id=(\d+)/.exec(e?.message || "");
          const dupId = dup ? Number(dup[1]) : null;
          if (!dupId || dupId === p.targetRowId) throw e;
          const absorbed = await upsertPlace({
            ...p,
            targetRowId: dupId,
            followTriggerDup: true,
            dupCheckOnWrite: false,
          });
          // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 지우는 것은 **이번에 만든 껍데기**뿐이다(rowIsNew). 원래 창고에 있던 행은 값(번역·동의 등급)을 옮긴 뒤 merged 표시로 남긴다 = 옛 "무조건 삭제" 폐기 §19.
          await moveBelongingsTo(dupId, p.targetRowId);
          if (p.rowIsNew) {
            await deletePlaceRow(p.targetRowId, {
              keepImageUrl: absorbed.enriched?.imageUrl ?? null,
            });
          } else {
            await db.transaction(async (tx) => {
              await tx.execute(
                sql`SELECT set_config('app.skip_dup_check', 'on', true)`,
              );
              await tx.execute(
                sql`UPDATE place_seed_raw SET status = 'merged', merged_into = ${dupId}, updated_at = NOW() WHERE id = ${p.targetRowId}`,
              );
              await tx.execute(sql`RESET app.skip_dup_check`);
            });
          }
          console.log(
            `[UPSERT] 🧲 PID 쌍둥이 흡수 = #${p.targetRowId} → 원행 #${dupId} (${p.rowIsNew ? "껍데기 삭제" : "merged 표시·삭제 0"})`,
          );
          return {
            ...absorbed,
            action: "updated",
            rowId: dupId,
            matchedBy: "pid",
            reason: "pid_twin_absorbed",
          };
        }
      } else if (p.followTriggerDup) {
        res = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT set_config('app.skip_dup_check', 'on', true)`,
          ); // true=트랜잭션 한정 = prevent_dup 만 스킵(자동 복원)
          const r = await tx.execute(buildDirectUpdateSql(p, p.targetRowId!));
          // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 통과증(skip_dup_check)은 쓰고 나서 반드시 손으로 반납(RESET) = 풀 백엔드에 켜진 채 남아 검문 전체가 꺼졌던 사고.
          await tx.execute(sql`RESET app.skip_dup_check`);
          return r;
        });
      } else {
        res = await db.execute(buildDirectUpdateSql(p, p.targetRowId));
      }
      if ((res.rowCount ?? 0) === 0) {
        return {
          action: "skipped",
          rowId: null,
          matchedBy: "none",
          reason: "target_row_deleted",
        };
      }
      const row = (res as any).rows?.[0];
      return {
        action: "updated",
        rowId: p.targetRowId,
        matchedBy: "none",
        enriched: row
          ? {
              imageUrl: row.image_url ?? null,
              googleReviewCount: row.google_review_count ?? null,
              nameKo: row.name_ko ?? null,
              nameLocal: row.name_local ?? null,
              summaryKo: row.summary_ko ?? null,
              editorialSummary: row.editorial_summary ?? null,
              googlePlaceId: row.google_place_id ?? null,
              latitude: row.latitude != null ? Number(row.latitude) : null,
              longitude: row.longitude != null ? Number(row.longitude) : null,
            }
          : undefined,
      };
    } catch (e: any) {
      throw e;
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌 폐기 = 코드 매칭(loadMatchCandidates 전체SELECT + matchCandidate) 완전삭제 §19.
  const categoryTags =
    p.categoryTags && p.categoryTags.length > 0
      ? p.categoryTags
      : [p.seedCategory];
  const phaseTags = p.phaseTags || [];

  // ⚠️ 개정헌법 2026-07-07 사장님 = rank 는 앱이 안 넣음(랭킹 코드 완전삭제 §19/§16). rank nullable + DB autorank 트리거(RC순) 단일 권위가 INSERT 후 배정.
  try {
    const inserted = await db
      .insert(placeSeedRaw)
      .values({
        cityId: p.cityId,
        seedCategory: p.seedCategory,
        // 🧠 2026-07-05 사장님 SSOT(§20) = 셀렉/꼼수(|| null) 제거 = 응답값 그대로 새삽입. ?? null = 응답에 없는 컬럼만 NULL(0·빈값은 온 값 그대로).
        nameEn: p.nameEn,
        nameKo: p.nameKo ?? null,
        nameLocal: p.nameLocal ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        address: p.address ?? null,
        googlePlaceId: p.googlePlaceId ?? null,
        googleMapsUri: p.googleMapsUri ?? null,
        googleReviewCount: p.googleReviewCount ?? null,
        businessStatus: p.businessStatus ?? null,
        verifySource: p.verifySource ?? null,
        verifiedAt: p.verifySource ? new Date() : null,
        googlePrimaryType: p.googlePrimaryType ?? null,
        imageUrl: p.imageUrl ?? null,
        imageAttribution: p.imageAttribution ?? null,
        priceEur: p.priceEur ?? null,
        editorialSummary: p.shortformKo ?? null,
        summaryKo: p.selectionReasonKo ?? null,
        dayZone: p.dayZone ?? null,
        distanceKmFromCenter: p.distanceKmFromCenter ?? null,
        categoryTags,
        phaseTags,
      } as any)
      .returning({ id: placeSeedRaw.id });

    const newId = inserted[0]?.id || null;
    return { action: "inserted", rowId: newId, matchedBy: "none" };
  } catch (e: any) {
    // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = DB 트리거(prevent_dup) = 최종 매처(§14 최종 안전망)를 따라감.
    const rec = await recoverTriggerDup(p, e);
    if (rec) return rec;
    return {
      action: "skipped",
      rowId: null,
      matchedBy: "none",
      reason: `insert_error: ${e?.message || String(e)}`,
    };
  }
}
