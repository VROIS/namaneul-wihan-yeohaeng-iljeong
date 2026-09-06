// Cloudflare Worker 이관 = 영상 설정 2건 (2026-09-06)
// 원본 = server/video-routes.ts:99 GET /api/admin/video-config
//        server/video-routes.ts:102 POST /api/admin/video-config
//
// 원본은 모듈 최상단 변수 `let adminVideoOptionMode`(server/video-routes.ts:39) 를 읽고 쓴다.
// Replit 은 프로세스 1벌이라 변수로 됐지만, Worker 는 isolate 가 여러 벌이라
// POST 를 받은 isolate 와 GET 을 받는 isolate 가 달라 설정이 안 먹는다.
// → 같은 값을 기존 표 api_service_status 의 행 1개(service_name='admin_video_option_mode')에 담는다.
//   응답 형식·상태코드·필드명은 원본과 100% 같다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const { apiServiceStatus } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

/** 원본 server/video-routes.ts:39 의 타입 그대로. */
type VideoOptionMode = "optionA" | "optionB";

/**
 * 원본 server/video-routes.ts:39 의 기본값 그대로 = "optionB".
 * (원본 주석:38 = 디폴트 B(실사 포토무비, 씬당 $0.35 = 원가 절감), 필요시 대시보드에서 A 전환)
 */
export const DEFAULT_OPTION_MODE: VideoOptionMode = "optionB";

/** api_service_status 안에서 이 설정이 앉는 행. service_name 이 UNIQUE 라 열쇠 역할을 한다. */
const OPTION_MODE_SERVICE = "admin_video_option_mode";

/**
 * 값을 담는 칸 = display_name.
 * 근거 = 이 표에서 NOT NULL 인 text 칸은 service_name(열쇠)·display_name 둘뿐이고,
 * display_name 은 어떤 코드도 쓰지 않는(사람이 정해 넣는) 유일한 칸이다
 * (유일한 쓰기 = server/services/exchange-rate.ts:28 = last_*·is_configured 만 건드린다).
 * last_error_message 는 그 쓰기가 실제로 쓰는 "오류 문구" 칸이라 설정값을 넣으면 뜻이 어긋난다.
 */
const OPTION_MODE_COLUMN = apiServiceStatus.displayName;

/** 원본 server/video-routes.ts:104 의 판정 그대로 = optionA / optionB 둘만 통과. */
function isOptionMode(v: unknown): v is VideoOptionMode {
  return v === "optionA" || v === "optionB";
}

/**
 * 저장된 값을 읽는다. 행이 없거나·값이 깨졌으면 기본값.
 * 원본은 변수라 항상 값이 있었다(= 재시작 직후엔 기본값). 여기서도 같은 뜻이 되게 한다.
 */
export async function readOptionMode(db: Db): Promise<VideoOptionMode> {
  try {
    const [row] = await db
      .select({ value: OPTION_MODE_COLUMN })
      .from(apiServiceStatus)
      .where(eq(apiServiceStatus.serviceName, OPTION_MODE_SERVICE))
      .limit(1);
    return isOptionMode(row?.value) ? row.value : DEFAULT_OPTION_MODE;
  } catch (e) {
    // 원본 GET(:99) 은 절대 실패하지 않았으므로, 여기서도 500 대신 기본값을 낸다.
    console.error(
      "[video-config] 설정 읽기 실패 = 기본값 사용:",
      (e as { message?: string })?.message || e,
    );
    return DEFAULT_OPTION_MODE;
  }
}

export function registerVideoConfigRoutes(app: Express, openDb: OpenDb): void {
  // ── 원본 server/video-routes.ts:99 GET /api/admin/video-config ───────────
  app.get("/api/admin/video-config", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const mode = await readOptionMode(db);
      // 원본:100 = res.json({ success: true, currentOptionMode: adminVideoOptionMode })
      res.json({ success: true, currentOptionMode: mode });
    } finally {
      close();
    }
  });

  // ── 원본 server/video-routes.ts:102 POST /api/admin/video-config ─────────
  app.post("/api/admin/video-config", async (req: Request, res: Response) => {
    // 원본:103-105 = optionMode 가 optionA/optionB 가 아니면 400 + 같은 문구.
    // (원본은 body 검증을 DB 접근 전에 했다 = 여기서도 연결을 열기 전에 한다)
    const optionMode: unknown = (req.body || {}).optionMode;
    if (!isOptionMode(optionMode)) {
      return res.status(400).json({ error: "optionMode = optionA | optionB" });
    }

    const { db, close } = openDb();
    try {
      // 원본:106 `adminVideoOptionMode = optionMode` = 덮어쓰기. 표에서는 upsert.
      await db
        .insert(apiServiceStatus)
        .values({
          serviceName: OPTION_MODE_SERVICE,
          displayName: optionMode,
        })
        .onConflictDoUpdate({
          target: apiServiceStatus.serviceName,
          set: { displayName: optionMode, updatedAt: sql`now()` },
        });
      // 원본:107 = res.json({ success: true, updatedOptionMode: adminVideoOptionMode })
      res.json({ success: true, updatedOptionMode: optionMode });
    } catch (e) {
      // 원본에는 없는 갈래다(변수 대입은 실패하지 않는다).
      // 저장이 실제로 안 됐으므로 성공을 내면 거짓말이 된다.
      console.error(
        "[video-config] 설정 저장 실패:",
        (e as { message?: string })?.message || e,
      );
      res.status(500).json({ error: "설정 저장 실패" });
    } finally {
      close();
    }
  });
}
