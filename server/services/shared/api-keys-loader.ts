/**
 * ⚠️ 수정금지(승인필요) 2026-05-17 = api_keys DB 테이블 → process.env 로드 (= 헌법 §16)
 *
 * = server/index.ts:296-322 startup loader 의 CLI 버전 = scripts/* 에서 호출.
 * = 사용자 SSOT (= 2026-05-17) = "모든 키 = db api_keys 에 다 있음".
 * = 추가 매핑 (= GEMINI_API_KEY → AI_INTEGRATIONS_GEMINI_API_KEY) = server/index.ts 와 동일.
 */

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
      process.env[key.keyName] = key.keyValue;
      // 추가 매핑 (= server/index.ts:304-313 동일)
      if (key.keyName === "GEMINI_API_KEY") {
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY = key.keyValue;
      }
      if (key.keyName === "GOOGLE_MAPS_API_KEY") {
        process.env.Google_maps_api_key = key.keyValue;
      }
      if (
        key.keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
        key.keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
      ) {
        process.env.GOOGLE_CLIENT_ID = key.keyValue;
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = key.keyValue;
      }
      loaded++;
    } else {
      skipped++;
    }
  }
  return { loaded, skipped };
}
