// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 열쇠 동작확인(POST .../test) Worker 이관 (정본 B1)
// 열쇠 = DB api_keys 행을 바로 읽는다(방금 저장한 값을 봐야 해서 캐시 금지) · 외부호출 중에는 DB 연결을 쥐지 않는다(읽고 바로 닫고, 끝나면 새로 열어 결과 UPDATE).
// §18 raw 저장 없음(원래 없던 것 = 만들면 §19 위반).
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
// ⚠️ 반드시 "@google/genai/web" (기본 진입점 금지) = 기본 진입점은 node: builtin 11개를 끌어와 Worker 에서 깨진다(routes-gemini.ts 에 실측 기록).
// Worker 번들은 정적 import 로만 진입점(/web)을 고정할 수 있다. 동작(제미니 호출 1회)은 같다.
import { GoogleGenAI } from "@google/genai/web";
import * as schema from "../shared/schema";

const { apiKeys } = schema;

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

interface TestResult {
  success: boolean;
  message: string;
}

// `e?.message || String(e)` 를 any 없이 그대로 재현한다.
function errMessage(e: unknown): string {
  return (e as { message?: string })?.message || String(e);
}

// ── 열쇠별 실제 확인 ────────────────────────────────────────────────────────
// 아래 4벌은 case 4개를 문구·분기까지 1:1로 옮긴 것이다.

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
      // 선례 = routes-itinerary-generate.ts:262 closeOnce = finally 와 중복 호출돼도 1회만 닫는다.
      const closeOnce = () => {
        if (!closed) {
          closed = true;
          first.close();
        }
      };
      try {
        const keyName = String(req.params.keyName);

        // 행이 없거나 값이 비면 400. (isActive 는 원본도 안 본다.)
        const [keyRecord] = await first.db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyName, keyName))
          .limit(1);
        if (!keyRecord || !keyRecord.keyValue) {
          return res.status(400).json({ error: "API key not found or empty" });
        }
        const apiKey = keyRecord.keyValue;

        // ⚠️ 외부호출 전에 연결을 놓는다(위 주석 ② = Hyperdrive 연결 6개 상한).
        closeOnce();

        // switch = 4벌 + default. 문구·성공여부까지 동일.
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

        // 확인 결과를 행에 기록. 외부호출이 끝난 뒤라 연결을 새로 연다.
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
