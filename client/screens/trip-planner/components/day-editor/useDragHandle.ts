import { useRef } from "react";
import { PanResponder } from "react-native";

type DragCallbacks = {
  onStart?: () => void;
  onMove: (dy: number) => void;
  onEnd?: () => void;
  onTap?: () => void;
  slop?: number;
};

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
