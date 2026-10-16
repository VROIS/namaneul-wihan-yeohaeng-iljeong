import { useRef } from "react";
import { PanResponder } from "react-native";

type DragCallbacks = {
  onStart?: () => void;
  onMove: (dy: number) => void;
  onEnd?: () => void;
  onTap?: () => void;
  slop?: number;
};

// 손가락(마우스) 하나로 위아래로 끄는 손잡이 = 끄는 동안 스크롤에 빼앗기지 않는다.
//   slop 을 주면 그만큼 움직이기 전까지는 끌기가 아니라 "톡 누름"(onTap)이다.
export function useDragHandle(cb: DragCallbacks) {
  const ref = useRef(cb);
  ref.current = cb;
  const started = useRef(false);
  const pan = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  if (!pan.current)
    pan.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        started.current = !ref.current.slop;
        if (started.current) ref.current.onStart?.();
      },
      onPanResponderMove: (_, g) => {
        if (!started.current) {
          if (Math.hypot(g.dx, g.dy) < (ref.current.slop ?? 0)) return;
          started.current = true;
          ref.current.onStart?.();
        }
        ref.current.onMove(g.dy);
      },
      onPanResponderRelease: () => {
        if (started.current) ref.current.onEnd?.();
        else ref.current.onTap?.();
        started.current = false;
      },
      onPanResponderTerminate: () => {
        if (started.current) ref.current.onEnd?.();
        started.current = false;
      },
    });
  return pan.current.panHandlers;
}
