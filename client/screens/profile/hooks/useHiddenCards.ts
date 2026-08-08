// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 SSOT = **X(삭제)는 화면에서만 감춘다. DB 는 무조건 남는다.**
//   사유 = 모든 생성물(여정·해설·영상)은 회사 소유이고 추후 문제대응·복원용.
//   원래 VideosSection.tsx 안에만 있던 숨김 로직(2026-08-02 사장님 "이 기기에 기억")을
//   여정 카드도 같이 쓰도록 **순수 이동**한 것 = 로직 무변경, 두 벌 금지(§16).
//
//   저장 수단 = 앱이 이미 쓰는 기기 저장소(AsyncStorage, client/lib/auth.ts 와 같은 것) = 새 저장 계층 만들지 않음.
//   열쇠 = 접두사 + 계정 id. 로그인 안 한 상태는 손님용 1벌("guest").
//   → 한 기기를 여러 사람이 써도 계정마다 목록이 따로 남아 남의 숨김이 딸려오지 않는다.
//   → 폰을 바꾸면 숨긴 것이 다시 나타난다 = 정상(사장님 2026-08-08: X 는 쉽게 지우라고 있는 가벼운 도구).
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HIDDEN_CARDS_KEY_PREFIX = "@vibetrip_hidden_cards:";

// 여러 종류를 한 목록에 담기 위한 이름표(종류:id) = 같은 동작을 1벌로 처리(§0).
//   trip = 나의 여정 카드 / video = 담은 영상 / guide = TRIPIS 해설
export const cardKey = (kind: "trip" | "video" | "guide", id: string) =>
  `${kind}:${id}`;

export function useHiddenCards(userId: string | undefined, authReady: boolean) {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  // 기기에 적어둔 목록을 다 읽기 전에는 카드를 그리지 않는다 = 숨긴 카드가 잠깐 보였다 사라지는 깜빡임 방지.
  const [hiddenReady, setHiddenReady] = useState(false);
  // 최신 목록 원본 = 연달아 X 를 눌러도 직전 것이 누락되지 않게 하는 기준값(상태값은 다음 그리기 때 반영되므로 못 씀).
  const hiddenKeysRef = useRef<string[]>([]);
  // 계정별 열쇠 1벌. 로그인 안 한 상태 = 손님용.
  const storageKey = HIDDEN_CARDS_KEY_PREFIX + (userId || "guest");

  // 화면이 뜰 때(그리고 계정이 바뀔 때) 기기에 적어둔 목록을 읽어 처음부터 안 보이게 한다.
  //   계정이 확정되기 전(authReady=false)에는 읽지 않는다 = 손님 목록과 계정 목록이 섞이지 않는다.
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

  // X 터치 = 화면에서 빼고 그 자리에서 기기에 적어둔다. 여정·영상·해설이 이 함수 하나를 같이 쓴다(§0).
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
