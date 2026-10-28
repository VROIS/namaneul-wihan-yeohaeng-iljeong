// ⚠️ 수정금지(승인필요) 2026-10-28 사장님 결정 = 장면 영상 조각 = 장면 첫 화면 그림을 옴니로 움직임(image_to_video) · 대사 영어 · 무대 첫 마디만 현지 말 (정본 큰 일 4)
import { pool } from "../worker/lib/db";
import { generateSceneClip } from "../worker/container/lib/services/shared/video-gen-client";
import { issueApiKey } from "../worker/container/lib/services/shared/issue-api-key";
import { keep, latestIn, readScenario } from "./store";

const SECONDS = 5;

export async function makeClips(
  city: string,
  only: string | undefined,
  resolution: "360p" | "720p",
): Promise<void> {
  const sc = readScenario(city);
  const apiKey = await issueApiKey(
    pool,
    "GEMINI_API_KEY",
    sc.cityId,
    new Date().toISOString().slice(0, 10),
    true,
  );
  for (const s of sc.scenes.filter((s: any) => !only || String(s.n) === only)) {
    const viewer = s.viewerLine
      ? `First the viewer (off camera, a soft young voice) says in English: "${s.viewerLine}". Then `
      : "";
    const voice = s.mute
      ? "Audio: complete silence."
      : s.greeting
        ? `Audio: a powerful concert beat explodes on the very first frame and the crowd roars; the guide on stage says into the microphone in ${sc.stageGreeting.lang}: "${sc.stageGreeting.text}", then softly in English: "${s.line}".`
        : s.line
          ? `Audio: ${viewer}the guide says in English, warm and gentle: "${s.line}". Soft acoustic guitar music, natural ambient sound.`
          : "Audio: concert crowd and music, no speech.";
    const prompt = [
      `Animate this exact first frame into a ${SECONDS}-second continuous shot with no scene cuts. Keep the art style, the characters' faces, outfits and the place exactly as drawn.`,
      `First-person camera of the viewer, gentle natural camera motion. What happens: ${s.draw}`,
      voice,
      "No on-screen text, captions or subtitles.",
    ].join("\n");
    const mp4 = await generateSceneClip(prompt, {
      apiKey,
      referenceImages: [
        {
          path: latestIn(sc.folder, `_${city}_scene${s.n}.jpg`),
          mimeType: "image/jpeg",
        },
      ],
      aspectRatio: "9:16",
      resolution,
      task: "image_to_video",
      seconds: SECONDS,
      contextId: "marketing",
      rawTag: `${city}-clip${s.n}-${resolution}`,
    });
    const saved = await keep(
      sc.folder,
      `${city}_clip${s.n}_${resolution}.mp4`,
      mp4,
      "video/mp4",
    );
    console.log(
      `✓ ${city} 조각 ${s.n} ${resolution} → ${saved.key} · ${saved.local}`,
    );
  }
}
