// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Worker 열쇠 공급 = DB api_keys → process.env + MAX(updated_at) 판형 무효화 (정본 B1)
import type { Sql } from "postgres";

/**
 * 캐시 상태 3개만 모듈 전역에 둔다.
 * 이유: Cloudflare Worker 는 isolate 를 여러 요청이 재사용하지만, 그 isolate 가
 * 어떤 사용자의 요청을 받을지는 알 수 없다. 요청에서 나온 데이터를 전역에 두면
 * 다른 사용자의 요청으로 새어나간다. 반면 이 값들은 "이 isolate 의 process.env 를
 * 언제·어느 판형으로 채웠는가" 라는 isolate 자신의 상태일 뿐, 요청·사용자별 데이터가
 * 아니므로 안전하다. process.env 에 담기는 열쇠도 전 요청 공통 값(사용자 데이터 아님)이다.
 * 모듈 전역은 isolate 가 죽으면 사라지지만, 이건 캐시일 뿐 정본이 아니므로 다시 읽으면 그만이다.
 */
let keysLoaded = false;

/** 마지막으로 채운 판형 = api_keys 의 MAX(updated_at) + 행수. 이게 바뀌면 다시 읽는다. */
let loadedStamp = "";

/** 판형을 마지막으로 확인한 시각(ms). TTL 안이면 확인 자체를 건너뛴다. */
let stampCheckedAt = 0;

/** 여러 요청이 동시에 첫 진입할 때 DB 조회를 1회로 합치기 위한 진행 중 약속. */
let loadingPromise: Promise<void> | null = null;

/**
 * 판형 확인 주기(ms).
 * 근거 = 세 가지 비용의 균형.
 *  ① 매 요청 확인 = 열쇠가 필요한 모든 요청에 DB 왕복 1회 추가.
 *     src.ts:105~117 주석의 실측대로 Worker 는 요청당 연결이 늘면 Hyperdrive 6연결
 *     상한(hyperdrive/gotchas.md:5-8)에 걸려 응답이 멈춘다 = 못 씀.
 *  ② 너무 길면 = 관리자가 DELETE 로 지운 열쇠를 다른 isolate 가 그동안 계속 써서
 *     유료 외부호출이 나간다 = 이 작업이 막으려는 바로 그 사고.
 *  ③ 30초 = 관리자 화면에서 저장 후 새로고침 한 번 하는 사이에 반영되는 체감 지연이면서,
 *     열쇠 라우트 호출 빈도(관리자 전용 = 분당 수 회) 대비 DB 부하가 무시할 수준.
 *     KV(kv/gotchas.md:5-8) 도 전세계 전파가 최대 60초라 이보다 빠르지 않다.
 */
const STAMP_TTL_MS = 30_000;

interface ApiKeyRow {
  key_name: string;
  key_value: string;
}

interface StampRow {
  stamp: string;
}

/**
 * server/index.ts:334~347 의 별칭 파생을 그대로 재현한다.
 * 원본이 바뀌면 이 함수도 같이 바꾼다(§19 = 1벌만 존재해야 하나, 런타임이 달라 물리적으로 분리됨).
 */
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

/** applyKey 가 심은 이름과 별칭을 되돌린다. DELETE·비활성으로 사라진 열쇠를 지우는 데 쓴다. */
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

/** 이 isolate 가 심어둔 열쇠 이름들. 다음 판형에서 빠진 이름을 지우기 위해 기억한다. */
let appliedNames: string[] = [];

/**
 * 현재 DB 판형 = MAX(updated_at) + 살아있는 행 수.
 * 행 수까지 넣는 이유 = 같은 밀리초에 한 줄이 사라지고 한 줄이 들어오는 경우를 구분하기 위함.
 * api_keys.updated_at = shared/schema/system.ts:153 = NOT NULL + CURRENT_TIMESTAMP 기본값이라
 * 항상 값이 있고, POST/PUT/DELETE 3개 라우트가 모두 이 컬럼을 갱신한다.
 */
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
  // 필터 = server/index.ts:332 와 동일 = is_active 참 + key_value 가 공백 아님.
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
  // 이번 판형에서 빠진 열쇠(DELETE·비활성·값 비움)는 process.env 에서도 지운다.
  // 이걸 안 하면 삭제된 열쇠로 유료 외부호출이 계속 나간다.
  for (const name of appliedNames) {
    if (!nextNames.includes(name)) clearKey(name);
  }
  appliedNames = nextNames;

  loadedStamp = await readStamp(db);
  stampCheckedAt = Date.now();
  console.log(`[Worker] Loaded ${nextNames.length} API keys from database`);
}

/**
 * DB 의 api_keys 를 읽어 process.env 에 채운다.
 * - Worker 는 요청 밖(top-level)에서 I/O 가 금지되므로 반드시 요청 처리 중에 호출한다.
 * - 첫 호출에서 1회 실제 조회한다.
 * - 그 뒤로는 STAMP_TTL_MS 마다 판형(MAX(updated_at)+행수)만 1회 확인하고, 바뀌었을 때만 다시 읽는다.
 * - 실패하면 캐시를 비워 다음 요청이 다시 시도한다(빈 열쇠 영구 고착 방지).
 */
export async function ensureKeys(db: Sql): Promise<void> {
  if (loadingPromise) return loadingPromise;

  if (keysLoaded) {
    if (Date.now() - stampCheckedAt < STAMP_TTL_MS) return;
    // 판형만 확인 = SELECT 1행. 같으면 그대로 두고 확인 시각만 밀어둔다.
    try {
      const stamp = await readStamp(db);
      stampCheckedAt = Date.now();
      if (stamp === loadedStamp) return;
      console.log("[Worker] API keys changed in database — reloading");
    } catch (error) {
      // 확인에 실패했다고 이미 있는 열쇠를 버리지 않는다(운영 중단 방지). 다음 요청이 다시 확인한다.
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

/**
 * 이 isolate 의 열쇠 캐시를 즉시 무효화한다.
 * 열쇠 쓰기 라우트(routes-admin-keys.ts)가 자기 isolate 에 한해 다음 ensureKeys 를
 * 강제로 다시 읽게 만드는 용도. 다른 isolate 는 위의 판형 확인(최대 STAMP_TTL_MS)으로 따라온다.
 */
export function invalidateKeys(): void {
  keysLoaded = false;
  loadedStamp = "";
  stampCheckedAt = 0;
}
