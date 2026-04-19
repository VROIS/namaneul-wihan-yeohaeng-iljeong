// ⚠️ 수정금지(승인필요) — 보라 사각형 도트맵 + 골드 핀 공연도시 마커
// SVG 에셋을 런타임에 로드 (번들 크기 축소 — 172KB 인라인 제거)
import { Platform } from "react-native";
import { Asset } from "expo-asset";
// ⚠️ 수정금지(승인필요) — SDK 54에서 expo-file-system의 readAsStringAsync가 deprecated
// legacy 서브모듈로 전환하여 기존 동작 유지. 이 전환이 도트지도 모바일 silent fail 해결.
import * as FileSystem from "expo-file-system/legacy";

// ⚠️ 수정금지(승인필요) — SVG 캐시 (한 번 로드 후 재사용)
let cachedSvg: string | null = null;

// ⚠️ 수정금지(승인필요) — SVG 에셋 비동기 로더
export async function loadBtsWorldMapSvg(): Promise<string> {
  if (cachedSvg) return cachedSvg;

  // ⚠️ 수정금지(승인필요) — 웹 환경: fetch로 직접 로드
  if (Platform.OS === "web") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const asset = Asset.fromModule(require("../../assets/bts-world-map-new.svg"));
    await asset.downloadAsync();
    const res = await fetch(asset.localUri || asset.uri);
    cachedSvg = await res.text();
    return cachedSvg;
  }

  // ⚠️ 수정금지(승인필요) — 네이티브 환경: expo-file-system으로 로드
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asset = Asset.fromModule(require("../../assets/bts-world-map-new.svg"));
  await asset.downloadAsync();
  cachedSvg = await FileSystem.readAsStringAsync(asset.localUri!);
  return cachedSvg;
}
