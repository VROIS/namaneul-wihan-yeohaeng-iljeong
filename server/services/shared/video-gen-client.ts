// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 영상 클립 생성 단일 진입점 (§16)
// = A안 = gemini-omni-flash-preview (Interactions API, 캐릭터 레퍼런스 첨부) = generateSceneClip
// = B안(2026-07-23 실사 포토무비) = veo-3.1-lite 사진→영상 (합성 스틸 = 첫 프레임, 일관성은 스틸이 보장) = animateStillToClip
// = 모든 영상 생성 호출 = 이 파일만 통과. 모델 교체 = 이 파일 내부만 수정 = 호출부 불변.
// = 키 = issueApiKey 출입증(apipass)을 호출자가 인자로 전달. §18 = 응답 메타(영상 바이트 제외) saveRaw 2곳 저장.

import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { saveRaw } from "./save-raw";

const OMNI_MODEL = "gemini-omni-flash-preview";
const VEO_I2V_MODEL = "veo-3.1-lite-generate-preview"; // B안 = 최저가($0.05/초). 첫프레임 입력·대사 오디오 = 공식 지원 확인
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 씬 1개 생성 폴링 상한 10분

export interface SceneClipOpts {
  apiKey: string; // issueApiKey 출입증 (직접 env 조회 금지)
  /** 레퍼런스 이미지(레포 내 jpg 절대경로). 배열 순서 = 프롬프트의 <IMAGE_REF_0>, <IMAGE_REF_1>... 순서 */
  referenceImages: { path: string; mimeType?: string }[];
  aspectRatio?: "9:16" | "16:9"; // 디폴트 9:16 세로 숏폼
  contextId?: string | number | null; // §18 raw 저장 맥락 (cityId)
  rawTag?: string | null; // §18 파일명 태그
}

/** 씬 1개 = 프롬프트+레퍼런스 이미지 → Omni Flash 영상 생성 → mp4 Buffer */
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

  // 비동기 생성 = completed/failed 까지 폴링
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

  // 영상 추출 = steps[].content[] (type=video) 의 uri 또는 inline data
  const contents = (interaction?.steps || []).flatMap(
    (s: any) => s?.content || [],
  );
  const video =
    contents.find((c: any) => c?.type === "video") || interaction?.output_video;
  if (video?.uri) {
    const vr = await fetch(video.uri, {
      headers: { "x-goog-api-key": opts.apiKey },
      signal: AbortSignal.timeout(120000),
    });
    if (!vr.ok) throw new Error(`[video-gen] 영상 다운로드 실패 ${vr.status}`);
    return Buffer.from(await vr.arrayBuffer());
  }
  if (video?.data) return Buffer.from(video.data, "base64");
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

// Veo 프리뷰 한도 = 10 RPM·동시 10/프로젝트 → 429(RESOURCE_EXHAUSTED) 시 대기 후 재시도 (2026-07-23 운영 i105 실증: 9씬 동시 발사 = 일부 콜 429)
const RETRY_DELAYS_MS = [20000, 40000, 60000];
async function withQuotaRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const is429 =
        e?.status === 429 || String(e?.message || "").includes('"code":429');
      if (!is429 || attempt >= RETRY_DELAYS_MS.length) throw e;
      console.warn(
        `[video-gen] 429 한도 = ${RETRY_DELAYS_MS[attempt] / 1000}초 대기 후 재시도(${attempt + 1}/${RETRY_DELAYS_MS.length})`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** [B안] 스틸 1장 → Veo Lite 사진→영상 = 움직이는 씬 클립(오디오 포함) mp4 Buffer.
 *  Veo 가 done 인데 uri·bytes 를 안 준 경우(운영 i104 s6 실증) = 정책성 누락 → 1회 재시도(그 씬만 = $0.35). */
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
  let op: any = await withQuotaRetry(() =>
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
  if (video?.videoBytes) return Buffer.from(video.videoBytes, "base64");
  if (video?.uri) {
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

/** raw 저장용 = 응답에서 대용량 base64 필드 제거(메타만 보존) */
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
