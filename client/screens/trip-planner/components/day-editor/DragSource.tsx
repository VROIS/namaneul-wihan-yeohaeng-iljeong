import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { DraxView, type DraxDragEventData } from "react-native-drax";

type Props = {
  payload: unknown;
  delay: number;
  horizontal?: boolean;
  style?: ViewStyle;
  onStart: () => void;
  onEnd: (moved: boolean, dropped: boolean) => void;
  onTap?: () => void;
  hover: () => React.ReactNode;
};

const movedOf = (d: DraxDragEventData) =>
  Math.hypot(d.dragTranslation.x, d.dragTranslation.y) > 8;

// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 끌어 옮기기 손잡이 1벌(슬롯 · 보관함 · 팻말 공용) = 카드 위 투명 겹 · react-native-drax · 끄는 동안 다시 그려지지 않게 속성을 고정하고 최신 값은 ref 로 읽는다(RNGH 2 는 다시 그리면 제스처를 새로 만들어 끌기가 끊긴다) · 톡 = 끌기와 따로 잡는다 (정본 §)
export default function DragSource(props: Props) {
  const ref = useRef(props);
  ref.current = props;
  const onDragStart = useCallback(() => ref.current.onStart(), []);
  const onDragEnd = useCallback(
    (d: DraxDragEventData) => ref.current.onEnd(movedOf(d), false),
    [],
  );
  const onDragDrop = useCallback(
    (d: DraxDragEventData) => ref.current.onEnd(movedOf(d), true),
    [],
  );
  const renderHoverContent = useCallback(() => ref.current.hover(), []);
  const inner = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_e, ok) => {
        if (ok) ref.current.onTap?.();
      });
    return (
      <GestureDetector gesture={tap}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
    );
  }, []);
  return (
    <DraxView
      style={props.style ?? StyleSheet.absoluteFill}
      draggable
      longPressDelay={props.delay}
      scrollHorizontal={props.horizontal}
      dragPayload={props.payload}
      receptive={false}
      animateSnap={false}
      renderHoverContent={renderHoverContent}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragDrop={onDragDrop}
    >
      {inner}
    </DraxView>
  );
}
