// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 열쇠 쓰기 3건(POST·PUT·DELETE) Worker 이관 (정본 B1)
// 원본 = server/admin/api-keys-routes.ts:30(POST) · :76(PUT) · :125(DELETE).
// 응답·상태코드·에러문구는 원본과 100% 동일하게 옮겼다.
//
// 원본은 DB 쓰기와 동시에 자기 프로세스의 process.env 를 갱신한다(원본 :59,:105,:133).
// Worker 는 isolate 가 여러 벌이라 그 방식만으로는 쓰기를 처리한 isolate 만 새 열쇠를 쓴다.
// 그래서 여기서는 자기 isolate 를 invalidateKeys() 로 즉시 무효화하고,
// 다른 isolate 는 keys.ts 의 판형 확인(MAX(updated_at)+행수, 최대 30초)이 따라잡는다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { invalidateKeys } from "./keys";

const { apiKeys } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

export function registerAdminKeysRoutes(app: Express, openDb: OpenDb): void {
  // 원본 server/admin/api-keys-routes.ts:30
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
        // 이 isolate 는 즉시 반영, 나머지 isolate 는 keys.ts 판형 확인이 따라온다.
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

  // 원본 server/admin/api-keys-routes.ts:76
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

  // 원본 server/admin/api-keys-routes.ts:125 = 소프트삭제(isActive=false + 값 비움).
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
        // 삭제가 가장 위험하다 = 다른 isolate 가 지워진 열쇠로 유료 외부호출을 계속 낼 수 있다.
        // 이 isolate 는 즉시 무효화, 나머지는 판형 확인(최대 30초)에서 loadKeys 가 지운다(keys.ts clearKey).
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
