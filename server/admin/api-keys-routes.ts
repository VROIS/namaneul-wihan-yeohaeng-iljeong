// API 키 CRUD 라우트 = admin-routes 분리(2026-07-16 §0 슬림화, 순수 이동)
import type { Express } from "express";
import { db } from "../db";
import { apiKeys } from "../../shared/schema";
import { eq, ne } from "drizzle-orm";

export function registerApiKeysRoutes(app: Express) {
  // ========================================
  // /api/admin/api-keys/* = API 키 CRUD
  // ========================================
  // ⚠️ 2026-08-25 사장님 지시로 수정 = 삭제(DELETE, 아래)는 소프트삭제(isActive=false)라 이 목록이 필터
  //   없이 전부 보여주면 삭제해도 화면에서 안 사라짐. isActive=false 행만 숨긴다(§0 = X는 화면에서만
  //   감추고 DB는 보존, DB 행 자체는 지우지 않음 — 삭제 라우트가 이미 그렇게 짜여 있음, 조회만 정정).
  app.get("/api/admin/api-keys", async (_req, res) => {
    if (!db) return res.json([]);
    try {
      const keys = await db
        .select()
        .from(apiKeys)
        .where(ne(apiKeys.isActive, false))
        .orderBy(apiKeys.id);
      const maskedKeys = keys.map((key) => ({
        ...key,
        keyValue: key.keyValue
          ? `${key.keyValue.slice(0, 8)}...${key.keyValue.slice(-4)}`
          : "",
        hasValue: !!key.keyValue && key.keyValue.length > 0,
      }));
      res.json(maskedKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/admin/api-keys", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName, displayName, description, keyValue } = req.body;
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
        process.env[keyName] = keyValue.trim();
        if (
          keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
          keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
        ) {
          process.env.GOOGLE_CLIENT_ID = keyValue.trim();
          process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = keyValue.trim();
        }
      }
      console.log(`✅ New API Key added: ${keyName}`);
      res.json({ success: true, message: `${keyName} 추가 완료` });
    } catch (error) {
      console.error("Error adding API key:", error);
      res.status(500).json({ error: "Failed to add API key" });
    }
  });

  app.put("/api/admin/api-keys/:keyName", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName } = req.params;
      const { keyValue } = req.body;
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
      process.env[keyName] = keyValue.trim();
      if (keyName === "GEMINI_API_KEY")
        process.env.AI_INTEGRATIONS_GEMINI_API_KEY = keyValue.trim();
      if (keyName === "GOOGLE_MAPS_API_KEY")
        process.env.Google_maps_api_key = keyValue.trim();
      if (
        keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
        keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
      ) {
        process.env.GOOGLE_CLIENT_ID = keyValue.trim();
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = keyValue.trim();
      }
      console.log(`✅ API Key saved: ${keyName}`);
      res.json({ success: true, message: `${keyName} 저장 완료` });
    } catch (error) {
      console.error("Error saving API key:", error);
      res.status(500).json({ error: "Failed to save API key" });
    }
  });

  app.delete("/api/admin/api-keys/:keyName", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName } = req.params;
      await db
        .update(apiKeys)
        .set({ keyValue: "", isActive: false, updatedAt: new Date() })
        .where(eq(apiKeys.keyName, keyName));
      delete process.env[keyName];
      if (keyName === "GEMINI_API_KEY")
        delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      if (
        keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
        keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
      ) {
        delete process.env.GOOGLE_CLIENT_ID;
        delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      }
      res.json({ success: true, message: `${keyName} 삭제 완료` });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  app.post("/api/admin/api-keys/:keyName/test", async (req, res) => {
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { keyName } = req.params;
      const [keyRecord] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyName, keyName))
        .limit(1);
      if (!keyRecord || !keyRecord.keyValue)
        return res.status(400).json({ error: "API key not found or empty" });
      const apiKey = keyRecord.keyValue;
      let testResult = { success: false, message: "" };
      switch (keyName) {
        case "GEMINI_API_KEY": {
          try {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: "Say 'API test successful' in Korean",
            });
            testResult = {
              success: true,
              message: response.text?.slice(0, 100) || "OK",
            };
          } catch (e: any) {
            let msg = e?.message || String(e);
            if (
              msg.includes("429") ||
              msg.includes("RESOURCE_EXHAUSTED") ||
              msg.includes("quota")
            )
              msg = "일일 API 할당량 초과";
            else if (
              msg.includes("API key") ||
              msg.includes("401") ||
              msg.includes("403")
            )
              msg = "API 키가 유효하지 않거나 권한이 없습니다";
            testResult = { success: false, message: msg };
          }
          break;
        }
        case "YOUTUBE_API_KEY": {
          try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${encodeURIComponent(apiKey)}`;
            const r = await fetch(url);
            const data: any = await r.json();
            if (data.error)
              throw new Error(data.error.message || "YouTube API 오류");
            testResult = {
              success: true,
              message: `채널 조회 성공: ${data.items?.[0]?.snippet?.title || "OK"}`,
            };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        case "GOOGLE_MAPS_API_KEY": {
          try {
            const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Paris&key=${encodeURIComponent(apiKey)}`;
            const r = await fetch(url);
            const data: any = await r.json();
            if (data.status === "REQUEST_DENIED")
              throw new Error(data.error_message || "Places API 미활성화");
            const cnt = data.predictions?.length ?? 0;
            testResult = {
              success: true,
              message: `장소 자동완성 ${cnt}건 조회 성공`,
            };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        case "OPENWEATHER_API_KEY": {
          try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.9780&appid=${encodeURIComponent(apiKey)}&units=metric`;
            const r = await fetch(url);
            const data: any = await r.json();
            if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
            testResult = {
              success: true,
              message: `서울 날씨 ${data.main?.temp}°C 조회 성공`,
            };
          } catch (e: any) {
            testResult = { success: false, message: e.message };
          }
          break;
        }
        default:
          testResult = { success: true, message: "테스트 불가 (저장됨)" };
      }
      await db
        .update(apiKeys)
        .set({
          lastTestedAt: new Date(),
          lastTestResult: testResult.success ? "success" : "failed",
        })
        .where(eq(apiKeys.keyName, keyName));
      res.json(testResult);
    } catch (error) {
      console.error("Error testing API key:", error);
      res.status(500).json({ error: "Failed to test API key" });
    }
  });
}
