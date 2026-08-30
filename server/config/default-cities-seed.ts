import { db } from "../db";
import { cities } from "../../shared/schema";
import { DEFAULT_CITIES_PART1 } from "./default-cities-seed-1";
import { DEFAULT_CITIES_PART2 } from "./default-cities-seed-2";

export const DEFAULT_CITIES = [
  ...DEFAULT_CITIES_PART1,
  ...DEFAULT_CITIES_PART2,
];

export async function seedDefaultCities() {
  for (const city of DEFAULT_CITIES) {
    try {
      await db.insert(cities).values(city).onConflictDoNothing();
    } catch (e) {}
  }
}
