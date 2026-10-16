// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **지구본 라벨 공용 부품**(에셋).
import React, { useEffect, useRef, useCallback, useMemo } from "react";
import createGlobe from "cobe";

export type GlobeLabelMarker = {
  id: string | number; // 도시 id 등 고유값(앵커 이름에 쓰인다)
  location: [number, number]; // [위도, 경도]
  text: string; // 라벨에 보일 글자(도시 이름 등)
  color?: string; // 라벨 배경색(생략 = 기본 보라)
  rotate?: number; // 라벨 기울기(도). 생략 = 0
};

type Props = {
  markers: GlobeLabelMarker[];
  speed?: number;
  onSelect?: (marker: GlobeLabelMarker) => void;
  selectedId?: string | number | null;
  parentScale?: number;
  maxWidth?: number;
  dark?: boolean;
};

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
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const markersKey = useMemo(
    () =>
      markers.map((m) => `${m.id}:${m.location[0]},${m.location[1]}`).join("|"),
    [markers],
  );
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

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
    let disposed = false;
    const tone = dark ? DARK : LIGHT;

    function init() {
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
      disposed = true;
      ro?.disconnect();
      if (fadeTimer) clearTimeout(fadeTimer);
      if (animationId) cancelAnimationFrame(animationId);
      if (globe) globe.destroy();
    };
  }, [markersKey, dark]);

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
                transform: `rotate(${m.rotate ?? 0}deg)${picked ? " scale(1.08)" : ""}`,
                border: picked
                  ? `${2 / s}px solid #FFFFFF`
                  : `${2 / s}px solid transparent`,
                borderRadius: 4,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.2), 0 3px 8px rgba(0,0,0,0.1), inset 0 -1px 0 rgba(0,0,0,0.15)",
                textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                pointerEvents: clickable ? "auto" : "none",
                cursor: clickable ? "pointer" : "default",
                overflow: "hidden",
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
