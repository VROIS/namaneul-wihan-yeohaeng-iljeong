// 앱 에러 리포트 3건.
// 표 api_logs(type='app_error')에 쓴다 = 받기 → INSERT · 읽기 → SELECT · 비우기 → DELETE(type='app_error' 만).
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const { apiLogs } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

/** api_logs 안에서 앱 에러 행만 가리키는 표식(기존 행은 전부 type='gemini' 이라 섞이지 않는다). */
const APP_ERROR_TYPE = "app_error";

/** client/lib/error-reporter.ts AppError = 앱이 보내는 1건의 모양. */
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

/** 한 줄 = `[{timestamp}] {component || "?"} | {message}`(+ stack 앞 3줄). api_logs 에 칸이 없어 이 문자열을 error_message 에 통째로 담는다. */
function formatLine(e: AppErrorItem): string {
  const stack = str(e.stack);
  const head = `[${str(e.timestamp)}] ${str(e.component) || "?"} | ${str(e.message)}`;
  if (!stack) return head;
  return head + "\n  " + stack.split("\n").slice(0, 3).join("\n  ");
}

export function registerAppErrorRoutes(app: Express, openDb: OpenDb): void {
  // ── POST /api/app-errors ─────────────────────────
  app.post("/api/app-errors", async (req: Request, res: Response) => {
    // errors 가 없거나 배열이 아니면 400 { ok: false }.
    const errors: unknown = (req.body || {}).errors;
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ ok: false });
    }

    // 콘솔에 찍을 lines. 저장하는 문자열과 같은 것을 쓴다.
    const lines = (errors as AppErrorItem[]).map(formatLine);

    const { db, close } = openDb();
    try {
      if (lines.length > 0) {
        await db.insert(apiLogs).values(
          lines.map((line) => ({
            type: APP_ERROR_TYPE,
            errorMessage: line,
          })),
        );
      }
      // 서버 콘솔에도 같은 문구로 남긴다.
      console.error(
        `[APP-ERROR] ${errors.length}건 수신:\n${lines.join("\n")}`,
      );
      res.json({ ok: true, received: errors.length });
    } catch (e) {
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

  // ── GET /api/app-errors ──────────────────────────
  app.get("/api/app-errors", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const rows = await db
        .select({ errorMessage: apiLogs.errorMessage })
        .from(apiLogs)
        .where(eq(apiLogs.type, APP_ERROR_TYPE))
        // 받은 순서 = 들어온 순서(id).
        .orderBy(asc(apiLogs.id));

      // 행이 없으면 "(에러 없음)". 행마다 `\n---\n` 구분자를 붙인다(error-reporter.ts 는 1초 큐라 대개 1건씩 온다).
      const content =
        rows.length === 0
          ? "(에러 없음)"
          : rows.map((r) => (r.errorMessage ?? "") + "\n---\n").join("");

      res.type("text/plain").send(content);
    } catch {
      // 읽기 실패 시 같은 text/plain 으로 "(읽기 실패)".
      res.type("text/plain").send("(읽기 실패)");
    } finally {
      close();
    }
  });

  // ── DELETE /api/app-errors ──────────────────────
  app.delete("/api/app-errors", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      // app_error 행만 삭제한다(다른 type 행 = 유료 호출 원장 = 절대 안 건드림).
      await db.delete(apiLogs).where(eq(apiLogs.type, APP_ERROR_TYPE));
      res.json({ ok: true, cleared: true });
    } catch {
      // { ok: false } (상태코드 200 그대로)
      res.json({ ok: false });
    } finally {
      close();
    }
  });
}
