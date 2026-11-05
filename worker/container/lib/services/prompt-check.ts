// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 들어온 대본은 받은 그대로(검사 0, 재요청 0) · 그 장면 대본 자체가 안 왔을 때만 조각을 못 만듦 · 나가는 지시문 = 빈칸 0 · 그림 번호 1:1 만 확인 (정본 2026-11-03)
import type { OmniClip, SceneScript } from "./omni-day-clips";

export function checkPrompt(prompt: string, imageCount: number): string[] {
  const e: string[] = [];
  if (/\{\{/.test(prompt)) e.push("빈칸 남음");
  const refs = [...prompt.matchAll(/<IMAGE_REF_(\d+)>/g)].map((m) => +m[1]);
  for (let i = 0; i < imageCount; i++)
    if (!refs.includes(i)) e.push(`그림 ${i} 번호가 지시문에 없음`);
  for (const r of refs)
    if (r >= imageCount)
      e.push(`그림 ${r} 번호가 보낸 그림(${imageCount}장)보다 큼`);
  return e;
}

// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 장면 대본 n = 장소 순번 · 장소의 장면 찾기 1벌 (정본 2026-11-05)
export const sceneOf = (
  scenes: SceneScript[],
  placeNo: number,
): SceneScript | undefined => scenes.find((x) => Number(x.n) === placeNo);

// 대본 1벌 = 제미니 1회, 받은 그대로 · 응답이 {"scenes":[…]} 든 바로 [...] 든 받는다 · 조각 안 장소 중 하나라도 대본이 없으면 그 조각만 빠짐 (운영·시험 도구가 같이 부름)
export async function scriptScenes(
  clips: OmniClip[],
  ask: () => Promise<unknown>,
): Promise<{ scenes: SceneScript[]; missing: number[] }> {
  const r = await ask();
  const scenes: SceneScript[] = Array.isArray(r)
    ? (r as SceneScript[])
    : ((r as { scenes?: SceneScript[] } | null)?.scenes ?? []);
  const missing = clips
    .filter((c) => c.placeNos.some((n) => !sceneOf(scenes, n)))
    .map((c) => c.index);
  return { scenes, missing };
}
