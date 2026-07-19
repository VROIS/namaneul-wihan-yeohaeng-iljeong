import { GoogleGenAI } from "@google/genai";
import { db } from "../server/db";
import { apiKeys } from "../shared/schema";
async function run() {
  const keys = await db.select().from(apiKeys);
  const apiKey = keys.find((k) => k.keyName === "GEMINI_API_KEY")?.keyValue;
  if (!apiKey) throw new Error("No API");
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents:
      "2026 2월25일 오전10시부터 2026 2월27일 16시까지 프랑스 파리. 아이들 2명을 위한 모험적인 곳과 명소 (구글 리뷰 상위순). 식사는 한국인 입맛에 맞는 합리적 비용의 프랑스 현지식. 소요시간/이동시간/예상비용(EUR) 포함",
  });
  console.log(res.text);
  process.exit(0);
}
run();
