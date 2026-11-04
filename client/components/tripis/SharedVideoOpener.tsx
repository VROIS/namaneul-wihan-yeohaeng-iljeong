// ⚠️ 수정금지(승인필요) 2026-10-30 02:49:46 UTC 사장님 원문(대화창) "공유 링크를 누르면 영상 재생 화면이 바로 열리게 하는 게 맞아. 홍보 링크는 도시측으로 하는 게 맞고." = 지금 코드: 웹 주소 `?video=여정번호-날` 로 들어오면 그 영상 재생 화면(감상)을 바로 연다 · 한 번 읽고 주소에서 지운다 (정본 큰 일 4)
import React, { useState } from "react";
import { Platform } from "react-native";

import TripisModal, { type TripisOpenParams } from "./TripisModal";

function readOnce(): TripisOpenParams | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const m = /^(\d+)-(\d+)$/.exec(url.searchParams.get("video") || "");
  if (!m) return null;
  url.searchParams.delete("video");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return { mode: "itinerary", itineraryId: Number(m[1]), day: Number(m[2]) };
}

const shared = readOnce();

// ⚠️ 수정금지(승인필요) 2026-11-04 최적값 = 영상 창이 받은 여정의 도시 번호를 메인 화면에 한 번만 넘긴다(메인이 아직 없으면 맡아 뒀다가 붙을 때 넘김) = 메인이 그 도시를 검색창에 채움 (정본 2026-11-04)
let passed = false;
let heldCity: number | null = null;
let listener: ((cityId: number) => void) | null = null;
function passCity(cityId: number) {
  if (passed) return;
  passed = true;
  if (listener) listener(cityId);
  else heldCity = cityId;
}
export function listenSharedVideoCity(
  fn: (cityId: number) => void,
): () => void {
  listener = fn;
  if (heldCity != null) {
    fn(heldCity);
    heldCity = null;
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

export default function SharedVideoOpener() {
  const [params, setParams] = useState(shared);
  return (
    <TripisModal
      visible={params !== null}
      params={params}
      onClose={() => setParams(null)}
      onCity={passCity}
    />
  );
}
