// 기본 도시 시드 데이터(도시 테이블 비었을 때 1회 입력용) = routes.ts 분리(2026-07-15 §0 슬림화, 순수 이동)
// part1(아시아/미주+이탈리아+프랑스) + part2(스페인~폴란드) 합본 + 삽입 함수

import { db } from "../db";
import { cities } from "../../shared/schema";
import { DEFAULT_CITIES_PART1 } from "./default-cities-seed-1";
import { DEFAULT_CITIES_PART2 } from "./default-cities-seed-2";

export const DEFAULT_CITIES = [...DEFAULT_CITIES_PART1, ...DEFAULT_CITIES_PART2];

export async function seedDefaultCities() {
  for (const city of DEFAULT_CITIES) {
    try {
      await db.insert(cities).values(city).onConflictDoNothing();
    } catch (e) {}
  }
}
