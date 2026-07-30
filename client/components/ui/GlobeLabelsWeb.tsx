// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **지구본 라벨 공용 부품**(에셋).
//   출처 = 21st.dev @shuding/cobe-globe-labels. 원본 보존 = docs/design-references/cobe-globe-labels-reference.tsx
//
//   왜 부품으로 두는가 = 사장님 지시: 나중에 **메인앱 여정플래너의 도시 선택**에 쓸 것.
//   ⚠️ **아직 어느 화면에도 안 붙였다**(보관만). 지금 도는 지구본은 이것이 아니라
//     `client/screens/bts/bts-globe-html.ts` 다(웹·앱 공통 1벌). 헷갈리지 말 것.
//
//   원본에서 바꾼 것 (= 우리 앱 규칙에 맞춤):
//   ① Tailwind(className) 제거 = 우리 앱은 Tailwind 를 쓰지 않는다 → style 로 대체.
//   ② 라벨을 **누를 수 있게** 함(onSelect) = 도시 선택에 쓰려면 필수. 원본은 pointerEvents:none 이라 못 누른다.
//   ③ 라벨 크기를 배율로 나눠 계산 = 부모가 확대(scale)해도 글자가 안 깨지고 화면 밖으로 안 넘친다.
//      (2026-07-30 아이폰12 에서 피켓이 화면의 2.8배로 넘쳐 잘린 사고의 교훈 = 배율이 곱해진다.)
//   ④ 색·기울기 같은 꾸밈값에 기본값을 줘서 = 좌표와 이름만 넘겨도 바로 쓰인다.
//
//   ⚠️ 웹 전용이다. CSS Anchor Positioning(positionAnchor)·WebGL 캔버스를 쓰므로
//     iOS/안드로이드 앱(React Native)에서는 동작하지 않는다. 앱 화면에서 쓰려면 별도 대응이 필요하다.
//     그래서 파일명에 **Web** 을 붙였다. 앱에서도 쓰려면 BTS 지구본처럼
//     WebView 안에서 띄우는 방식으로 옮겨야 한다(bts-globe-html.ts 참고).
import React, { useEffect, useRef, useCallback, useMemo } from "react";
import createGlobe from "cobe";

// 지구본 위에 찍을 지점 1개 = 좌표 + 보여줄 글자
export type GlobeLabelMarker = {
  id: string | number; // 도시 id 등 고유값(앵커 이름에 쓰인다)
  location: [number, number]; // [위도, 경도]
  text: string; // 라벨에 보일 글자(도시 이름 등)
  color?: string; // 라벨 배경색(생략 = 기본 보라)
  rotate?: number; // 라벨 기울기(도). 생략 = 0
};

type Props = {
  markers: GlobeLabelMarker[];
  /** 자동 회전 속도. 0 이면 안 돈다. */
  speed?: number;
  /** 라벨을 누르면 그 지점을 알려준다. 주면 라벨이 눌리는 버튼이 된다(도시 선택용). */
  onSelect?: (marker: GlobeLabelMarker) => void;
  /** 지금 골라진 지점 id = 그 라벨만 도드라지게 표시 */
  selectedId?: string | number | null;
  /** 부모가 확대(scale)해서 쓸 때 그 배율을 알려주면 = 라벨이 그만큼 작아져 안 넘친다. */
  parentScale?: number;
  /** 지구본 크기 상한(px). 기본 560 */
  maxWidth?: number;
  /** 배경이 밝은 화면이면 false(기본) / 어두운 화면이면 true */
  dark?: boolean;
};

// 밝은 배경 기본 색(원본 톤) / 어두운 배경 기본 색(BTS 톤)
const LIGHT = {
  base: [1, 1, 1] as [number, number, number],
  marker: [0.55, 0.35, 0.75] as [number, number, number],
  glow: [0.94, 0.93, 0.91] as [number, number, number],
  brightness: 9,
};
const DARK = {
  base: [0.42, 0.28, 0.72] as [number, number, number],
  marker: [0.66, 0.33, 0.97] as [number, number, number],
  glow: [0.16, 0.1, 0.32] as [number, number, number],
  brightness: 6,
};
const DEFAULT_LABEL_COLOR = "#7b2cbf";

// cobe 가 만드는 변수 이름 = `--cobe-<id>` 와 `--cobe-visible-<id>` (라이브러리 소스로 확인).
// 우리는 id 에 `g-` 를 붙여 = 한 화면에 지구본이 둘이어도 이름이 안 겹치게 한다.
const cobeIdOf = (id: string | number) => `g-${id}`;

export default function GlobeLabelsWeb({
  markers,
  speed = 0.003,
  onSelect,
  selectedId = null,
  parentScale = 1,
  maxWidth = 560,
  dark = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);
  // 속도를 ref 로 들고 있어 = 속도가 바뀌어도 지구본을 새로 만들지 않는다(깜빡임 방지).
  // ⚠️ 대입은 반드시 useEffect 안에서. 그리는 도중(렌더 본문)에 ref 를 바꾸면
  //   React 가 그리기를 취소했을 때 값이 어긋난다.
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // 지점 목록을 **내용 기준 열쇠**로 바꾼다 = 부모가 배열을 새로 만들어도 내용이 같으면
  // 지구본을 다시 만들지 않는다(안 그러면 매 렌더 파괴·재생성 = 깜빡임 + WebGL 자리 소진).
  const markersKey = useMemo(
    () =>
      markers.map((m) => `${m.id}:${m.location[0]},${m.location[1]}`).join("|"),
    [markers],
  );
  // 그리는 순간의 최신 목록 = 지구본을 다시 만들지 않고도 읽을 수 있게 ref 로 들고 있는다
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // 손으로 돌리기 = 원본 그대로
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    isPausedRef.current = true;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi;
      thetaOffsetRef.current += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
    }
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    isPausedRef.current = false;
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        };
      }
    };
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId = 0;
    let phi = 0;
    let ro: ResizeObserver | null = null;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    // 화면이 사라졌는지 표식 = 아래 정리에서 true 가 된다(정리 후 실행 방지)
    let disposed = false;
    const tone = dark ? DARK : LIGHT;

    function init() {
      // 화면이 이미 사라졌으면 새로 만들지 않는다(안 그러면 안 멈추는 루프가 생긴다)
      if (disposed) return;
      const width = canvas!.offsetWidth;
      if (width === 0 || globe) return;

      globe = createGlobe(canvas!, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width,
        height: width,
        phi: 0,
        theta: 0.2,
        dark: dark ? 1 : 0,
        diffuse: 1.5,
        mapSamples: 16000,
        mapBrightness: tone.brightness,
        baseColor: tone.base,
        markerColor: tone.marker,
        glowColor: tone.glow,
        markerElevation: 0,
        opacity: 0.85,
        // id 를 주면 cobe 가 `--cobe-g-<id>` 앵커를 만들어 준다 = 라벨이 지점을 따라다닌다
        markers: markersRef.current.map((m) => ({
          location: m.location,
          size: 0.025,
          id: cobeIdOf(m.id),
        })),
      });

      function animate() {
        if (disposed) return; // 화면이 사라졌으면 다음 프레임을 예약하지 않는다
        if (!isPausedRef.current) phi += speedRef.current;
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: 0.2 + thetaOffsetRef.current + dragOffset.current.theta,
        });
        animationId = requestAnimationFrame(animate);
      }
      animate();
      fadeTimer = setTimeout(() => canvas && (canvas.style.opacity = "1"));
    }

    if (canvas.offsetWidth > 0) {
      init();
    } else {
      // 폭이 아직 0 이면 = 폭이 잡히는 순간 시작. 관찰기는 아래 정리에서 반드시 끊는다.
      ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro?.disconnect();
          init();
        }
      });
      ro.observe(canvas);
    }

    return () => {
      // ⚠️ 수정금지(승인필요) 2026-07-30 = **정리 표식(disposed) 필수.**
      //   이게 없으면 화면이 사라진 뒤에 폭이 잡히는 경우 관찰기가 init() 을 실행해
      //   정리할 주체가 없는 지구본·애니 루프가 새로 생겨 영원히 안 멈춘다.
      disposed = true;
      ro?.disconnect();
      if (fadeTimer) clearTimeout(fadeTimer);
      if (animationId) cancelAnimationFrame(animationId);
      if (globe) globe.destroy();
    };
    // ⚠️ markers 를 그대로 의존성에 두면 부모가 배열을 새로 만들 때마다(= 매 렌더)
    //   지구본이 파괴·재생성되어 깜빡이고 WebGL 자리를 소진한다. 그래서 **내용 기준 열쇠**로 비교하고,
    //   실제 목록은 markersRef 로 읽는다(위 참조).
  }, [markersKey, dark]);

  // 부모가 확대해 쓰면 그 배율만큼 라벨을 줄여 = 화면 밖으로 안 넘친다(아이폰12 잘림 사고 교훈)
  const s = parentScale > 0 ? parentScale : 1;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth,
        aspectRatio: "1 / 1",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1.2s ease",
          borderRadius: "50%",
          touchAction: "none",
        }}
      />

      {markers.map((m) => {
        const cid = cobeIdOf(m.id); // cobe 가 만든 변수 이름의 뒷부분
        const picked = selectedId != null && selectedId === m.id;
        const clickable = typeof onSelect === "function";
        return (
          <div
            key={m.id}
            // 누를 수 있게 만들 때만 버튼 역할을 준다(도시 선택용). 아니면 장식이라 읽히지 않게 둔다.
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={clickable ? `${m.text} 선택` : undefined}
            aria-pressed={clickable ? picked : undefined}
            onClick={clickable ? () => onSelect!(m) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect!(m);
                    }
                  }
                : undefined
            }
            style={
              {
                position: "absolute",
                positionAnchor: `--cobe-${cid}`,
                bottom: "anchor(top)",
                left: "anchor(center)",
                translate: "-50% 0",
                marginBottom: -10 / s,
                padding: `${0.4 / s}rem ${0.65 / s}rem ${0.35 / s}rem`,
                background: m.color || DEFAULT_LABEL_COLOR,
                color: "#fff",
                fontFamily:
                  "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
                fontSize: `${0.85 / s}rem`,
                fontWeight: 600,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                // 골라진 것만 살짝 커지고 테두리가 생긴다
                transform: `rotate(${m.rotate ?? 0}deg)${picked ? " scale(1.08)" : ""}`,
                border: picked
                  ? `${2 / s}px solid #FFFFFF`
                  : `${2 / s}px solid transparent`,
                borderRadius: 4,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.2), 0 3px 8px rgba(0,0,0,0.1), inset 0 -1px 0 rgba(0,0,0,0.15)",
                textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                // 누를 수 있을 때만 손가락을 받는다. 장식일 땐 지구본 드래그를 막지 않는다.
                pointerEvents: clickable ? "auto" : "none",
                cursor: clickable ? "pointer" : "default",
                overflow: "hidden",
                // 지구본 뒤로 넘어가면 흐려지며 사라진다(원본의 핵심 효과)
                opacity: `var(--cobe-visible-${cid}, 0)`,
                filter: `blur(calc((1 - var(--cobe-visible-${cid}, 0)) * 8px))`,
                transition: "opacity 0.3s, filter 0.3s, transform 0.25s",
              } as React.CSSProperties
            }
          >
            {/* 라벨 위쪽 광택 = 스티커 느낌(원본 그대로) */}
            <span
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "50%",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 60%, transparent 100%)",
                borderRadius: "4px 4px 50% 50%",
                pointerEvents: "none",
              }}
            />
            {m.text}
          </div>
        );
      })}
    </div>
  );
}
