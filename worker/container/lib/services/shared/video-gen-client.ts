// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 하루 영상 조각 = 옴니 1.1 플래시 1벌(360p 고정), 분당 한도 거절만 1분 뒤 다시 보냄·하루 한도 거절은 바로 실패 (정본 §)
// = 키 = issueApiKey 출입증(apipass)을 호출자가 인자로 전달. §18 = 응답 메타(영상 바이트 제외) saveRaw 2곳 저장.

import fs from "fs";
import { recordExternalCall, precheck } from "./external-call-log";
import { saveRaw } from "./save-raw";
import { withQuotaRetry } from "./retry-429"; // 429 재시도 1벌(2026-08-06 §16 승격)

const OMNI_MODEL = "gemini-omni-1.1-flash";
const OMNI_RESOLUTION = "360p";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 조각 1개 생성 폴링 상한 10분
const PER_MINUTE_RETRY_MS = Array(9).fill(60_000);

export interface SceneClipOpts {
  apiKey: string; // issueApiKey 출입증 (직접 env 조회 금지)
  referenceImages: { path?: string; url?: string; mimeType?: string }[];
  aspectRatio?: "9:16" | "16:9"; // 디폴트 9:16 세로 숏폼
  seconds: number; // 조각 길이(초) = 비용 장부 단위
  contextId?: string | number | null; // §18 raw 저장 맥락 (cityId)
  rawTag?: string | null; // §18 파일명 태그
}

async function toBase64(img: { path?: string; url?: string }): Promise<string> {
  if (img.path) return fs.readFileSync(img.path).toString("base64");
  if (img.url) {
    const r = await fetch(img.url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok)
      throw new Error(
        `[video-gen] 참조 이미지 다운로드 실패 ${r.status}: ${img.url}`,
      );
    return Buffer.from(await r.arrayBuffer()).toString("base64");
  }
  throw new Error("[video-gen] 참조 이미지 = path 또는 url 필수");
}

export async function generateSceneClip(
  prompt: string,
  opts: SceneClipOpts,
): Promise<Buffer> {
  const aspectRatio = opts.aspectRatio || "9:16";
  const input: any[] = [];
  for (const img of opts.referenceImages)
    input.push({
      type: "image",
      data: await toBase64(img),
      mime_type: img.mimeType || "image/jpeg",
    });
  input.push({ type: "text", text: prompt });

  await precheck("omni", opts.seconds); // 2026-08-23 출입증형 사전판정(초 단위)
  const body = {
    model: OMNI_MODEL,
    input,
    generation_config: { video_config: { task: "reference_to_video" } },
    response_format: {
      type: "video",
      delivery: "uri",
      aspect_ratio: aspectRatio,
      resolution: OMNI_RESOLUTION,
    },
  };

  let interaction: any = await withQuotaRetry(
    async () => {
      const res = await fetch(`${API_BASE}/interactions`, {
        method: "POST",
        headers: {
          "x-goog-api-key": opts.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      const json: any = await res.json();
      const text = JSON.stringify(json);
      if (res.status === 429 && /per ?day/i.test(text))
        throw new Error(
          `[video-gen] Omni 하루 한도(quota) 도달 = 다시 보내지 않음 (${text.match(/"quotaId":"([^"]+)"/)?.[1] || "per day"})`,
        );
      if (!res.ok) {
        const err: Error & { status?: number } = new Error(
          `[video-gen] Omni ${res.status}: ${text.slice(0, 500)}`,
        );
        err.status = res.status;
        throw err;
      }
      return json;
    },
    { delaysMs: PER_MINUTE_RETRY_MS, label: "omni" },
  );

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

  // §18 = 유료호출 메타 저장 (base64 영상 바이트는 제외 = 재현용 메타만. 영상 원본 = R2 videos 금고가 보존)
  await saveRaw({
    source: "gemini",
    contextId: opts.contextId,
    tag: opts.rawTag || "omni-clip",
    request: {
      model: OMNI_MODEL,
      prompt,
      referenceImages: opts.referenceImages.map((i) => i.path || i.url),
      aspectRatio,
      resolution: OMNI_RESOLUTION,
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
      units: opts.seconds,
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
      units: opts.seconds,
      tag: opts.rawTag ?? null,
    }); // 2026-08-23 유료호출 카운터
    return Buffer.from(video.data, "base64");
  }
  throw new Error(
    `[video-gen] 응답에 영상 없음: ${JSON.stringify(interaction).slice(0, 300)}`,
  );
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
