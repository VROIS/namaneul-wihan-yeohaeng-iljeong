// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 SSOT = **X(삭제)는 화면에서만 감춘다. DB 는 무조건 남는다.**
//   → 폰을 바꾸면 숨긴 것이 다시 나타난다 = 정상(사장님 2026-08-08: X 는 쉽게 지우라고 있는 가벼운 도구).
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HIDDEN_CARDS_KEY_PREFIX = "@vibetrip_hidden_cards:";

export const cardKey = (kind: "trip" | "video" | "guide", id: string) =>
  `${kind}:${id}`;

export function useHiddenCards(userId: string | undefined, authReady: boolean) {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [hiddenReady, setHiddenReady] = useState(false);
  const hiddenKeysRef = useRef<string[]>([]);
  const storageKey = HIDDEN_CARDS_KEY_PREFIX + (userId || "guest");

  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    setHiddenReady(false); // 계정이 바뀌면 새 목록을 다 읽을 때까지 카드를 내보내지 않는다
    (async () => {
      let saved: string[] = [];
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed))
          saved = parsed.filter((v): v is string => typeof v === "string");
      } catch (e) {
        console.error("[useHiddenCards] 숨김 목록 읽기 실패:", e);
      }
      if (!alive) return;
      hiddenKeysRef.current = saved;
      setHiddenKeys(saved);
      setHiddenReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [authReady, storageKey]);

  const hideCard = useCallback(
    (key: string) => {
      if (hiddenKeysRef.current.includes(key)) return;
      const next = [...hiddenKeysRef.current, key];
      hiddenKeysRef.current = next;
      setHiddenKeys(next);
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch((e) =>
        console.error("[useHiddenCards] 숨김 목록 저장 실패:", e),
      );
    },
    [storageKey],
  );

  return { hiddenKeys, hiddenReady, hideCard };
}
