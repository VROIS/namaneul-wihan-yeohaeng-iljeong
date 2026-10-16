import type { Express, Request, Response } from "express";
import { asc, eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import type { OpenDb } from "./db-types";

const { apiLogs } = schema;

const APP_ERROR_TYPE = "app_error";

interface AppErrorItem {
  message?: unknown;
  stack?: unknown;
  component?: unknown;
  screen?: unknown;
  timestamp?: unknown;
  platform?: unknown;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function formatLine(e: AppErrorItem): string {
  const stack = str(e.stack);
  const head = `[${str(e.timestamp)}] ${str(e.component) || "?"} | ${str(e.message)}`;
  if (!stack) return head;
  return head + "\n  " + stack.split("\n").slice(0, 3).join("\n  ");
}

export function registerAppErrorRoutes(app: Express, openDb: OpenDb): void {
  app.post("/api/app-errors", async (req: Request, res: Response) => {
    const errors: unknown = (req.body || {}).errors;
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ ok: false });
    }

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
      console.error(
        `[APP-ERROR] ${errors.length}건 수신:\n${lines.join("\n")}`,
      );
      res.json({ ok: true, received: errors.length });
    } catch (e) {
      console.error(
        "[APP-ERROR] 저장 실패:",
        (e as { message?: string })?.message || e,
      );
      res.status(500).json({ ok: false });
    } finally {
      close();
    }
  });

  app.get("/api/app-errors", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const rows = await db
        .select({ errorMessage: apiLogs.errorMessage })
        .from(apiLogs)
        .where(eq(apiLogs.type, APP_ERROR_TYPE))
        .orderBy(asc(apiLogs.id));

      const content =
        rows.length === 0
          ? "(에러 없음)"
          : rows.map((r) => (r.errorMessage ?? "") + "\n---\n").join("");

      res.type("text/plain").send(content);
    } catch {
      res.type("text/plain").send("(읽기 실패)");
    } finally {
      close();
    }
  });

  app.delete("/api/app-errors", async (_req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      await db.delete(apiLogs).where(eq(apiLogs.type, APP_ERROR_TYPE));
      res.json({ ok: true, cleared: true });
    } catch {
      res.json({ ok: false });
    } finally {
      close();
    }
  });
}
