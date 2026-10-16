// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 정리: 지도 열쇠 받기 한 벌 (정본 §정리)
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/query-client";

/** 구글 지도 열쇠를 서버에서 받는다. delays = 시도 전 기다림(ms) 목록, 콜드스타트 503 이면 다시 시도. */
export function useGoogleMapsKey(delays: number[] = [0]): string | null {
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
        try {
          const res = await apiRequest("GET", "/api/bts/map-config");
          const data = await res.json();
          if (cancelled) return;
          if (data.googleMapsApiKey) {
            setApiKey(data.googleMapsApiKey);
            return;
          }
        } catch (e) {
          console.warn(
            `[지도 열쇠] 받기 실패(시도 ${i + 1}/${delays.length}):`,
            e,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return apiKey;
}
