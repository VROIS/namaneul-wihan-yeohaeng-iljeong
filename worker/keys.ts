// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Worker 열쇠 공급 = DB api_keys → process.env + MAX(updated_at) 판형 무효화 (정본 B1)
import type { Sql } from "postgres";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { apiKeys } from "../shared/schema";

let keysLoaded = false;

let loadedStamp = "";

let stampCheckedAt = 0;

let loadingPromise: Promise<void> | null = null;

const STAMP_TTL_MS = 30_000;

interface ApiKeyRow {
  key_name: string;
  key_value: string;
}

interface StampRow {
  stamp: string;
}

function applyKey(keyName: string, value: string): void {
  process.env[keyName] = value;
  if (keyName === "GEMINI_API_KEY") {
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY = value;
  }
  if (keyName === "GOOGLE_MAPS_API_KEY") {
    process.env.Google_maps_api_key = value;
  }
  if (
    keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
    keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
  ) {
    process.env.GOOGLE_CLIENT_ID = value;
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = value;
  }
}

function clearKey(keyName: string): void {
  delete process.env[keyName];
  if (keyName === "GEMINI_API_KEY") {
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  }
  if (keyName === "GOOGLE_MAPS_API_KEY") {
    delete process.env.Google_maps_api_key;
  }
  if (
    keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
    keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
  ) {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  }
}

let appliedNames: string[] = [];

async function readStamp(db: Sql): Promise<string> {
  const rows = await db<StampRow[]>`
    SELECT coalesce(max(updated_at)::text, '') || '#' || count(*)::text AS stamp
    FROM api_keys
    WHERE is_active IS TRUE
      AND key_value IS NOT NULL
      AND btrim(key_value) <> ''
  `;
  return rows[0]?.stamp ?? "";
}

async function loadKeys(db: Sql): Promise<void> {
  const rows = await db<ApiKeyRow[]>`
    SELECT key_name, key_value
    FROM api_keys
    WHERE is_active IS TRUE
      AND key_value IS NOT NULL
      AND btrim(key_value) <> ''
  `;

  const nextNames: string[] = [];
  for (const row of rows) {
    applyKey(row.key_name, row.key_value.trim());
    nextNames.push(row.key_name);
  }
  for (const name of appliedNames) {
    if (!nextNames.includes(name)) clearKey(name);
  }
  appliedNames = nextNames;

  loadedStamp = await readStamp(db);
  stampCheckedAt = Date.now();
  console.log(`[Worker] Loaded ${nextNames.length} API keys from database`);
}

export async function ensureKeys(db: Sql): Promise<void> {
  if (loadingPromise) return loadingPromise;

  if (keysLoaded) {
    if (Date.now() - stampCheckedAt < STAMP_TTL_MS) return;
    try {
      const stamp = await readStamp(db);
      stampCheckedAt = Date.now();
      if (stamp === loadedStamp) return;
      console.log("[Worker] API keys changed in database — reloading");
    } catch (error) {
      console.error("[Worker] Failed to check API key version:", error);
      return;
    }
  }

  loadingPromise = loadKeys(db)
    .then(() => {
      keysLoaded = true;
    })
    .catch((error: unknown) => {
      keysLoaded = false;
      console.error("[Worker] Failed to load API keys from database:", error);
      throw error;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export function invalidateKeys(): void {
  keysLoaded = false;
  loadedStamp = "";
  stampCheckedAt = 0;
}

// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 열쇠 1개 읽기 = readKey 1벌(채워진 값 먼저 → 없으면 api_keys 1행 → 별칭은 applyKey), 지도·제미니·소셜 로그인은 이름만 다르게 부른다 (정본 9-28)
type Db = PgDatabase<PgQueryResultHKT, any>;

async function readKey(
  db: Db,
  keyName: string,
  lookup: string[],
): Promise<string> {
  for (const n of lookup) if (process.env[n]) return process.env[n] as string;
  const [row] = await db
    .select({ v: apiKeys.keyValue })
    .from(apiKeys)
    .where(eq(apiKeys.keyName, keyName));
  const v = row?.v?.trim();
  if (!v) return "";
  applyKey(keyName, v);
  return v;
}

export const readMapsKey = (db: Db) =>
  readKey(db, "GOOGLE_MAPS_API_KEY", [
    "GOOGLE_MAPS_API_KEY",
    "Google_maps_api_key",
  ]);

export const readGeminiKey = (db: Db) =>
  readKey(db, "GEMINI_API_KEY", [
    "AI_INTEGRATIONS_GEMINI_API_KEY",
    "GEMINI_API_KEY",
  ]);

export async function readSocialKeys(db: Db): Promise<void> {
  await readKey(db, "GOOGLE_CLIENT_ID", [
    "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_ID",
  ]);
  for (const n of [
    "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
    "KAKAO_REST_API_KEY",
    "KAKAO_NATIVE_APP_KEY",
    "KAKAO_JWKS",
  ])
    await readKey(db, n, [n]);
}
