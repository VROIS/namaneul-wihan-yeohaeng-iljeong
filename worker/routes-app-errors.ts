// Cloudflare Worker 이관 = 앱 에러 리포트 3건 (2026-09-06)
// 원본 = server/index.ts:74 setupAppErrorReporter (POST:78 / GET:96 / DELETE:107).
//
// 원본은 로컬 파일 `app-errors.log` 에 append / read / truncate 한다.
// Worker 는 파일시스템이 없으므로 같은 3동작을 기존 표 api_logs 로 옮긴다(type='app_error' 로 구분).
//   appendFileSync(원본:93)  → INSERT
//   readFileSync(원본:99)    → SELECT + 원본과 같은 문자열 조립
//   writeFileSync("")(원본:109) → DELETE (type='app_error' 만)
// 응답 형식(본문 문자열·Content-Type·상태코드)은 원본과 100% 같다. 근거는 각 지점 주석에 있다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const { apiLogs } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

/**
 * api_logs 안에서 앱 에러 행만 가리키는 표식.
 * 기존 271행은 전부 type='gemini' 이므로 이 값과 섞이지 않는다.
 */
const APP_ERROR_TYPE = "app_error";

/** 원본 client/lib/error-reporter.ts:17 AppError = 앱이 보내는 1건의 모양. */
interface AppErrorItem {
  message?: unknown;
  stack?: unknown;
  component?: unknown;
  screen?: unknown;
  timestamp?: unknown;
  platform?: unknown;
}

/** 값이 있으면 문자열로, 없으면 빈 문자열. */
function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * 원본 server/index.ts:87 의 한 줄 조립 그대로.
 *   `[{timestamp}] {component || "?"} | {message}` + (stack 있으면 "\n  " + 앞 3줄을 "\n  " 로)
 * api_logs 에는 stack·component·screen·platform 칸이 없으므로
 * 이 한 줄 문자열을 통째로 error_message 에 담는다
 * = GET 이 그 문자열을 그대로 돌려주면 원본 파일 내용과 같아진다.
 */
function formatLine(e: AppErrorItem): string {
  const stack = str(e.stack);
  const head = `[${str(e.timestamp)}] ${str(e.component) || "?"} | ${str(e.message)}`;
  if (!stack) return head;
  // 원본:87 = e.stack.split("\n").slice(0, 3).join("\n  ") 앞에 "\n  " 을 붙인다.
  return head + "\n  " + stack.split("\n").slice(0, 3).join("\n  ");
}

export function registerAppErrorRoutes(app: Express, openDb: OpenDb): void {
  // ── 원본 server/index.ts:78 POST /api/app-errors ─────────────────────────
  app.post("/api/app-errors", async (req: Request, res: Response) => {
    // 원본:79-82 = errors 가 없거나 배열이 아니면 400 { ok: false }.
    const errors: unknown = (req.body || {}).errors;
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ ok: false });
    }

    // 원본:84-91 = 콘솔에 찍을 lines. 저장하는 문자열과 같은 것을 쓴다.
    const lines = (errors as AppErrorItem[]).map(formatLine);

    const { db, close } = openDb();
    try {
      // 원본:93 appendFileSync = 뒤에 덧붙이기. 표에서는 INSERT.
      // (원본이 붙이던 "\n---\n" 구분자는 GET 조립 때 다시 만든다 = 아래 GET 주석)
      if (lines.length > 0) {
        await db.insert(apiLogs).values(
          lines.map((line) => ({
            type: APP_ERROR_TYPE,
            errorMessage: line,
          })),
        );
      }
      // 원본:94 = 서버 콘솔에도 같은 문구로 남긴다.
      console.error(
        `[APP-ERROR] ${errors.length}건 수신:\n${lines.join("\n")}`,
      );
      // 원본:95 = { ok: true, received: n }
      res.json({ ok: true, received: errors.length });
    } catch (e) {
      // 원본에는 없는 갈래다. 원본 appendFileSync 는 실패 시 express 기본 500 으로 갔다.
      // 앱은 응답을 안 보므로(error-reporter.ts:150 빈 catch) 에러 리포트가 앱 동작을 막지 않는다.
      console.error(
        "[APP-ERROR] 저장 실패:",
        (e as { message?: string })?.message || e,
      );
      res.status(500).json({ ok: false });
    } finally {
      close();
    }
  });

  // ── 원본 server/index.ts:96 GET /api/app-errors ──────────────────────────
  app.get("/api/app-errors", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const rows = await db
        .select({ errorMessage: apiLogs.errorMessage })
        .from(apiLogs)
        .where(eq(apiLogs.type, APP_ERROR_TYPE))
        // 원본은 파일이라 append 순서 = 받은 순서. 표에서는 들어온 순서(id) 로 같게 만든다.
        .orderBy(asc(apiLogs.id));

      // 원본:98-101 = 파일이 없으면 "(에러 없음)".
      // 표에 app_error 행이 없는 것 = 파일이 없는 것과 같은 뜻이므로 같은 문구를 낸다.
      // 원본:93 이 POST 1건마다 `lines + "\n---\n"` 을 붙였으므로,
      // 파일 전체 = (묶음1 + "\n---\n") + (묶음2 + "\n---\n") ... 였다.
      // 표에는 묶음 경계가 없으므로 한 줄마다 구분자를 붙인다
      //   = 원본에서 "1건씩 보내는 경우"(error-reporter.ts 는 1초 큐라 대개 1건)와 같은 모양.
      //   ⚠️ 원본과 달라질 수 있는 유일한 지점 = 한 번에 2건 이상 보낸 묶음의 구분자 위치.
      const content =
        rows.length === 0
          ? "(에러 없음)"
          : rows.map((r) => (r.errorMessage ?? "") + "\n---\n").join("");

      // 원본:100 = res.type("text/plain").send(content)
      res.type("text/plain").send(content);
    } catch {
      // 원본:102 = 읽기 실패 시 같은 text/plain 으로 "(읽기 실패)".
      res.type("text/plain").send("(읽기 실패)");
    } finally {
      close();
    }
  });

  // ── 원본 server/index.ts:107 DELETE /api/app-errors ──────────────────────
  app.delete("/api/app-errors", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      // 원본:109 writeFileSync(path, "") = 파일 비우기.
      // 표에서는 app_error 행만 삭제한다(다른 type 행 = 유료 호출 원장 = 절대 안 건드림).
      await db.delete(apiLogs).where(eq(apiLogs.type, APP_ERROR_TYPE));
      // 원본:110 = { ok: true, cleared: true }
      res.json({ ok: true, cleared: true });
    } catch {
      // 원본:112 = { ok: false } (상태코드 200 그대로 = 원본과 동일)
      res.json({ ok: false });
    } finally {
      close();
    }
  });
}
