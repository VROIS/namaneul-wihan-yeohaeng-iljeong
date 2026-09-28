// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 하루 영상 재료(출연진·번역·도시)와 일차 기록·프로필 게시 1벌 = 영상 생성과 게시 도구가 같이 쓴다 (정본 §)
import type { GhibliCast } from "./lib/services/character-roster-ghibli";
import { db, pool } from "./lib/db";
import { getUser } from "../../shared/users";
import type { DayVideo } from "../../shared/schema";
import { videoDir } from "../../shared/r2-paths";
import {
  castForItinerary,
  slotPlaceId,
  type PlaceTranslation,
} from "./lib/services/omni-day-clips";

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 일차 영상 기록·프로필 게시 1벌(재생성 시 created_at 갱신 포함) = 영상 생성과 게시 도구가 같이 쓴다 (정본 §)
export async function setDayVideo(
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

export async function publishToProfile(
  userId: string,
  itineraryId: number,
  day: number,
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO saved_videos (user_id, itinerary_id, day, is_new)
           VALUES ($1, $2, $3, true)
           ON CONFLICT ON CONSTRAINT saved_videos_user_itin_day_uniq
           DO UPDATE SET is_new = true, created_at = now()`,
    [userId, itineraryId, day],
  );
}

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 사용자 언어 번역본 읽기(place_translations) = 옴니 대사 재료 (정본 §)
export async function placeTranslations(
  slots: any[],
  lang: string,
): Promise<Map<number, PlaceTranslation>> {
  const map = new Map<number, PlaceTranslation>();
  const ids = slots.map(slotPlaceId).filter((n) => !isNaN(n));
  if (lang === "ko" || !pool || !ids.length) return map;
  const r = await pool.query(
    "SELECT place_id, editorial_summary FROM place_translations WHERE language = $1 AND place_id = ANY($2::int[])",
    [lang, ids],
  );
  for (const row of r.rows)
    map.set(row.place_id, { editorialSummary: row.editorial_summary });
  return map;
}

// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 영상 도시 = 도시 표 영어 이름(지시문·배웅 카드), 도시 번호 없는 여정만 목적지 글자, R2 폴더 = 번호만 (정본 K3)
export async function videoCity(
  itin: Record<string, any>,
): Promise<{ name: string; folder: string }> {
  const destination = String((itin.rawData as any)?.destination || "");
  const cityId: number | null = itin.cityId ?? null;
  const folder = videoDir(cityId, itin.id);
  if (!cityId || !pool) return { name: destination, folder };
  const r = await pool.query("SELECT name_en FROM cities WHERE id = $1", [
    cityId,
  ]);
  const nameEn: string | null = r.rows[0]?.name_en || null;
  return { name: nameEn || destination, folder };
}

export async function tripInputs(itin: Record<string, any>) {
  const user = itin.userId ? await getUser(db!, itin.userId) : null;
  const { rawData: _omit, ...meta } = itin as any;
  // ⚠️ 2026-08-22 사장님 승인(A+B+C) = 캐스팅 재료(누구랑·인원·나이) = rawData(생성 산출물=진실) 우선(읽을 때 조립).
  for (const k of ["companionType", "companionCount", "companionAges"])
    if (_omit?.[k] != null) meta[k] = _omit[k];
  return { user, meta };
}

export async function castFor(itin: Record<string, any>): Promise<GhibliCast> {
  const { user, meta } = await tripInputs(itin);
  return castForItinerary(meta, user);
}
