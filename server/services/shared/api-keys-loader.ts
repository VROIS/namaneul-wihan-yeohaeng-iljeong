/** ⚠️ 수정금지(승인필요) 2026-05-17 = api_keys DB 테이블 → process.env 로드 (= 헌법 §16) */

import { db, isDatabaseConnected } from "../../db";
import { apiKeys } from "@shared/schema";

export interface ApiKeysLoadResult {
  loaded: number;
  skipped: number;
}

export async function loadApiKeysFromDb(): Promise<ApiKeysLoadResult> {
  if (!isDatabaseConnected() || !db) {
    throw new Error("DB unavailable = api_keys 로드 실패");
  }
  const keys = await db.select().from(apiKeys);
  let loaded = 0;
  let skipped = 0;
  for (const key of keys) {
    if (key.keyValue && key.keyValue.trim() !== "" && key.isActive) {
      const value = key.keyValue.trim();
      process.env[key.keyName] = value;
      if (key.keyName === "GEMINI_API_KEY") {
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY = value;
      }
      if (key.keyName === "GOOGLE_MAPS_API_KEY") {
        process.env.Google_maps_api_key = value;
      }
      if (
        key.keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
        key.keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
      ) {
        process.env.GOOGLE_CLIENT_ID = value;
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = value;
      }
      loaded++;
    } else {
      skipped++;
    }
  }
  return { loaded, skipped };
}
