// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 열쇠 쓰기 3건(POST·PUT·DELETE) (정본 B1)
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { invalidateKeys } from "./keys";
import { registerAdminLookupRoutes } from "./routes-admin-lookup";
import type { OpenDb } from "./db-types";

const { apiKeys } = schema;

export function registerAdminKeysRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 관리자 번호로 찾기 등록 = src.ts·routes-admin.ts 가 700줄 초과라 여기서 함께 등록 (정본 9-25)
  registerAdminLookupRoutes(app, openDb);
  app.post("/api/admin/api-keys", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const body = (req.body ?? {}) as {
        keyName?: string;
        displayName?: string;
        description?: string;
        keyValue?: string;
      };
      const { keyName, displayName, description, keyValue } = body;
      if (!keyName || !displayName)
        return res
          .status(400)
          .json({ error: "keyName and displayName are required" });
      if (!/^[A-Z_]+$/.test(keyName))
        return res.status(400).json({
          error: "keyName must be uppercase letters and underscores only",
        });
      const existing = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyName, keyName))
        .limit(1);
      if (existing.length > 0)
        return res
          .status(400)
          .json({ error: `API key "${keyName}" already exists` });
      await db.insert(apiKeys).values({
        keyName,
        keyValue: keyValue ? keyValue.trim() : "",
        displayName,
        description: description || null,
        isActive: true,
      });
      if (keyValue && keyValue.trim()) {
        invalidateKeys();
      }
      console.log(`✅ New API Key added: ${keyName}`);
      res.json({ success: true, message: `${keyName} 추가 완료` });
    } catch (error) {
      console.error("Error adding API key:", error);
      res.status(500).json({ error: "Failed to add API key" });
    } finally {
      close();
    }
  });

  app.put(
    "/api/admin/api-keys/:keyName",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const keyName = String(req.params.keyName);
        const { keyValue } = (req.body ?? {}) as { keyValue?: string };
        if (!keyValue || keyValue.trim() === "")
          return res.status(400).json({ error: "API key value is required" });
        const existing = await db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyName, keyName))
          .limit(1);
        if (existing.length > 0) {
          await db
            .update(apiKeys)
            .set({
              keyValue: keyValue.trim(),
              updatedAt: new Date(),
              isActive: true,
            })
            .where(eq(apiKeys.keyName, keyName));
        } else {
          await db.insert(apiKeys).values({
            keyName,
            keyValue: keyValue.trim(),
            displayName: keyName,
            isActive: true,
          });
        }
        invalidateKeys();
        console.log(`✅ API Key saved: ${keyName}`);
        res.json({ success: true, message: `${keyName} 저장 완료` });
      } catch (error) {
        console.error("Error saving API key:", error);
        res.status(500).json({ error: "Failed to save API key" });
      } finally {
        close();
      }
    },
  );

  app.delete(
    "/api/admin/api-keys/:keyName",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const keyName = String(req.params.keyName);
        await db
          .update(apiKeys)
          .set({ keyValue: "", isActive: false, updatedAt: new Date() })
          .where(eq(apiKeys.keyName, keyName));
        invalidateKeys();
        res.json({ success: true, message: `${keyName} 삭제 완료` });
      } catch (error) {
        console.error("Error deleting API key:", error);
        res.status(500).json({ error: "Failed to delete API key" });
      } finally {
        close();
      }
    },
  );
}
