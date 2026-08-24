// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 지브리 일별 여행영상 백엔드 실배선 1벌 (docs/여정 미리보기 영상 구현.md)
// = POST {day} → Gemini 스토리보드 1콜(전데이터 제공) → Omni 씬 병렬 생성(캐릭터 3장 첨부) → ffmpeg 결합 → Storage → video_by_day 갱신.
// = 키 = issueApiKey 출입증(apipass)만. 옛 목업(샘플 mp4·가짜 성공·폴백 여정) = 완전 폐기 2026-07-22 §19.
// = 2026-07-23 사장님 SSOT: 씬 하나 실패해도 전체 폐기 금지 = 성공한 씬만 모아 완성(사용자 무한대기 방지). 카드 요약 = 슬롯 summaryKo 없으면 PSR.summary_ko 직조회(name_local 과 동일).

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import crypto from "crypto";
import { pool } from "./db";
import type { DayVideo } from "../shared/schema";
import { issueApiKey } from "./services/shared/issue-api-key";
import {
  buildGhibliStoryboard,
  sceneClipPrompt,
  sceneStillPrompt,
  scenePhotoMotionPrompt,
  narratorFromCast,
  normalizeVideoLang,
  MAX_SCENES,
  SCENE_SECONDS,
} from "./services/ghibli-travel-storyboard";
import {
  generateSceneClip,
  animateStillToClip,
} from "./services/shared/video-gen-client";
import { composeSceneStill } from "./services/shared/image-gen-client";
import { stitchAndUpload } from "./services/video-stitcher";
// ⚠️ 2026-08-07 사장님 승인 = 씬 낱개 즉시 R2 보존 + 재시도 재활용 + 열쇠 사전검사(런던 121 €1.58 유출 재발 방지)
import {
  uploadToR2,
  getFromR2,
  isR2Configured,
} from "./services/shared/r2-client";
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 상황판 2026-08-06)
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)

const COST_PER_SECOND_USD = 0.101; // A안 = Omni Flash 720p (5,792tok/초 × $17.5/1M)
const B_COST_PER_SCENE_USD = 0.35; // B안 = 나노바나나 스틸 $0.045 + Veo Lite 6초 $0.30

// 관리자 A/B 토글 = 사장님 SSOT 2026-07-23: **디폴트 = B(실사 포토무비, 씬당 $0.35 = 원가 절감)**, 필요시 대시보드에서 A(지브리풍) 전환
let adminVideoOptionMode: "optionA" | "optionB" = "optionB";

// 죽은 파이프라인 판정 = 202 후 백그라운드 중 서버 사망(재배포·autoscale 회수) 시 processing 영구 고착 방지 (§22 code-review 2026-07-22).
// taskId 끝 세그먼트 = 시작 Date.now → 폴링상한(10분)+여유보다 오래된 processing = 죽음 = 재생성 허용 + 조회 시 failed 로 표시.
const STALE_PROCESSING_MS = 15 * 60 * 1000;
// 씬 생성 동시 상한 = Veo Tier2 RPM4 안쪽 = 4 (2026-07-23 실측: Veo 1개 ~60초라 동시4=분당4개=한도 딱 맞음, 429 안전).
//   8씬 이하 여정 = 2배치로 단축(107 실증 176→117초). 9씬 = 3배치 그대로.
//   2026-08-23 Tier 2 승격(사장님 콘솔 실측) = Veo RPM 4·RPD 50 = 분당 한도는 그대로라 동시 4 유지, 하루 한도만 10→50 편으로 풀림(9씬 ≈ 하루 5편).
const SCENE_CONCURRENCY = 4;

/** 동시 상한 병렬 실행 (결과 순서 = 입력 순서 유지) */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}
function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}

/** 카드 요약 = 슬롯 summaryKo 우선, 없으면(옛 여정) 슬롯 id 로 PSR.summary_ko 직조회 = name_local 과 동일 로직(1회용 백필 아님) */
async function resolveSummaries(slots: any[]): Promise<Record<number, string>> {
  const map: Record<number, string> = {};
  if (!pool) return map;
  const ids = slots
    .map((s) => parseInt(String(s?.id ?? "").replace(/\D/g, ""), 10)) // "db-62219" → 62219
    .filter((n) => !isNaN(n));
  if (!ids.length) return map;
  const r = await pool.query(
    "SELECT id, summary_ko FROM place_seed_raw WHERE id = ANY($1::int[])",
    [ids],
  );
  for (const row of r.rows) map[row.id] = row.summary_ko || "";
  return map;
}

/** video_by_day 의 해당 day 만 원자적 병합 갱신 (다른 day 보존) */
async function setDayVideo(
  itineraryId: number,
  day: number,
  v: DayVideo,
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE itineraries
       SET video_by_day = COALESCE(video_by_day, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
           updated_at = NOW()
     WHERE id = $1`,
    [itineraryId, String(day), JSON.stringify(v)],
  );
}

export function registerVideoRoutes(app: Express): void {
  // 1. 관리자 옵션 토글
  app.get("/api/admin/video-config", (_req: Request, res: Response) => {
    res.json({ success: true, currentOptionMode: adminVideoOptionMode });
  });
  app.post("/api/admin/video-config", (req: Request, res: Response) => {
    const { optionMode } = req.body;
    if (optionMode !== "optionA" && optionMode !== "optionB")
      return res.status(400).json({ error: "optionMode = optionA | optionB" });
    adminVideoOptionMode = optionMode;
    res.json({ success: true, updatedOptionMode: adminVideoOptionMode });
  });

  // 2. 일별 영상 생성 (유료 = Omni Flash. 해당 day processing 중 = 409 이중지출 차단)
  app.post(
    "/api/itineraries/:id/video/generate",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const day = parseInt(req.body?.day);
        // 2026-08-22 사장님 승인 = 영상 다국어 = FE가 보낸 앱 언어(미전달·미지원 = ko = 동작 무변경)
        const lang = normalizeVideoLang(req.body?.language);
        if (isNaN(id) || isNaN(day) || day < 1)
          return res
            .status(400)
            .json({ error: "itinerary id + body.day 필요" });
        if (!pool) return res.status(500).json({ error: "DB 미연결" });

        const itin = await storage.getItinerary(id);
        const slots: any[] | undefined = (itin?.rawData as any)?.days?.[day - 1]
          ?.places;
        if (!itin || !slots?.length)
          return res
            .status(404)
            .json({ error: `여정 ${id} day ${day} 슬롯 없음` });

        const existing = (itin as any).videoByDay?.[String(day)] as
          | DayVideo
          | undefined;
        if (existing?.status === "processing" && !isStaleProcessing(existing))
          return res
            .status(409)
            .json({ error: "이미 생성 중", taskId: existing.taskId });

        const taskId = `ghibli_${id}_d${day}_${Date.now()}`;

        // 📥 신청자 = 완료 자동게시 대상 (2026-08-03 사장님 확정 = 완성되면 신청자 프로필에 자동 게시 + 탭 뱃지).
        //   응답 후 백그라운드에서는 req 를 다시 읽을 수 없으므로 여기서 잡아 둔다. 비로그인(게스트) = null = 게시 없음.
        const requesterUserId = getUserIdFromReq(req);

        // 🔒 수정금지(승인필요) 2026-08-05 사장님 SSOT = 영상 만들기 = **로그인 필수**.
        //   사유(실측): chargeFeature 는 비로그인을 차감 없이 통과시키므로(credit-charge.ts = §9 게스트 개방),
        //   이 줄이 없으면 토큰 없는 요청도 렌더가 돌아 1건당 최대 10씬 × $0.35 ≈ $3.5 를 회사가 부담한다.
        //   게다가 신청자가 null 이라 자동게시도 안 되어 **아무도 못 보는 영상에 돈만 나간다.**
        //   같은 파일의 저장·목록·열람(:379 등)이 이미 쓰는 문장 1벌.
        if (!requesterUserId)
          return res.status(401).json({ error: "로그인 필요" });

        // 🪙 2026-08-06 사장님 승인 = **성공 시점 차감**으로 이동(런던 121 사고 = 실패했는데 60 증발 근본해결).
        //   여기(시작)는 잔액 **사전확인만**(차감 0) = 부족하면 402 = §9 "헤더 후 402 불가" 취지를 시작 시점에 충족.
        //   실제 차감 = 아래 백그라운드에서 완성·프로필 게시 순간(사장님: "게시되고 뱃지 생성되는 시점 차감").
        //   옛 "시작 시 차감" 폐기 = 2026-08-06 §19.
        if (!(await precheckFeature(res, requesterUserId, "day_video"))) return;

        const sceneSlots = slots.slice(0, MAX_SCENES);
        const totalScenes = sceneSlots.length;
        await setDayVideo(id, day, {
          status: "processing",
          url: null,
          taskId,
          scenesDone: 0,
          totalScenes,
        });
        // A(optionA) = Omni 지브리 직행 / B(optionB) = 실사 포토무비(나노바나나 스틸 → Veo Lite 사진→영상) = 관리자 토글 분기
        const useOptionB = adminVideoOptionMode === "optionB";
        res.status(202).json({
          taskId,
          day,
          totalScenes,
          estimatedCostUsd: (useOptionB
            ? totalScenes * B_COST_PER_SCENE_USD
            : totalScenes * SCENE_SECONDS * COST_PER_SECOND_USD
          ).toFixed(2),
        });

        // 백그라운드 파이프라인 (응답 후 진행, 진행률 = video_by_day.scenesDone 폴링)
        void (async () => {
          try {
            // ⚠️ 2026-08-07 사장님 승인 = 저장 열쇠 없으면 씬 생성(유료) 전에 즉시 실패 = 비용 유출 0
            //   (런던 121 = 열쇠 미등록인데 6씬 €1.58 과금 후 합치기에서 사망 → 이 검사가 그 순서를 뒤집음)
            if (!isR2Configured())
              throw new Error(
                "저장 창고(R2) 열쇠 미등록 = 영상을 만들어도 저장할 수 없어 시작 전 중단(관리자: Replit Secrets 확인)",
              );
            const today = new Date().toISOString().slice(0, 10);
            // 메인앱 city_id(cities)는 발굴 도시 테이블과 별개 체계 = 출입증은 null(런타임) 발급 (2026-07-22 실측: id 직전달 = 가짜도시 차단)
            const apiKey = await issueApiKey(
              pool,
              "GEMINI_API_KEY",
              null,
              today,
              true,
            );
            const user = itin.userId
              ? await storage.getUser(itin.userId)
              : null;
            const { rawData: _omit, ...meta } = itin as any;
            // ⚠️ 2026-08-22 사장님 승인(A+B+C) = 캐스팅 재료(누구랑·인원·나이) = rawData(생성 산출물=진실) 우선(읽을 때 조립).
            //   컬럼은 8/9 개편 이후 디폴트(Couple/2)로 남아 4인 가족 영상이 커플로 캐스팅되던 원인 = 옛 여정도 이 줄로 전부 정확.
            for (const k of [
              "companionType",
              "companionCount",
              "companionAges",
            ])
              if (_omit?.[k] != null) meta[k] = _omit[k];
            const sb = await buildGhibliStoryboard({
              itinerary: meta,
              user,
              day,
              slots: sceneSlots,
              apiKey,
              language: lang,
            });
            // 데이터 소스 = 사장님 SSOT 2026-07-23: 대사 = editorial_summary / 카드 요약 = summary_ko / 카드 장소명 = name_local
            sb.scenes.forEach((s, i) => {
              const es = sceneSlots[i]?.editorialSummary;
              // ko = 우리 DB 문구 그대로(톤앤매너 통일) / 비ko = 제미니가 쓴 사용자 언어 나레이션 유지(2026-08-22 사장님 승인)
              if (es && lang === "ko") s.narrationKo = es;
            });
            // 카드 요약 = 슬롯 summaryKo 우선, 없으면 PSR.summary_ko 직조회(name_local 과 동일 로직)
            const psrSummary = await resolveSummaries(sceneSlots);
            const scenesMeta = sb.scenes.map((s, i) => {
              const numId = parseInt(
                String(sceneSlots[i]?.id ?? "").replace(/\D/g, ""),
                10,
              );
              return {
                // 2026-08-22 사장님 원칙 = 장소명 노출 nameEn 1순위(전 언어 공통)
                placeName:
                  sceneSlots[i]?.nameEn ||
                  sceneSlots[i]?.nameLocal ||
                  sceneSlots[i]?.name ||
                  s.placeName,
                // ko = 창고 summary_ko / 비ko = 같은 1콜 응답의 cardSummary(추가호출 0, 2026-08-22 사장님 승인)
                summary:
                  lang === "ko"
                    ? sceneSlots[i]?.summaryKo || psrSummary[numId] || ""
                    : (s as any).cardSummary || "",
              };
            });
            const narrator = narratorFromCast(sb.cast); // 나레이터 음색 = 출연진 연령대·성별 연동
            let done = 0;
            // 씬 하나 실패해도 전체 폐기 금지 = 성공한 씬만 모아 완성(사장님 SSOT 2026-07-23 = 사용자를 마냥 기다리게 안 함).
            // 실패 씬 = null 반환 → 아래 filter 로 제외 후 stitch. try/catch 가 mapLimit 예외 전파 차단.
            const rawClips = await mapLimit(
              sb.scenes,
              SCENE_CONCURRENCY,
              async (scene, i) => {
                try {
                  // ⚠️ 2026-08-07 사장님 승인 = 씬 낱개 즉시 R2 보존 + 재시도 재활용(외부 재과금 0).
                  //   키 = 여정·일차·씬순번·슬롯·스타일 + 지문. 지문 재료는 출처별로 다름(2026-08-22 판단3종 회귀 지적 반영):
                  //   - 수동 스토리보드 = 연출(visualPrompt·대사)+사진 → 연출 바꾸면 새 생성, 같으면 재활용.
                  //   - 제미니 스토리보드 = 매 호출 새 문장이라 연출을 지문에 넣으면 재시도 재활용이 영원히 불일치 → **안정 재료(사진+창고 문구)만** = 옛 재활용 동작 유지.
                  const slotKeyId = String(sceneSlots[i]?.id ?? i).replace(
                    /[^A-Za-z0-9_-]/g,
                    "",
                  );
                  const slotImage = sceneSlots[i]?.image;
                  const fpSource =
                    sb.source === "manual"
                      ? `${scene.visualPrompt}|${scene.narrationKo}|${slotImage || ""}`
                      : `${slotImage || ""}|${sceneSlots[i]?.editorialSummary || ""}|${sceneSlots[i]?.summaryKo || ""}`;
                  const sceneFp = crypto
                    .createHash("md5")
                    .update(fpSource)
                    .digest("hex")
                    .slice(0, 8);
                  const sceneKey = `itinerary-videos/${id}/scenes/d${day}-s${scene.sceneIndex}-p${slotKeyId}-${useOptionB ? "b" : "a"}-${sceneFp}.mp4`;
                  let buf: Buffer | null = await getFromR2(sceneKey);
                  const reused = !!buf;
                  if (buf) {
                    console.log(
                      `[video] ${taskId} 씬${scene.sceneIndex} = 보존본 재활용(재과금 0): ${sceneKey}`,
                    );
                  } else if (useOptionB) {
                    // B = ①실사진+캐릭터 합성 스틸 → ②Veo Lite 첫프레임 영상 (일관성 = 스틸이 보장)
                    const still = await composeSceneStill(
                      sceneStillPrompt(
                        scene,
                        sb.cast.totalTravelerCount,
                        !!slotImage,
                      ),
                      {
                        apiKey,
                        referenceImages: [
                          ...(slotImage ? [{ url: slotImage }] : []), // 실사진 없는 슬롯(드묾) = 캐릭터 참조만
                          ...sb.referenceImagePaths.map((p) => ({ path: p })),
                        ],
                        contextId: null,
                        rawTag: `nano-i${id}-d${day}-s${scene.sceneIndex}`,
                      },
                    );
                    buf = await animateStillToClip(
                      scenePhotoMotionPrompt(scene, narrator, lang),
                      {
                        apiKey,
                        imageBuffer: still,
                        imageMimeType: "image/png",
                        durationSeconds: SCENE_SECONDS,
                        contextId: null,
                        rawTag: `veo-i${id}-d${day}-s${scene.sceneIndex}`,
                      },
                    );
                  } else {
                    buf = await generateSceneClip(
                      sceneClipPrompt(scene, narrator, lang),
                      {
                        apiKey,
                        referenceImages: sb.referenceImagePaths.map((p) => ({
                          path: p,
                        })),
                        aspectRatio: "9:16",
                        contextId: null,
                        rawTag: `omni-i${id}-d${day}-s${scene.sceneIndex}`,
                      },
                    );
                  }
                  // 신규 생성 씬 = 즉시 낱개 보존(합치기 전에 죽어도 씬 자산 유지 = 재시도가 위 getFromR2 로 집음).
                  //   보존 실패 = 로그만(클립은 메모리에 있어 이번 완성은 계속).
                  if (!reused && buf)
                    await uploadToR2(sceneKey, buf, "video/mp4").catch((e) =>
                      console.error(
                        `[video] ${taskId} 씬${scene.sceneIndex} 낱개보존 실패(완성은 계속):`,
                        (e as Error)?.message,
                      ),
                    );
                  // await = 진행률 쓰기가 최종 succeeded 쓰기를 늦게 덮는 레이스 차단 (§22 code-review)
                  done++;
                  await setDayVideo(id, day, {
                    status: "processing",
                    url: null,
                    taskId,
                    scenesDone: done,
                    totalScenes,
                    scenes: scenesMeta,
                  });
                  return buf;
                } catch (sceneErr) {
                  // 이 씬만 실패(uri 누락·타임아웃 등) = 로그 후 제외 = 나머지 씬으로 완성 진행
                  console.error(
                    `[video] ${taskId} 씬${scene.sceneIndex} 실패(제외):`,
                    (sceneErr as Error)?.message,
                  );
                  return null;
                }
              },
            );
            // 성공 씬만 = 클립·카드메타 동일 필터(같은 인덱스) → 카드 인덱스(재생시간÷씬수)와 영상 싱크 유지
            const clips = rawClips.filter((b): b is Buffer => b != null);
            const okScenesMeta = scenesMeta.filter(
              (_, i) => rawClips[i] != null,
            );
            if (!clips.length)
              throw new Error("모든 씬 생성 실패 = 완성할 클립 없음");
            console.log(
              `[video] ${taskId} 성공 씬 ${clips.length}/${totalScenes} = 완성 진행`,
            );
            const url = await stitchAndUpload(clips, id, day);
            await setDayVideo(id, day, {
              status: "succeeded",
              url,
              taskId,
              scenesDone: clips.length,
              totalScenes: clips.length,
              scenes: okScenesMeta,
            });
            // 🪙 2026-08-06 사장님 승인 = 차감 = **완성·게시 시점**(성공 씬 ≥ min(6, 요청 씬수)만 유료 = "최소 6씬" SSOT.
            //   씬이 6개 못 되는 짧은 날짜는 전 씬 성공 = 유료). 미달 완성 = 무료 서비스(게시는 유지).
            //   res=null = 백그라운드(402 불가) = 시작 시 precheckFeature 가 이미 걸렀고, 그 사이 잔액 소진이면
            //   차감 실패 = 로그만(완성 자산은 이미 존재 = 사용자 경험 우선 = 사장님 관점).
            //   ⚠️ 자체 try/catch = §22 판단검증 지적(2026-08-06): 차감 중 DB 예외가 바깥 catch 로 가면
            //   이미 기록된 succeeded(완성 영상 포인터)를 failed 로 덮어씀 = 유료 자산 소실. 게시 쿼리와 동일 보호.
            if (clips.length >= Math.min(6, totalScenes)) {
              await chargeOnSuccess(requesterUserId, "day_video", {
                referenceId: taskId,
                tag: `일별 영상 ${taskId}`,
              });
            } else {
              console.log(
                `[video] ${taskId} 성공 씬 ${clips.length} < ${Math.min(6, totalScenes)} = 무료 게시(차감 없음)`,
              );
            }
            // 📥 완료 = 신청자 프로필 자동 게시 (2026-08-03 사장님 확정 = 벨 알림 안 씀 §19).
            //   is_new=true = ★ 표식 + 하단 TRIPIS 탭 뱃지의 원천. 재생성(이미 담긴 행)도 다시 true = 새 완성 알림.
            //   게시 실패해도 영상 자체(succeeded)는 이미 기록됨 = 유료 자산 손실 없음 → 로그만.
            //   ⚠️ 수정금지(승인필요) 2026-08-20 §22 판단검증 지적 = created_at 도 재생성 시 함께 갱신.
            //     안 하면 도시대표카드 최신영상 정렬(city-place-routes.ts)이 옛 완성시각을 계속 봐서
            //     방금 재생성한 게 더 최신인데도 순위에서 밀림 = is_new 갱신과 같은 "새 완성" 의미인데 반쪽만 갱신되던 것.
            if (requesterUserId && pool) {
              await pool
                .query(
                  `INSERT INTO saved_videos (user_id, itinerary_id, day, is_new)
                   VALUES ($1, $2, $3, true)
                   ON CONFLICT ON CONSTRAINT saved_videos_user_itin_day_uniq
                   DO UPDATE SET is_new = true, created_at = now()`,
                  [requesterUserId, id, day],
                )
                .catch((pubErr) =>
                  console.error(
                    `[video] ${taskId} 자동게시 실패:`,
                    (pubErr as Error)?.message,
                  ),
                );
            }
            console.log(
              `[video] ${taskId} 완료(${useOptionB ? "B실사포토무비" : "A지브리"}): ${url}`,
            );
          } catch (e) {
            console.error(`[video] ${taskId} 실패:`, e);
            // ⚠️ 2026-08-06 사장님 승인 = 실패 **사유를 DB 에 기록**(화면이 그대로 표시 = 뭉개기 금지 SSOT).
            //   차감은 성공 시점으로 이동했으므로 실패 = 차감 0 = 환불 불필요(런던 121 사고 근본해결).
            await setDayVideo(id, day, {
              status: "failed",
              url: null,
              taskId,
              scenesDone: 0,
              totalScenes,
              error: String((e as Error)?.message || e).slice(0, 300),
            });
          }
        })();
      } catch (error) {
        console.error("[video] generate 오류:", error);
        res.status(500).json({ error: "영상 생성 시작 실패" });
      }
    },
  );

  // 3. 일별 영상 상태 조회 (폴링 = 진행률·완료 URL)
  app.get("/api/itineraries/:id/video", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "잘못된 id" });
      const itin = await storage.getItinerary(id);
      if (!itin) return res.status(404).json({ error: "여정 없음" });
      // 죽은 processing = failed 로 표시 변환 = FE 무한 폴링 탈출 + 재시도 버튼 노출 (재생성은 generate 의 stale 허용이 담당)
      const videoByDay: Record<string, DayVideo> = {
        ...((itin as any).videoByDay || {}),
      };
      for (const [d, v] of Object.entries(videoByDay)) {
        if (isStaleProcessing(v)) videoByDay[d] = { ...v, status: "failed" };
      }
      res.json({ videoByDay, optionMode: adminVideoOptionMode });
    } catch (error) {
      console.error("[video] 상태조회 오류:", error);
      res.status(500).json({ error: "상태 조회 실패" });
    }
  });

  // ── 4. 저장한 영상 = 프로필 담기 (2026-08-03 사장님 확정) ──────────────────────
  //   영상 = 회사 자산(여정 video_by_day) → 저장 = 사용자↔(여정,일차) 연결 행 = saved_videos (해설 guides 와 같은 DB 방식).
  //   프로필 '나의 TRIPIS' 영상 카드 = 이 목록만 보여준다. 기기 다운로드 없음(속도·유출 = 앱에 와서 보게 하는 구조).

  // 4-1. 내가 담은 영상 목록 (여정 제목·시작일·영상 상태 동봉. 여정이 지워졌거나 영상이 더는 완성 상태가 아니면 제외)
  //   ⚠️ 2026-08-06 사장님 승인 = **관리자 = 전체 상황판** = 모든 사용자의 담긴 영상(콘텐츠 소유권 = 회사).
  //     패턴 = 전문가 문의함(expert-routes)과 동형 = role 이 admin 이면 본인 필터를 안 붙임. 역할 = getRoleFromDb 1벌.
  app.get("/api/videos/saved", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      if (!pool) return res.status(500).json({ error: "DB 미연결" });
      const isAdmin = (await getRoleFromDb(userId)) === "admin";
      const r = await pool.query(
        // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = city_name_en = 읽을 때 이어붙이는 도시 영문명(§16).
        //   title 은 생성 시점 언어로 굳어("리마 3일 여행") 앱 언어를 바꿔도 도시명이 한국어로 남는다.
        //   cities.name_en 은 121개 도시 전부 보유(결측 0) = 옛 영상 카드도 즉시 영어 표기.
        `SELECT sv.itinerary_id, sv.day, sv.is_new, sv.created_at,
                i.title, i.start_date, c.name_en AS city_name_en
           FROM saved_videos sv
           JOIN itineraries i ON i.id = sv.itinerary_id
           LEFT JOIN cities c ON c.id = i.city_id
          WHERE ($2 OR sv.user_id = $1)
            AND i.video_by_day -> (sv.day::text) ->> 'status' = 'succeeded'
          ORDER BY sv.is_new DESC, sv.created_at DESC, sv.day`,
        [userId, isAdmin],
      );
      res.json(
        r.rows.map((row) => ({
          itineraryId: row.itinerary_id,
          day: row.day,
          isNew: row.is_new,
          title: row.title,
          cityNameEn: row.city_name_en, // 화면이 제목의 도시명을 이 값으로 갈아끼운다(§16)
          startDate: row.start_date,
          savedAt: row.created_at,
        })),
      );
    } catch (error) {
      console.error("[video] 저장목록 오류:", error);
      res.status(500).json({ error: "저장 목록 조회 실패" });
    }
  });

  // 4-2. [저장] = 담기 (생성기 우측 상단 버튼. 완성된 영상만 담을 수 있다. 이미 담김 = 그대로 성공)
  app.post("/api/videos/save", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      if (!pool) return res.status(500).json({ error: "DB 미연결" });
      const itineraryId = parseInt(req.body?.itineraryId);
      const day = parseInt(req.body?.day);
      if (isNaN(itineraryId) || isNaN(day) || day < 1)
        return res.status(400).json({ error: "itineraryId + day 필요" });
      // 담을 대상 검증 = 그 여정 그 날짜에 완성(succeeded) 영상이 실제로 있는가
      const chk = await pool.query(
        `SELECT 1 FROM itineraries
          WHERE id = $1 AND video_by_day -> ($2::text) ->> 'status' = 'succeeded'`,
        [itineraryId, String(day)],
      );
      if (!chk.rowCount)
        return res.status(404).json({ error: "완성된 영상이 없는 날짜" });
      // 본인이 직접 담음 = 이미 아는 영상 = is_new false (뱃지는 완료 자동게시 전용)
      await pool.query(
        `INSERT INTO saved_videos (user_id, itinerary_id, day, is_new)
         VALUES ($1, $2, $3, false)
         ON CONFLICT ON CONSTRAINT saved_videos_user_itin_day_uniq DO NOTHING`,
        [userId, itineraryId, day],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[video] 담기 오류:", error);
      res.status(500).json({ error: "저장 실패" });
    }
  });

  // 4-3. 탭 뱃지 수 = 아직 안 열어 본 완성 영상 수 (게스트 = 0. 전문가 뱃지와 같은 폴링 대상)
  app.get("/api/videos/badge", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId || !pool) return res.json({ count: 0 });
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM saved_videos WHERE user_id = $1 AND is_new`,
        [userId],
      );
      res.json({ count: r.rows[0]?.n || 0 });
    } catch (error) {
      console.error("[video] 뱃지 오류:", error);
      res.json({ count: 0 }); // 뱃지는 장식 = 실패가 앱을 막으면 안 됨
    }
  });

  // 4-4. 열람 = ★·뱃지 해제 (사장님 SSOT = "이 영상 뷰를 1회 열 때부터 뱃지 해제")
  app.post("/api/videos/seen", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      if (!pool) return res.status(500).json({ error: "DB 미연결" });
      const itineraryId = parseInt(req.body?.itineraryId);
      const day = parseInt(req.body?.day);
      if (isNaN(itineraryId) || isNaN(day))
        return res.status(400).json({ error: "itineraryId + day 필요" });
      await pool.query(
        `UPDATE saved_videos SET is_new = false
          WHERE user_id = $1 AND itinerary_id = $2 AND day = $3`,
        [userId, itineraryId, day],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[video] 열람해제 오류:", error);
      res.status(500).json({ error: "열람 처리 실패" });
    }
  });
}
