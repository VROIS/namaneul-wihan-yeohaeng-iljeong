// ⚠️ 수정금지(승인필요) — 보라 사각형 도트맵 + 골드 핀 공연도시 마커
// SVG 에셋을 런타임에 로드 (번들 크기 축소 — 172KB 인라인 제거)
import { Asset } from "expo-asset";

// ⚠️ 수정금지(승인필요) — SVG 캐시 (한 번 로드 후 재사용)
let cachedSvg: string | null = null;

// ⚠️ 수정금지(승인필요) — SVG 에셋 비동기 로더
// 웹/네이티브 모두 fetch + text() 방식으로 통일 (readAsStringAsync는 SDK 54에서 deprecated)
// 웹에서는 이 방식으로 정상 작동 중이었으므로 네이티브도 동일 경로 사용하여 파서 호환성 확보
export async function loadBtsWorldMapSvg(): Promise<string> {
  if (cachedSvg) return cachedSvg;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asset = Asset.fromModule(require("../../assets/bts-world-map-new.svg"));
  await asset.downloadAsync();
  const res = await fetch(asset.localUri || asset.uri);
  cachedSvg = await res.text();
  return cachedSvg;
}
