// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 열쇠 동작확인(POST .../test) (정본 B1)
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai/web";
import * as schema from "../shared/schema";
import type { OpenDb } from "./db-types";

const { apiKeys } = schema;

interface TestResult {
  success: boolean;
  message: string;
}

function errMessage(e: unknown): string {
  return (e as { message?: string })?.message || String(e);
}

async function testGemini(apiKey: string): Promise<TestResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Say 'API test successful' in Korean",
    });
    return { success: true, message: response.text?.slice(0, 100) || "OK" };
  } catch (e) {
    let msg = errMessage(e);
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
    return { success: false, message: msg };
  }
}

async function testYoutube(apiKey: string): Promise<TestResult> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    const data = (await r.json()) as {
      error?: { message?: string };
      items?: { snippet?: { title?: string } }[];
    };
    if (data.error) throw new Error(data.error.message || "YouTube API 오류");
    return {
      success: true,
      message: `채널 조회 성공: ${data.items?.[0]?.snippet?.title || "OK"}`,
    };
  } catch (e) {
    return { success: false, message: errMessage(e) };
  }
}

async function testGoogleMaps(apiKey: string): Promise<TestResult> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Paris&key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    const data = (await r.json()) as {
      status?: string;
      error_message?: string;
      predictions?: unknown[];
    };
    if (data.status === "REQUEST_DENIED")
      throw new Error(data.error_message || "Places API 미활성화");
    const cnt = data.predictions?.length ?? 0;
    return { success: true, message: `장소 자동완성 ${cnt}건 조회 성공` };
  } catch (e) {
    return { success: false, message: errMessage(e) };
  }
}

async function testOpenWeather(apiKey: string): Promise<TestResult> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.9780&appid=${encodeURIComponent(apiKey)}&units=metric`;
    const r = await fetch(url);
    const data = (await r.json()) as {
      message?: string;
      main?: { temp?: number };
    };
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    return {
      success: true,
      message: `서울 날씨 ${data.main?.temp}°C 조회 성공`,
    };
  } catch (e) {
    return { success: false, message: errMessage(e) };
  }
}

export function registerAdminKeyTestRoutes(app: Express, openDb: OpenDb): void {
  app.post(
    "/api/admin/api-keys/:keyName/test",
    async (req: Request, res: Response) => {
      const first = openDb();
      let closed = false;
      const closeOnce = () => {
        if (!closed) {
          closed = true;
          first.close();
        }
      };
      try {
        const keyName = String(req.params.keyName);

        const [keyRecord] = await first.db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyName, keyName))
          .limit(1);
        if (!keyRecord || !keyRecord.keyValue) {
          return res.status(400).json({ error: "API key not found or empty" });
        }
        const apiKey = keyRecord.keyValue;

        closeOnce();

        let testResult: TestResult;
        switch (keyName) {
          case "GEMINI_API_KEY":
            testResult = await testGemini(apiKey);
            break;
          case "YOUTUBE_API_KEY":
            testResult = await testYoutube(apiKey);
            break;
          case "GOOGLE_MAPS_API_KEY":
            testResult = await testGoogleMaps(apiKey);
            break;
          case "OPENWEATHER_API_KEY":
            testResult = await testOpenWeather(apiKey);
            break;
          default:
            testResult = { success: true, message: "테스트 불가 (저장됨)" };
        }

        const second = openDb();
        try {
          await second.db
            .update(apiKeys)
            .set({
              lastTestedAt: new Date(),
              lastTestResult: testResult.success ? "success" : "failed",
            })
            .where(eq(apiKeys.keyName, keyName));
        } finally {
          second.close();
        }

        res.json(testResult);
      } catch (error) {
        console.error("Error testing API key:", error);
        res.status(500).json({ error: "Failed to test API key" });
      } finally {
        closeOnce();
      }
    },
  );
}
