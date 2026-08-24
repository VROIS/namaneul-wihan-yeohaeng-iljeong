// ⚠️ 수정금지(승인필요) 2026-07-23 사장님 SSOT = 씬 스틸 합성 단일 진입점 (§16) = 옵션B "실사 포토무비" 1단
// = 나노바나나(Gemini Flash Image): 실제 장소 사진 + 우리 18인 캐릭터 jpg를 참조로 첨부 →
//   실사 배경을 유지한 채 캐릭터가 자연스럽게 삽입된 1K 스틸 1장 생성 (일관성 = 참조 방식 = A안과 동일 체계).
// = 키 = issueApiKey 출입증을 호출자가 인자로 전달. §18 = 응답 메타(이미지 바이트 제외) saveRaw 2곳 저장.
// = 모델 교체 = 이 파일 내부만.

import fs from "fs";
import { recordExternalCall, precheck } from "./external-call-log";
import { GoogleGenAI } from "@google/genai";
import { saveRaw } from "./save-raw";

const IMAGE_MODEL = "gemini-2.5-flash-image"; // 정식판 $0.039/장. 품질 미달 시 gemini-3.1-flash-image 로 이 상수만 교체.

export interface SceneStillOpts {
  apiKey: string; // issueApiKey 출입증 (직접 env 조회 금지)
  /** 참조 이미지 = 로컬 파일(path) 또는 URL(url) 혼용. 순서 = 프롬프트 서술 순서(장소사진 먼저, 캐릭터들 다음) */
  referenceImages: { path?: string; url?: string; mimeType?: string }[];
  contextId?: string | number | null; // §18 raw 맥락
  rawTag?: string | null;
}

/** 참조 이미지 1개 → base64 (로컬 파일 or URL 다운로드) */
async function toBase64(img: { path?: string; url?: string }): Promise<string> {
  if (img.path) return fs.readFileSync(img.path).toString("base64");
  if (img.url) {
    const r = await fetch(img.url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok)
      throw new Error(
        `[image-gen] 참조 이미지 다운로드 실패 ${r.status}: ${img.url}`,
      );
    return Buffer.from(await r.arrayBuffer()).toString("base64");
  }
  throw new Error("[image-gen] 참조 이미지 = path 또는 url 필수");
}

/** 씬 스틸 1장 = 참조 이미지들 + 프롬프트 → 합성 이미지 Buffer(png/jpg) */
export async function composeSceneStill(
  prompt: string,
  opts: SceneStillOpts,
): Promise<Buffer> {
  const parts: any[] = [];
  for (const img of opts.referenceImages) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType || "image/jpeg",
        data: await toBase64(img),
      },
    });
  }
  parts.push({ text: prompt });

  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  await precheck("nano"); // 2026-08-23 출입증형 사전판정
  const response: any = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "9:16" }, // 세로 숏폼 = 영상 첫 프레임 규격과 일치
    },
  });

  const outParts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = outParts.find((p: any) => p?.inlineData?.data);

  // §18 = 유료호출 메타 저장 (이미지 바이트 제외 = 재현용. 스틸 원본은 후속 영상·Storage가 보존)
  await saveRaw({
    source: "gemini",
    contextId: opts.contextId,
    tag: opts.rawTag || "nano-still",
    request: {
      model: IMAGE_MODEL,
      prompt,
      referenceImages: opts.referenceImages.map((i) => i.path || i.url),
      aspectRatio: "9:16",
    },
    raw: {
      finishReason: response?.candidates?.[0]?.finishReason,
      hasImage: !!imagePart,
      text: outParts.find((p: any) => p?.text)?.text || null,
    },
  });

  if (!imagePart)
    throw new Error(
      `[image-gen] 응답에 이미지 없음: ${JSON.stringify(response?.candidates?.[0]?.finishReason)}`,
    );
  void recordExternalCall({
    provider: "nano",
    sku: "gemini_2_5_flash_image",
    tag: opts.rawTag ?? null,
  }); // 2026-08-23 사장님 승인 = 유료호출 카운터
  return Buffer.from(imagePart.inlineData.data, "base64");
}
