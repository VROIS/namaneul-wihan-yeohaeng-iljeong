// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 영상 클립 생성 단일 진입점 (§16)
// = 키 = issueApiKey 출입증(apipass)을 호출자가 인자로 전달. §18 = 응답 메타(영상 바이트 제외) saveRaw 2곳 저장.

import fs from "fs";
import { recordExternalCall, precheck } from "./external-call-log";
import { GoogleGenAI } from "@google/genai";
import { saveRaw } from "./save-raw";
import { withQuotaRetry } from "./retry-429"; // 429 재시도 1벌(2026-08-06 §16 승격)

const OMNI_MODEL = "gemini-omni-flash-preview";
const SCENE_SECONDS_FOR_LOG = 6; // 2026-08-23 = 카운터 기본 단위(초) = ghibli-travel-storyboard SCENE_SECONDS 와 동일값(순환 import 회피)
const VEO_I2V_MODEL = "veo-3.1-lite-generate-preview"; // B안 = 최저가($0.05/초). 첫프레임 입력·대사 오디오 = 공식 지원 확인
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 씬 1개 생성 폴링 상한 10분

export interface SceneClipOpts {
  apiKey: string; // issueApiKey 출입증 (직접 env 조회 금지)
  referenceImages: { path: string; mimeType?: string }[];
  aspectRatio?: "9:16" | "16:9"; // 디폴트 9:16 세로 숏폼
  contextId?: string | number | null; // §18 raw 저장 맥락 (cityId)
  rawTag?: string | null; // §18 파일명 태그
}

export async function generateSceneClip(
  prompt: string,
  opts: SceneClipOpts,
): Promise<Buffer> {
  const aspectRatio = opts.aspectRatio || "9:16";
  const input: any[] = opts.referenceImages.map((img) => ({
    type: "image",
    data: fs.readFileSync(img.path).toString("base64"),
    mime_type: img.mimeType || "image/jpeg",
  }));
  input.push({ type: "text", text: prompt });

  await precheck("omni", SCENE_SECONDS_FOR_LOG); // 2026-08-23 출입증형 사전판정(초 단위)
  const body = {
    model: OMNI_MODEL,
    input,
    generation_config: { video_config: { task: "reference_to_video" } },
    response_format: {
      type: "video",
      delivery: "uri",
      aspect_ratio: aspectRatio,
    },
  };

  const res = await fetch(`${API_BASE}/interactions`, {
    method: "POST",
    headers: {
      "x-goog-api-key": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });
  let interaction: any = await res.json();
  if (!res.ok) {
    throw new Error(
      `[video-gen] Omni ${res.status}: ${JSON.stringify(interaction).slice(0, 500)}`,
    );
  }

  const started = Date.now();
  while (
    interaction?.status &&
    interaction.status !== "completed" &&
    interaction.status !== "failed"
  ) {
    if (Date.now() - started > POLL_TIMEOUT_MS)
      throw new Error(`[video-gen] 폴링 타임아웃(10분): ${interaction?.id}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pr = await fetch(`${API_BASE}/interactions/${interaction.id}`, {
      headers: { "x-goog-api-key": opts.apiKey },
    });
    interaction = await pr.json();
  }

  // §18 = 유료호출 메타 저장 (base64 영상 바이트는 제외 = 재현용 메타만. 영상 원본 = itinerary-videos 버킷이 보존)
  await saveRaw({
    source: "gemini",
    contextId: opts.contextId,
    tag: opts.rawTag || "omni-clip",
    request: {
      model: OMNI_MODEL,
      prompt,
      referenceImages: opts.referenceImages.map((i) => i.path),
      aspectRatio,
      task: "reference_to_video",
    },
    raw: stripVideoBytes(interaction),
  });

  if (interaction?.status === "failed")
    throw new Error(
      `[video-gen] 생성 실패: ${JSON.stringify(interaction?.error || interaction).slice(0, 500)}`,
    );

  const contents = (interaction?.steps || []).flatMap(
    (s: any) => s?.content || [],
  );
  const video =
    contents.find((c: any) => c?.type === "video") || interaction?.output_video;
  if (video?.uri) {
    void recordExternalCall({
      provider: "omni",
      sku: OMNI_MODEL,
      units: SCENE_SECONDS_FOR_LOG,
      tag: opts.rawTag ?? null,
    });
    const vr = await fetch(video.uri, {
      headers: { "x-goog-api-key": opts.apiKey },
      signal: AbortSignal.timeout(120000),
    });
    if (!vr.ok) throw new Error(`[video-gen] 영상 다운로드 실패 ${vr.status}`);
    return Buffer.from(await vr.arrayBuffer());
  }
  if (video?.data) {
    void recordExternalCall({
      provider: "omni",
      sku: OMNI_MODEL,
      units: SCENE_SECONDS_FOR_LOG,
      tag: opts.rawTag ?? null,
    }); // 2026-08-23 유료호출 카운터
    return Buffer.from(video.data, "base64");
  }
  throw new Error(
    `[video-gen] 응답에 영상 없음: ${JSON.stringify(interaction).slice(0, 300)}`,
  );
}

export interface PhotoMotionOpts {
  apiKey: string; // issueApiKey 출입증
  imageBuffer: Buffer; // 첫 프레임 = 나노바나나 합성 스틸
  imageMimeType?: string; // 기본 image/png
  durationSeconds?: number; // 기본 6 (SCENE_SECONDS와 동일값. 호출자가 전달)
  contextId?: string | number | null;
  rawTag?: string | null;
}

// Veo 한도(2026-08-23 사장님 콘솔 실측 = Gemini API Tier 2) = RPM 4·RPD 50 → 429 시 대기 후 재시도 (2026-07-23 운영 i105 실증 딜레이 유지).
const RETRY_DELAYS_MS = [20000, 40000, 60000];
const veoRetry = <T>(fn: () => Promise<T>): Promise<T> =>
  withQuotaRetry(fn, { delaysMs: RETRY_DELAYS_MS, label: "video-gen" });

export async function animateStillToClip(
  prompt: string,
  opts: PhotoMotionOpts,
): Promise<Buffer> {
  try {
    return await animateStillToClipOnce(prompt, opts);
  } catch (e: any) {
    const isEmpty = String(e?.message || "").includes("영상 없음");
    if (!isEmpty) throw e; // 429 등은 이미 내부 withQuotaRetry 가 처리 = 여기선 재시도 안 함
    console.warn(`[video-gen] 씬 응답 비었음 → 1회 재시도: ${opts.rawTag}`);
    return await animateStillToClipOnce(prompt, opts);
  }
}

async function animateStillToClipOnce(
  prompt: string,
  opts: PhotoMotionOpts,
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  await precheck("veo", opts.durationSeconds ?? SCENE_SECONDS_FOR_LOG); // 2026-08-23 출입증형 사전판정(초 단위)
  let op: any = await veoRetry(() =>
    ai.models.generateVideos({
      model: VEO_I2V_MODEL,
      prompt,
      image: {
        imageBytes: opts.imageBuffer.toString("base64"),
        mimeType: opts.imageMimeType || "image/png",
      },
      config: {
        aspectRatio: "9:16",
        durationSeconds: opts.durationSeconds ?? 6,
        resolution: "720p",
        numberOfVideos: 1,
      } as any,
    }),
  );

  const started = Date.now();
  while (!op?.done) {
    if (Date.now() - started > POLL_TIMEOUT_MS)
      throw new Error(`[video-gen] Veo 폴링 타임아웃(10분): ${op?.name}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    op = await ai.operations.getVideosOperation({ operation: op });
  }

  const video = op?.response?.generatedVideos?.[0]?.video;
  await saveRaw({
    source: "gemini",
    contextId: opts.contextId,
    tag: opts.rawTag || "veo-i2v-clip",
    request: {
      model: VEO_I2V_MODEL,
      prompt,
      durationSeconds: opts.durationSeconds ?? 6,
      aspectRatio: "9:16",
      firstFrame: "still(base64 생략)",
    },
    raw: stripVideoBytes({
      name: op?.name,
      done: op?.done,
      error: op?.error,
      video: { uri: video?.uri, hasBytes: !!video?.videoBytes },
    }),
  });

  if (op?.error)
    throw new Error(
      `[video-gen] Veo 생성 실패: ${JSON.stringify(op.error).slice(0, 300)}`,
    );
  if (video?.videoBytes) {
    void recordExternalCall({
      provider: "veo",
      sku: VEO_I2V_MODEL,
      units: opts.durationSeconds ?? SCENE_SECONDS_FOR_LOG,
      tag: opts.rawTag ?? null,
    }); // 2026-08-23 유료호출 카운터(초 단위)
    return Buffer.from(video.videoBytes, "base64");
  }
  if (video?.uri) {
    void recordExternalCall({
      provider: "veo",
      sku: VEO_I2V_MODEL,
      units: opts.durationSeconds ?? SCENE_SECONDS_FOR_LOG,
      tag: opts.rawTag ?? null,
    });
    const joiner = video.uri.includes("?") ? "&" : "?";
    const vr = await fetch(`${video.uri}${joiner}key=${opts.apiKey}`, {
      signal: AbortSignal.timeout(120000),
    });
    if (!vr.ok)
      throw new Error(`[video-gen] Veo 영상 다운로드 실패 ${vr.status}`);
    return Buffer.from(await vr.arrayBuffer());
  }
  throw new Error(`[video-gen] Veo 응답에 영상 없음`);
}

function stripVideoBytes(interaction: any): any {
  try {
    return JSON.parse(
      JSON.stringify(interaction, (key, value) =>
        key === "data" && typeof value === "string" && value.length > 1000
          ? `<${value.length} bytes omitted>`
          : value,
      ),
    );
  } catch {
    return { id: interaction?.id, status: interaction?.status };
  }
}
