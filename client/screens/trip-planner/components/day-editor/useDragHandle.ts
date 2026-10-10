import { useRef } from "react";
import { PanResponder } from "react-native";

type DragCallbacks = {
  onStart?: () => void;
  onMove: (dy: number) => void;
  onEnd?: () => void;
};

// 손가락(마우스) 하나로 위아래로 끄는 손잡이 = 끄는 동안 스크롤에 빼앗기지 않는다.
export function useDragHandle(cb: DragCallbacks) {
  const ref = useRef(cb);
  ref.current = cb;
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => ref.current.onStart?.(),
      onPanResponderMove: (_, g) => ref.current.onMove(g.dy),
      onPanResponderRelease: () => ref.current.onEnd?.(),
      onPanResponderTerminate: () => ref.current.onEnd?.(),
    }),
  ).current.panHandlers;
}
