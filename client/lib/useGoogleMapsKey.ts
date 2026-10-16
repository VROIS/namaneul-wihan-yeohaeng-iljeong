// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 정리: 지도 열쇠 받기 한 벌 (정본 §정리)
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/query-client";

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
