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

export default function SharedVideoOpener() {
  const [params, setParams] = useState(shared);
  return (
    <TripisModal
      visible={params !== null}
      params={params}
      onClose={() => setParams(null)}
    />
  );
}
