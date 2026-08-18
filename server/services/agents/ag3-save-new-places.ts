// 미등록 장소 DB 자동 저장(신규+흡수, TS 보강) = ag3-data-matcher 분리(2026-07-16 §0 슬림화, 순수 이동)

import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";
import { sql, inArray } from "drizzle-orm"; // sql = raw 좌표·rank 쿼리 / inArray = ②-b 매칭행 PID 배치판정
import type { PlaceResult } from "./types";
// ⚠️ 수정금지(승인필요) §18·§20 = TS 호출 단일 관문(tsSearch) = raw 2곳 자동저장 + 9요소·SKU 자체강제
// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 SSOT = 사진 분리 수술(2026-07-11) 재통합 폐기 = 2026-08-16 §19.
//   공식업뎁 전 실사용자 화면에 사진이 즉시 나와야 함 → PM(tsPhoto)을 생성 흐름으로 복귀. 새 함수
//   재발명 없이 기존 단일 관문 그대로 재사용(§16, image-backfill.ts의 runPm과 동일 호출 패턴).
//   이미 ③ TS 단계 전체가 Promise.all 병렬이라 PM도 같은 병렬 안에서 돈다(장소별 순차 처리 아님).
import { tsSearch, tsPhoto } from "../shared/ts-client";
// ⚠️ 2026-08-18 = core/outskirt 판정 = shared/pool-radius 단일 SSOT 재사용(§16, 비판검증 확정결함 수정 = 인라인 삼항식 재발명 폐기 §19)
import { zoneForDistanceKm } from "../shared/pool-radius";
// ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = TS raw 모음 1파일(#45 방식) 저장 = 도시id 폴더 로컬+Storage 2곳(§18).
import { saveCollectedRaw } from "../shared/save-collected-raw";

/**
 * AG3: 미등록 장소 DB 자동 저장 (백그라운드)
 * Gemini AI (New) + Gemini AI + Google Places 모두 저장 대상
 */
export async function saveNewPlacesToDB(
  newPlaces: PlaceResult[],
  cityId: number | null,
  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = deferPersist=true 시 = fetch(TS) await 완료 후 = DB write(upsertPlace)만 곳별 즉시 X, 함수 끝에서 한꺼번에 await. (PM = 2026-08-16 생성 흐름에 재통합)
  // = 첫 trip 이미지 FE 노출 최우선 / DB write 는 뒤로 미루되 함수 반환 전 await Promise.allSettled 로 완료(증발 0). false(기본)=fetch+write 모두 곳별 즉시 await.
  opts?: { deferPersist?: boolean },
): Promise<void> {
  if (!db || !cityId) {
    console.log(
      `[AG3-SAVE] skip cityId=${cityId} db=${!!db} count=${newPlaces.length}`,
    );
    return;
  }

  // 디버그: sourceType 분포
  const srcTypes: Record<string, number> = {};
  for (const p of newPlaces)
    srcTypes[p.sourceType || "undef"] =
      (srcTypes[p.sourceType || "undef"] || 0) + 1;
  console.log(
    `[AG3-SAVE] cityId=${cityId} count=${newPlaces.length} sourceTypes=${JSON.stringify(srcTypes)}`,
  );

  // 🧠 2026-07-05 새철학 = 매칭 여부 무관 Gemini 전체를 저장 대상에 포함 = 무조건 새덮기(버리지마=유료정보) §14갱신/§19.
  //   = 완전매칭행 skip·isBareMatch 조건·ENRICH_BARE_MATCHES 롤백플래그 방식 폐기 = 2026-07-05 §19.
  //   = 단 "DB Direct(AG2-DB place_seed_raw 직행)"는 이미 저장된 우리 검증행 = 제외(재저장 불필요).
  //   = 매칭된 행도 upsertPlace 7단계로 같은 행에 새값 COALESCE = 중복 INSERT 없음(§14).
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
  // ⚠️ 2026-06-24 §19 = cityName 지역변수 삭제(옛 inline searchText 의 textQuery 도시명 fallback 전용 = 외과교체로 불필요)
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
  // SUPA_ANON·SUPA_PUB 상수 삭제 = tsPhoto 제거 후 사용처 0 = 2026-07-11 사진 분리 수술 §19

  // ⚠️ 수정금지(승인필요) §18·§20 = TS 호출은 단일 관문 tsSearch()(shared/ts-client) 경유 (= raw 2곳 자동저장, 9요소·SKU 헬퍼 자체강제)

  // ⚠️ 수정금지(승인필요) 2026-05-09 = Promise.all 병렬화 (= simplify HIGH 권장)
  // = 순차 14~21 초 → 병렬 ~3.5 초 (= 4~6 배 단축)
  // = Google API rate limit (= 분당 600) = 4~6 호출 = 충분 여유

  // 🗑️ 2026-07-07 개정헌법(사장님) = rank(랭킹) 사전계산 블록 완전삭제 §19. 코드는 랭킹 한 자도 안 넣음 = 받은 응답만 저장 = 랭킹은 이후 DB autorank 트리거(RC순)가 알아서.
  const today = new Date().toISOString().slice(0, 10);

  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 순서 = ① Gemini 전체 upsert → ② TS 대상 = 신규(inserted) + PID 없는 매칭행(updated) → ③ TS(+PM) → 저장. (PM = ③과 같은 병렬로 재통합 2026-08-16)
  //   = Gemini가 채운 슬롯 전부 검증 보장(옛 "신규만" = 흡수건 검증누락 = 폐기 2026-07-08 §19). PID 보유 매칭행만 skip = 재과금 원천차단(니스 €17 사고 코드원인 해소) 유지.
  const { upsertPlace } = await import("../place-upsert");
  // 🗑️ 2026-07-18 삭제 = loadMatchCandidates(전체 PSR SELECT) + batchCands = 매칭 폐기(트리거 단일) 로 후보명단 불필요 §0/§19.

  // ── ① Gemini 전체 INSERT 시도(TS/PM 0회) = 응답값 그대로. 트리거가 중복이면 흡수(RETURNING 재활용). ──
  //   = job 은 Gemini/매칭행(seedDirectMatch 주입) 값만 = 받은 응답 그대로 저장.
  //   🗑️ 2026-07-07 개정헌법(사장님) = 랭킹(rank) 코드 한 자도 안 넣음 §19. 받은 응답만 저장하면 알아서 컬럼에 들어가고, 랭킹은 이후 DB autorank 트리거(RC순)가 함.
  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 폐기(트리거 단일) 후 = 곳마다 독립(공유 후보명단 없음) = Promise.all 병렬(옛 순차 for+await=곳당 90ms×N 직렬 폐기 §0/§19).
  //   = 각 곳 = "INSERT 시도 → 트리거 판정" 독립. 중복인지는 DB 트리거 담당 = 앱 공유상태 0. 같은 배치 쌍둥이 동시 INSERT = 둘 다 흡수(같은 원행) = 정합성 유지.
  const stage1 = await Promise.all(
    toSave.map(async (place: any) => {
      const seedCategory: string =
        (place as any).seedCategory ||
        (place.tags?.includes("restaurant") || place.tags?.includes("food")
          ? "restaurant"
          : "attraction");
      const slotCat: string | null = (place as any).slotCategory ?? null; // 취향 슬롯 카테고리(파이프라인 2a 화이트리스트 통과분)
      // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = Gemini 좌표는 job 에 그대로 실어 매칭(좌표10m 재식별)에는 쓰되,
      //   쓰기 보호는 관문 플래그(preserveExistingCoords)가 담당(§16 1벌 = ag3 매칭·관문 자체매칭·트리거흡수 세 문 모두 동일 보호).
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
        //   이 함수(라이브 auto-learn 저장)가 day_zone을 아예 안 써서 실사용자 트래픽으로만 자란 도시
        //   (토론토·나이로비)가 DB-only 카테고리 조회(day_zone 필터)에서 거의 다 걸러지는 사고 근본(2026-08-17 실측).
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
        //   `db-<번호>` 가 되어 [해설 듣기] 조건(화면 1벌)이 MIX 여정에서도 성립한다(pipeline-v3-day-builder 참조).
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

  // ── ② TS 대상 추출 = 신규(inserted) + PID 결손 매칭행(updated) ──
  //   🧠 2026-07-08 사장님 SSOT = Gemini가 채운 슬롯 전부 검증 보장. 옛 "inserted만" = 형제 좌표흡수(updated)된 멀쩡한 곳이 TS 누락(안도라 사고) = 완전삭제 §19.
  //   ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT(3회 강조) = 흡수행 결손 판정 = **PID 없음만**. 이미지 결손 조건 완전삭제 §19.
  //     = 옛 "PID 또는 이미지(place-images) 결손"(2026-07-09) 폐기 = 2026-07-12: 사진 분리 수술로 생성 중 이미지 항상 없음 → 흡수행 전부 "이미지 결손"으로 오판 →
  //       완비 흡수행도 매판 TS 재호출(랭스 실증: 흡수16곳 전부 TS = 재과금+속도 안 빨라진 근본). 이미지는 fill/image-backfill(사후 일괄) 전담 = TS 대상 판정과 무관.
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

  // ── ③ 대상(신규+흡수) 전부 TS = 자기 rowId 직행 UPDATE(신규·흡수 통일). ──
  //   = ①에서 이미 Gemini 요소로 id 확정(흡수는 트리거가 원행 id 로 UPDATE) → ③은 그 확정 id 칸의 결손(TS 9요소)만 targetRowId 직행으로 채움(§14 재매칭 실패 불가, 재매칭·중복재판별 안 함 = 사장님 SSOT).
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
          //   = Fort Thüngen 실증: 로컬명만 보내고 좌표 locationBias 넓게(오차흡수) = Google 텍스트매칭이 정답을 최상위(RC 2361). 영어명·주소 넣으면 premise 오매칭(RC 0).
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

        // 🧠 2026-07-06 = 06형태 모음 수집(#45 repair.ts:186-196) = 정제 9요소 + photo_name 1개(photos[0]). 원본 photos 통째 X.
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
                price_eur: result.priceEur,
                photo_name: result.photoName,
                google_maps_uri: result.googleMapsUri,
                business_status: result.businessStatus,
              }
            : null,
        });

        // 🧠 2026-08-17 사장님 승인 = 폐업 = 슬롯·행 유지 + TS 요소 전체 입력(§20) + PM도 시도 + phase_tags '영구폐업' 기록.
        //   사유: 폐업행도 제미니·DB-only 양쪽 다 필터 없이 FE에 그대로 노출됨(2026-08-17 실측) = 이미지 없는 채로
        //   보여주는 것보다 폐업 전 사진이라도 채우는 게 낫다(image-backfill.ts 동일정책 적용 §19, 옛 PM스킵 폐기).
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
        //   폐업 행도 photoName 있으면 PM 시도(위 사유). photoName 없으면(만료·미제공) 스킵 = 무성실패(null 계약, tsPhoto 내부).
        //   ③ 전체가 Promise.all 병렬이라 PM도 같은 병렬 파도 안에서 돈다(장소별 순차 await 아님).
        let photoUrl: string | null = null;
        if (result.photoName) {
          photoUrl = await tsPhoto({
            apiKey: GOOGLE_KEY,
            photoName: result.photoName,
            pathKey: `${cityId}/${seedCategory}/${placeId || rowId}`,
          });
        }

        // ④ FE 배선 = place 객체 직접 갱신(신규·흡수건 공통) = TS 검증 좌표·PID·주소·RC·이미지 즉시 반영.
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

        // ③-b 저장 = TS 검증값 전체(Gemini+TS = §20 깔대기) = 신규·흡수 공통 자기 rowId 직행 UPDATE(targetRowId, §14 재매칭 실패 불가). COALESCE 새우선.
        // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 확정 = **가격 컬럼의 주인은 제미니 하나뿐이다.**
        //   정본 = docs/20260607PROMPTS_TOTAL_SSOT.md:583 "Gemini만 주는 요소 = name_local · distance · price".
        //   같은 문서 1459줄은 name_en 에만 "뒤 TS displayName 이 최종 덮음"이라 적었고, 가격에는 그 말이 없다
        //   = TS 가격이 제미니를 덮는 규칙은 SSOT 어디에도 없었다(코드만 그렇게 하고 있었음) = 2026-08-10 폐기.
        //   사고 = 구글 priceRange 는 그 나라 통화라 케냐 5,000실링(≈€35)이 €5,000 으로 박혔고(실측 11곳),
        //     유로권에서도 €·€€·€€€ 급 대략치가 제미니의 "1인 €35"를 덮고 있었다.
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
          //   = 옛 "Gemini 좌표 폴백을 DB에 기록" = 폐기 2026-07-11 §19(환각좌표가 targetRowId 직행으로 검증행 오염 = 리뷰 적발). Gemini 폴백(lat/lng)은 FE 표시 전용.
          latitude:
            result.latitude && result.latitude !== 0 ? result.latitude : null,
          longitude:
            result.longitude && result.longitude !== 0
              ? result.longitude
              : null,
          // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 SSOT = imageUrl = PM 성공 시에만 포함(§14 부분갱신 = 실패/스킵이면
          //   안 보내 컬럼 그대로 = 매칭행 기존 이미지 보존, 새로 뭘로도 못 덮지 않음). PM 실패분은 여전히
          //   fill/image-backfill CLI로 사후 복구 가능(§16, 도구 유지).
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
        //   사장님 SSOT(line 453·459): "신규든 병합이든 모든행 우리 id 상태에서 결손을 보강하여 해당 id 칸을 채움. 모든 TS+PM 요소는 어디로 갈지 아는 상태." (PM = 사후 일괄로 이동 2026-07-11)
        //   = ① Gemini upsert 단계에서 트리거가 이미 중복(흡수)을 판별해 그 원행 id 로 UPDATE 완료 → ① 이후 모든 행은 각자 확정된 id 보유. ②는 그 id 에 결손(TS 9요소)만 직행으로 채움.
        //   = dupOwner 재조회 폐기 2026-07-09 §19: 중복판별은 ① 트리거가 이미 함 → ②에서 또 dupOwner SELECT = 트리거 재발명(§16 위반) + 사장님 "②는 재매칭 아님" 정면위반.
        //     트리거 라이브면 같은 강매칭키 2행은 ①에서 애초에 못 생김 → ① 통과행은 정의상 dupOwner 없음 = 재조회는 항상 null = 죽은 코드였음.
        // ⚠️ 수정금지(승인필요) 2026-07-17 사장님 SSOT = followTriggerDup=true = 트리거(최종 매처)가 '[중복차단] id=N' 판정 시
        //   그 원행(N)으로 병합 = Gemini+TS 합본이 원행에 감 = 직행 차단분 TS 결과 폐기(디종 4/10콜 실측) 해소(§14).
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
        // deferPersist = 재UPDATE(DB write)를 곳별로 즉시 await 하지 않고 job2Promises 에 모아 함수 끝에서 한꺼번에 await(FE 는 위 place mutate 로 이미 노출, DB write 는 응답 전 완료 = 증발 0). 기본(false) = 곳별 즉시 await.
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
  //   deferPersist 모드 = job2Promises(DB write) 완료 대기(FE 는 place mutate 로 이미 노출). 사진은 위 Promise.all 안에서 이미 await 완료(증발 0).
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

  // 집계 = ① upsert(ins/upd/skip) + ③ TS 성공수(apiEnriched). 이미지 = 사후 일괄(fill/image-backfill) = 집계 없음.
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
