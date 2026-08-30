import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";
import { sql, inArray } from "drizzle-orm"; // sql = raw 좌표·rank 쿼리 / inArray = ②-b 매칭행 PID 배치판정
import type { PlaceResult } from "./types";
// ⚠️ 수정금지(승인필요) §18·§20 = TS 호출 단일 관문(tsSearch) = raw 2곳 자동저장 + 9요소·SKU 자체강제
// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 SSOT = 사진 분리 수술(2026-07-11) 재통합 폐기 = 2026-08-16 §19.
import { tsSearch, tsPhoto } from "../shared/ts-client";
import { zoneForDistanceKm } from "../shared/pool-radius";
// ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = TS raw 모음 1파일(#45 방식) 저장 = 도시id 폴더 로컬+Storage 2곳(§18).
import { saveCollectedRaw } from "../shared/save-collected-raw";

export async function saveNewPlacesToDB(
  newPlaces: PlaceResult[],
  cityId: number | null,
  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = deferPersist=true 시 = fetch(TS) await 완료 후 = DB write(upsertPlace)만 곳별 즉시 X, 함수 끝에서 한꺼번에 await. (PM = 2026-08-16 생성 흐름에 재통합)
  opts?: { deferPersist?: boolean },
): Promise<void> {
  if (!db || !cityId) {
    console.log(
      `[AG3-SAVE] skip cityId=${cityId} db=${!!db} count=${newPlaces.length}`,
    );
    return;
  }

  const srcTypes: Record<string, number> = {};
  for (const p of newPlaces)
    srcTypes[p.sourceType || "undef"] =
      (srcTypes[p.sourceType || "undef"] || 0) + 1;
  console.log(
    `[AG3-SAVE] cityId=${cityId} count=${newPlaces.length} sourceTypes=${JSON.stringify(srcTypes)}`,
  );

  const toSave = newPlaces.filter(
    (p) => p.sourceType !== "DB Direct (Place Seed Raw)",
  );
  if (toSave.length === 0) {
    console.log(`[AG3-SAVE] toSave=0 (= 모두 DB Direct = 이미 저장됨)`);
    return;
  }

  console.log(
    `[AG3-SAVE] toSave=${toSave.length} 행 = 즉시 await searchText + INSERT 시작 (사진 PM = ③ TS 단계와 같은 병렬에서 즉시 시도, 2026-08-16)`,
  );

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 도시 좌표 사전 조회 (= tsSearch 좌표앵커 latitude/longitude 용)
  let cityLat = 0,
    cityLng = 0;
  try {
    const cityRow = await db!.execute(
      sql`SELECT latitude, longitude FROM cities WHERE id = ${cityId} LIMIT 1`,
    );
    const c = (cityRow as any).rows?.[0];
    if (c) {
      cityLat = parseFloat(c.latitude) || 0;
      cityLng = parseFloat(c.longitude) || 0;
    }
  } catch (e) {
    console.warn(`[AG3-SAVE] 도시 좌표 조회 실패`, (e as Error).message);
  }

  // ⚠️ 수정금지(승인필요) = tsSearch 호출 인자로 넘기는 env 직독 (= 출입증 GAP2 안 건드림 = 그대로 유지)
  const GOOGLE_KEY =
    process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";

  // ⚠️ 수정금지(승인필요) §18·§20 = TS 호출은 단일 관문 tsSearch()(shared/ts-client) 경유 (= raw 2곳 자동저장, 9요소·SKU 헬퍼 자체강제)

  // ⚠️ 수정금지(승인필요) 2026-05-09 = Promise.all 병렬화 (= simplify HIGH 권장)

  // 🗑️ 2026-07-07 개정헌법(사장님) = rank(랭킹) 사전계산 블록 완전삭제 §19. 코드는 랭킹 한 자도 안 넣음 = 받은 응답만 저장 = 랭킹은 이후 DB autorank 트리거(RC순)가 알아서.
  const today = new Date().toISOString().slice(0, 10);

  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 순서 = ① Gemini 전체 upsert → ② TS 대상 = 신규(inserted) + PID 없는 매칭행(updated) → ③ TS(+PM) → 저장. (PM = ③과 같은 병렬로 재통합 2026-08-16)
  const { upsertPlace } = await import("../place-upsert");

  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 폐기(트리거 단일) 후 = 곳마다 독립(공유 후보명단 없음) = Promise.all 병렬(옛 순차 for+await=곳당 90ms×N 직렬 폐기 §0/§19).
  const stage1 = await Promise.all(
    toSave.map(async (place: any) => {
      const seedCategory: string =
        (place as any).seedCategory ||
        (place.tags?.includes("restaurant") || place.tags?.includes("food")
          ? "restaurant"
          : "attraction");
      const slotCat: string | null = (place as any).slotCategory ?? null; // 취향 슬롯 카테고리(파이프라인 2a 화이트리스트 통과분)
      // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = Gemini 좌표는 job 에 그대로 실어 매칭(좌표10m 재식별)에는 쓰되,
      const gLat =
        (place as any).lat && (place as any).lat !== 0
          ? (place as any).lat
          : null;
      const gLng =
        (place as any).lng && (place as any).lng !== 0
          ? (place as any).lng
          : null;
      const job = {
        cityId,
        seedCategory,
        nameEn: (place as any).__seedDirectMatch?.nameEn || place.name,
        nameKo: (place as any).nameKo ?? null,
        nameLocal: (place as any).nameLocal ?? null,
        address: (place as any).geminiAddress ?? null,
        latitude: gLat,
        longitude: gLng,
        imageUrl: place.image || null,
        googlePlaceId: (place as any).googlePlaceId ?? null,
        shortformKo: place.description ?? null, // → editorial_summary
        selectionReasonKo: place.personaFitReason ?? place.description ?? null, // → summary_ko
        priceEur: (place as any).estimatedPriceEur || 0,
        // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 취향 슬롯 카테고리(slotCategory)도 태그로 축적(UNION §14) = 장소 다면성(앙부아즈=heritage+hotspot).
        categoryTags:
          slotCat && slotCat !== seedCategory
            ? [seedCategory, slotCat]
            : [seedCategory],
        phaseTags: [`auto-learn-${today}`],
        distanceKmFromCenter: (place as any).distanceKmFromCenter ?? null,
        // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인(실측 버그수정) = day_zone = zoneForDistanceKm 단일 SSOT(§16).
        dayZone:
          (place as any).distanceKmFromCenter != null
            ? zoneForDistanceKm((place as any).distanceKmFromCenter)
            : null,
        // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = ① Gemini 쓰기 = 좌표 보호 플래그 = 행에 검증좌표 있으면 유지(빈칸·0만 채움).
        preserveExistingCoords: true,
      };
      try {
        const r = await upsertPlace({ ...job } as any);
        // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 트리거 흡수 시 원행 재활용데이터(RETURNING)를 place 에 입힘 = 옛 matchCandidate "매칭행→place" 재활용 대체. §14 새것우선: place 빈칸만 폴백.
        const en = r.enriched;
        if (en) {
          if (!place.image && en.imageUrl) place.image = en.imageUrl;
          if (!(place as any).userRatingCount && en.googleReviewCount != null)
            (place as any).userRatingCount = en.googleReviewCount;
          if (!(place as any).googlePlaceId && en.googlePlaceId)
            (place as any).googlePlaceId = en.googlePlaceId;
          if (!(place as any).nameKo && en.nameKo)
            (place as any).nameKo = en.nameKo;
          if (!(place as any).nameLocal && en.nameLocal)
            (place as any).nameLocal = en.nameLocal;
          if (!(place as any).editorialSummary && en.editorialSummary)
            (place as any).editorialSummary = en.editorialSummary;
          if (!(place as any).summaryKo && en.summaryKo)
            (place as any).summaryKo = en.summaryKo;
          if ((!place.lat || place.lat === 0) && en.latitude && en.longitude) {
            place.lat = en.latitude;
            place.lng = en.longitude;
          }
        }
        // 🎙️ 2026-08-12 사장님 승인 = 창고 행 번호를 장소 객체에 실음 → MIX 슬롯 id 가 DB-only 와 같은
        if (r.rowId != null) (place as any).psrRowId = r.rowId;
        return { place, seedCategory, action: r.action, rowId: r.rowId };
      } catch (e) {
        console.error(
          `[AG3-SAVE] ❌ "${place.name}" Gemini upsert 실패:`,
          (e as Error).message,
        );
        return {
          place,
          seedCategory,
          action: "skipped",
          rowId: null as number | null,
          error: (e as Error).message,
        };
      }
    }),
  );
  const g1 = stage1.reduce(
    (a, r: any) => {
      a[r.action] = (a[r.action] || 0) + 1;
      return a;
    },
    {} as Record<string, number>,
  );
  console.log(
    `[AG3-SAVE] ① Gemini 전체 upsert = ins=${g1.inserted || 0} upd=${g1.updated || 0} skip=${g1.skipped || 0} (${stage1.length}행)`,
  );

  //   ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT(3회 강조) = 흡수행 결손 판정 = **PID 없음만**. 이미지 결손 조건 완전삭제 §19.
  const newRows = stage1.filter(
    (r: any) => r.action === "inserted" && r.rowId != null,
  );
  const updatedRows = stage1.filter(
    (r: any) => r.action === "updated" && r.rowId != null,
  );
  let absorbedRows: typeof updatedRows = [];
  if (updatedRows.length > 0 && db) {
    const ids = [...new Set(updatedRows.map((r: any) => r.rowId))];
    const chk = await db
      .select({
        id: placeSeedRaw.id,
        googlePlaceId: placeSeedRaw.googlePlaceId,
      })
      .from(placeSeedRaw)
      .where(inArray(placeSeedRaw.id, ids as number[]));
    const missById = new Map(chk.map((r: any) => [r.id, !r.googlePlaceId])); // 결손 = PID 없음만(이미지 무관)
    absorbedRows = updatedRows.filter((r: any) => missById.get(r.rowId));
  }
  // mode = raw 산출물(tsResults, §18) 에 실리는 신규/흡수 구분 라벨 전용(사장님 눈검수용). 처리 로직은 신규·흡수 동일(자기 rowId 직행) = 분기 안 함.
  const tsTargets = [
    ...newRows.map((r: any) => ({ ...r, mode: "new" as const })),
    ...absorbedRows.map((r: any) => ({ ...r, mode: "absorbed" as const })),
  ];
  console.log(
    `[AG3-SAVE] ② TS 대상 = 신규 ${newRows.length} + 흡수(PID 결손) ${absorbedRows.length} = ${tsTargets.length}곳 (PID 완비 매칭행 ${updatedRows.length - absorbedRows.length}곳 = 유료호출 0, 이미지 결손행은 fill/image-backfill 사후 대상)`,
  );

  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = TS raw 모음 1파일(#45 repair.ts:167 방식) = 건건 로컬skip + 끝에 06형태 results 배열 1파일(§18).
  const tsResults: any[] = [];
  const job2Promises: Promise<void>[] = []; // defer 모드 rowId 직행 UPDATE = 함수 끝에서 await Promise.allSettled 로 응답 전 완료(증발 0)
  const results = await Promise.all(
    tsTargets.map(async ({ place, seedCategory, rowId, mode }: any) => {
      try {
        // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = TS textQuery = 로컬명 단독(영어명 절대 금지 §19). 로컬명 없으면(Gemini 누락) = TS 스킵(빈 textQuery 400 방지 + 영어명 오염 금지). ① Gemini 저장분 유지.
        const nameLocal = (place as any).nameLocal;
        if (!nameLocal || String(nameLocal).trim() === "") {
          console.log(
            `[AG3-SAVE] ⏭️ "${place.name}" = nameLocal 없음(Gemini 누락) = TS 스킵(영어명 오염 금지)`,
          );
          tsResults.push({
            id: rowId,
            name: place.name,
            category: seedCategory,
            mode,
            our_pid: (place as any).googlePlaceId ?? null,
            status: "no_local_name",
            ts: null,
          });
          return { enrichedByApi: 0 };
        }
        // ⚠️ 2026-06-24 §18·§20 = 단일 관문 tsSearch (= raw 2곳 자동저장). Gemini 좌표 있으면 10m 앵커, 없으면 도시중심 폴백.
        const gLat =
          (place as any).lat && (place as any).lat !== 0
            ? (place as any).lat
            : cityLat || undefined;
        const gLng =
          (place as any).lng && (place as any).lng !== 0
            ? (place as any).lng
            : cityLng || undefined;
        const hasGeminiCoord = (place as any).lat && (place as any).lat !== 0;
        const tsArr = await tsSearch({
          apiKey: GOOGLE_KEY,
          method: "searchText",
          cityId,
          // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = TS 힌트 = 로컬명 단독(위에서 null 가드 통과 = 값 확정). 영어명 폴백·주소 합침 금지 §19.
          nameLocal,
          latitude: gLat,
          longitude: gLng,
          // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 좌표 앵커 1000m(locationBias = 강제필터 아닌 가중치 = Gemini 좌표 오차 흡수). 옛 10m(2026-06-23) 폐기 = 주소건물 오매칭 유발.
          anchorRadiusM: hasGeminiCoord ? 1000 : undefined,
          rawTag: `ag3-${place.name}`,
          // ⚠️ 2026-07-06 §18 = 건건 raw 로컬 skip(Storage 건건은 관문이 보존) = 아래 tsResults 모음 1파일이 로컬 조회용(repair.ts:183 동일).
          localSkipRaw: true,
        });
        const result = tsArr?.[0];

        tsResults.push({
          id: rowId,
          name: place.name,
          category: seedCategory,
          mode,
          our_pid: (place as any).googlePlaceId ?? null,
          status: result ? "ok" : "no_match",
          ts: result
            ? {
                place_id: result.googlePlaceId,
                display_name_en: result.nameEn,
                address: result.address,
                lat: result.latitude,
                lng: result.longitude,
                review_count: result.googleReviewCount,
                photo_name: result.photoName,
                google_maps_uri: result.googleMapsUri,
                business_status: result.businessStatus,
              }
            : null,
        });

        // 🧠 2026-08-17 사장님 승인 = 폐업 = 슬롯·행 유지 + TS 요소 전체 입력(§20) + PM도 시도 + phase_tags '영구폐업' 기록.
        const isClosedPermanently =
          result?.businessStatus === "CLOSED_PERMANENTLY";
        if (isClosedPermanently)
          console.log(
            `[AG3-SAVE] 🚫 "${place.name}" = 영구 폐업(TS) = 행·슬롯 유지, PM도 시도(폐업 전 사진)`,
          );
        if (!result) return { enrichedByApi: 0 }; // TS 미검색 = ① Gemini 저장분 유지

        const lat =
          result.latitude && result.latitude !== 0
            ? result.latitude
            : (place as any).lat || null;
        const lng =
          result.longitude && result.longitude !== 0
            ? result.longitude
            : (place as any).lng || null;
        const placeId: string | null =
          result.googlePlaceId || (place as any).googlePlaceId || null;

        // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = PM(사진 다운로드+R2 업로드) = 생성 흐름에 재통합.
        let photoUrl: string | null = null;
        if (result.photoName) {
          photoUrl = await tsPhoto({
            apiKey: GOOGLE_KEY,
            photoName: result.photoName,
            pathKey: `${cityId}/${seedCategory}/${placeId || rowId}`,
          });
        }

        if (lat && lng) {
          place.lat = lat;
          place.lng = lng;
        }
        if (placeId) (place as any).googlePlaceId = placeId;
        (place as any).geminiAddress =
          result.address || (place as any).geminiAddress;
        if (result.googleReviewCount != null)
          place.userRatingCount = result.googleReviewCount;
        if (photoUrl) place.image = photoUrl;
        console.log(
          `[AG3-SAVE] 📡 ${mode === "absorbed" ? "흡수" : "신규"} "${place.name}" → (${lat}, ${lng}) pid=${placeId ? "TS" : "NONE"} img=${photoUrl ? "OK" : isClosedPermanently ? "스킵(폐업)" : result.photoName ? "실패" : "없음"}`,
        );

        // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 확정 = **가격 컬럼의 주인은 제미니 하나뿐이다.**
        //   TS 가격은 버리지 않는다 = raw(§18)에 그대로 남아 언제든 다시 볼 수 있다. DB 칸만 제미니 것으로 한다.
        const newPriceEur = (place as any).estimatedPriceEur || 0;
        const jobBase = {
          cityId,
          seedCategory,
          nameEn: result.nameEn || place.name,
          nameKo: (place as any).nameKo ?? null,
          nameLocal: (place as any).nameLocal ?? null,
          address: result.address ?? (place as any).geminiAddress ?? null,
          // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = DB 좌표 = TS 검증값만. TS 무좌표 시 null = 행 좌표 유지(COALESCE).
          latitude:
            result.latitude && result.latitude !== 0 ? result.latitude : null,
          longitude:
            result.longitude && result.longitude !== 0
              ? result.longitude
              : null,
          // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 SSOT = imageUrl = PM 성공 시에만 포함(§14 부분갱신 = 실패/스킵이면
          ...(photoUrl ? { imageUrl: photoUrl } : {}),
          googlePlaceId: placeId,
          googleMapsUri: result.googleMapsUri ?? null,
          shortformKo: place.description ?? null,
          selectionReasonKo:
            place.personaFitReason ?? place.description ?? null,
          googleReviewCount: result.googleReviewCount ?? 0,
          priceEur: newPriceEur,
          categoryTags: [seedCategory],
          // 폐업 = TS 응답 사실을 phase_tags 로 보존(응답요소 안 버림 §18/§20)
          phaseTags: isClosedPermanently
            ? [`auto-learn-${today}`, "영구폐업"]
            : [`auto-learn-${today}`],
          distanceKmFromCenter: (place as any).distanceKmFromCenter ?? null,
          // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인(실측 버그수정) = day_zone = zoneForDistanceKm 단일 SSOT(위 job 동일, §16).
          dayZone:
            (place as any).distanceKmFromCenter != null
              ? zoneForDistanceKm((place as any).distanceKmFromCenter)
              : null,
        };
        // ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 신규·흡수 통일 = 전부 자기 rowId 직행(targetRowId=rowId) = 재매칭·중복재판별 절대 안 함.
        // ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = followTriggerDup=true = 트리거(최종 매처)가 '[중복차단] id=N' 판정 시
        const job2 = { targetRowId: rowId, followTriggerDup: true, ...jobBase }; // 전부 자기 id 직행(§14 재매칭 실패 불가)
        const doUpdate = async () => {
          try {
            await upsertPlace(job2 as any);
          } catch (e) {
            console.log(
              `[AG3-SAVE] ⚠️ "${place.name}" 직행 실패(${(e as Error).message}) = 그 행 스킵`,
            );
          }
        };
        if (opts?.deferPersist) job2Promises.push(doUpdate());
        else await doUpdate();

        return { enrichedByApi: 1 };
      } catch (e) {
        console.error(
          `[AG3-SAVE] ❌ 신규 "${place.name}" TS 실패:`,
          (e as Error).message,
        );
        tsResults.push({
          id: rowId,
          name: place.name,
          category: seedCategory,
          status: "error",
          error: (e as Error).message,
        });
        return { enrichedByApi: 0, error: (e as Error).message };
      }
    }),
  );

  // 🗑️ 2026-07-09 = ③-c 흡수건 퍼널 재투입 완전삭제 §19 = 흡수건도 위에서 rowId 직행(재매칭 X) 통일 = 별도 재투입 불필요(사장님 SSOT).
  if (opts?.deferPersist && job2Promises.length > 0) {
    await Promise.allSettled(job2Promises);
  }

  // 🧠 2026-07-06 사장님 SSOT = TS raw 06형태 모음 1파일(#45 repair.ts:259-271) = 도시id 폴더 로컬+Storage 2곳(§18).
  //   ⚠️ 2026-07-06 근본수정 = 옛 fire-and-forget(void..catch) = 배포서버(Replit)서 응답 후 PUT 완료전 잘림 = TS raw 미저장(비용증발 §18) 근본.
  //     → await 로 전환(§18 자산보장). 이 함수는 상위(pipeline-v3)서 이미 await 호출 = FE 노출은 TS fetch 완료로 이미 보장 = raw 저장(수백ms)은 그 뒤 미미.
  if (tsResults.length) {
    await saveCollectedRaw({
      cityId,
      stepNum: 6,
      stepName: "ts-pm-enrich",
      content: "candidates",
      hashKey: "results",
      body: {
        meta: {
          city_id: cityId,
          called_at: new Date().toISOString(),
          input_rows: tsTargets.length,
          photo: "대표 1장(photo_name=photos[0])",
        },
        results: tsResults,
      },
    }).catch((e) =>
      console.warn("[AG3] TS raw 저장 실패:", (e as Error)?.message),
    );
  }

  const totals = results.reduce(
    (acc, r: any) => ({
      enrichedByApi: acc.enrichedByApi + (r.enrichedByApi || 0),
      error: acc.error || r.error || "",
    }),
    { enrichedByApi: 0, error: "" },
  );
  console.log(
    `[AG3] 🆕 TS ${tsTargets.length}곳(신규 ${newRows.length}+흡수 ${absorbedRows.length}) = apiEnriched=${totals.enrichedByApi} error="${totals.error}" (PID 보유 매칭행 = 유료호출 0, 이미지 = 사후 일괄)`,
  );
}
