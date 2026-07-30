// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = 웹 지구본 인트로 = **cobe**.
//   사장님이 준 GlobeCdn 원본(21st.dev @shuding/cobe-globe-cdn) 구조를 **그대로** 따르고,
//   지시대로 **배경색과 도트 색만** BTS 톤으로 바꿨다. 라벨·피라미드·아크·드래그 = 원본 그대로.
//
//   원본의 핵심 = 마커/아크에 `id` 를 주면 cobe 가 `--cobe-<id>` CSS 앵커와
//   `--cobe-visible-<id>` 변수를 만들어 준다. 라벨을 그 앵커에 붙이면 지구본이 돌 때
//   라벨이 마커를 따라다니고, 뒤로 넘어가면 흐려지며 사라진다. (제가 처음엔 이걸 빼먹어 효과가 없었다)
//
//   이 화면이 하는 일 = 인트로(누르는 화면 아님): 임박 5개 공연도시를 라벨로 띄우고,
//   아미봉 인증화면에 나온 그 도시로 돌려 정면에 세운다.
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import createGlobe from "cobe";
import { formatDDay, type BTSCity } from "@/contexts/BTSContext";

// BTS 톤 = 어두운 배경 + 보라 도트 (원본은 흰 지구본/검은 점이었다)
const BG = "#070514";
const DOT: [number, number, number] = [0.42, 0.28, 0.72]; // 지구 표면 점
const MARKER: [number, number, number] = [0.66, 0.33, 0.97]; // #a855f7 보라해
const GLOW: [number, number, number] = [0.16, 0.1, 0.32];

// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **아이폰12 에서 피켓이 넘쳐 잘렸다.**
//   원인(Chrome DevTools 실측 390px 화면) = 피켓이 지구본 상자 **안에** 있어서 지구본 확대(GLOBE_ZOOM)가
//   피켓에도 곱해지고, 거기에 피켓 확대까지 또 곱해져 **277 → 1080px**(화면의 2.8배)이 됐다.
//   해법 = 피켓에 지구본 배율의 **역수**를 곱해 지구본 확대를 상쇄한다 = 아래 PICKET_ZOOM 이 곧 실제 배율.
const GLOBE_ZOOM = 2.6; // 대상 도시 도착 시 지구본 확대 배율
const PICKET_ZOOM = 1.25; // 피켓 실제 확대 배율(상쇄 후 = 눈에 보이는 그대로)

type Props = {
  cities: BTSCity[]; // 임박 5개(pickImminentCities 결과)
  targetCityEn: string; // 랜딩(아미봉)에서 넘어온 줌인 대상 도시
};

export default function BTSGlobeIntroWeb({ cities, targetCityEn }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 대상 도시가 정면에 온 순간 = 최대 줌인 시작(회전은 그때 멈춘다)
  const [zoomed, setZoomed] = useState(false);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);

  // 마커 id = 도시별 고유값(앵커 이름에 쓰인다). 공백·특수문자 제거.
  const idOf = (c: BTSCity) => `bts-${c.id}`;

  // ⚠️ 수정금지(승인필요) 2026-07-30 = **줌인 대상 도시 판단은 여기 1벌만.**
  //   옛것(지구본은 find||cities[0] / 피켓은 filter) = 두 벌이라 서로 다른 답을 냈다 §19:
  //   랜딩이 준 도시가 목록에 없으면 지구본은 cities[0] 에 마커를 찍는데 피켓은 빈 배열이 되어
  //   **이름 없는 점만 확대되고 끝났다.** 이제 둘 다 이 값을 쓰므로 항상 같은 도시를 가리킨다.
  const target = useMemo(
    () =>
      cities.find(
        (c) => (c.nameEn || "").toUpperCase() === targetCityEn.toUpperCase(),
      ) || cities[0],
    [cities, targetCityEn],
  );

  // 원본과 같은 드래그 처리 = 손으로 돌릴 수 있다
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
    // 목록이 아직 안 왔으면 target 이 없다 = 그릴 대상이 없으므로 기다린다(도착하면 다시 실행됨)
    if (!canvas || !target) return;

    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId = 0;
    let ro: ResizeObserver | null = null;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    // 화면이 사라졌는지 표식 = 아래 정리에서 true 가 된다(정리 후 실행 방지)
    let disposed = false;

    // 줌인 대상 = 위에서 구한 1벌(target). 그 도시가 정면으로 오는 각도로 수렴시킨다.
    // (위아래 각도는 아래 theta 고정값을 쓰므로 대상 도시의 위도는 각도 계산에 쓰지 않는다.)
    const targetPhi =
      -(((target?.longitude ?? 0) * Math.PI) / 180) - Math.PI / 2;

    // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **나머지 도시 점·동선 라인 전부 삭제** §19.
    //   사유: 효과가 없고 화면만 지저분했다. 지구본에는 **공연 임박 1도시 점 하나만** 찍는다.

    function init() {
      // 화면이 이미 사라졌으면 새로 만들지 않는다(안 그러면 안 멈추는 루프가 생긴다)
      if (disposed) return;
      const width = canvas!.offsetWidth;
      if (width === 0 || globe) return;

      // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **회전 속도는 처음부터 끝까지 똑같다.**
      //   옛 방식(목표 각도로 수렴)은 마지막에 갑자기 홱 도는 느낌이라 폐기 §19.
      //
      //   ⚠️ 각도를 프레임마다 조금씩 더하는 방식도 폐기했다 = 화면이 느린 기기에서는 반 바퀴를 도는 데
      //     4초가 넘어, 인트로(3.5초)가 먼저 끝나 **줌인이 아예 실행되지 않았다**(Chrome DevTools 실증).
      //   지금은 **시간 기준**이다 = 어떤 기기에서도 ROTATE_MS 안에 정확히 반 바퀴를 돈다(속도 일정).
      const ROTATE_MS = 1700; // 반 바퀴 도는 데 걸리는 시간
      const startPhi = targetPhi - Math.PI; // **반 바퀴만** 돌린다(사장님 지시)
      const startedAt = Date.now();
      let phi = startPhi;
      // ⚠️ 사장님 지시 = 위아래는 **거의 옆에서 보는 각도** 로 고정. 대상 도시 위도를 따라가면
      //   도시마다 각도가 달라지고 위아래로 흔들린다. 고정값이면 항상 같은 화면이 나온다.
      const theta = 0.18;
      let arrived = false;
      const onArrive = () => setZoomed(true); // 정면 도착 = 정지 + 확대

      globe = createGlobe(canvas!, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width,
        height: width,
        phi: 0,
        theta,
        dark: 1,
        diffuse: 1.4,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: DOT,
        markerColor: MARKER,
        glowColor: GLOW,
        markerElevation: 0.02,
        opacity: 0.95,
        // ⚠️ 점은 **공연 임박 1도시 하나만**(사장님 지시). 나머지 4개는 찍지 않는다.
        markers: target
          ? [
              {
                location: [target.latitude ?? 0, target.longitude ?? 0] as [
                  number,
                  number,
                ],
                size: 0.12,
                id: idOf(target),
              },
            ]
          : [],
      });

      function animate() {
        if (disposed) return; // 화면이 사라졌으면 다음 프레임을 예약하지 않는다
        if (!isPausedRef.current && !arrived) {
          // 지난 시간 비율만큼 반 바퀴를 나눠 돈다 = 어떤 기기에서도 같은 속도·같은 시간
          const p = Math.min(1, (Date.now() - startedAt) / ROTATE_MS);
          phi = startPhi + Math.PI * p;
          if (p >= 1) {
            // 대상 도시가 정면에 옴 → 회전 정지 + 최대 줌인 시작
            arrived = true;
            onArrive();
          }
        }
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: theta + thetaOffsetRef.current + dragOffset.current.theta,
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
      //   이게 없으면: 화면이 사라진 뒤에 폭이 잡히는 경우 관찰기가 init() 을 실행해
      //   **정리할 주체가 없는 지구본과 애니 루프가 새로 생겨 영원히 안 멈춘다**(화면을 빠르게
      //   들락날락할 때 루프가 겹치는 실제 경로). 관찰기도 여기서 반드시 끊는다.
      disposed = true;
      ro?.disconnect();
      if (fadeTimer) clearTimeout(fadeTimer);
      if (animationId) cancelAnimationFrame(animationId);
      if (globe) globe.destroy();
    };
  }, [target]);

  // 원본의 회전하는 3D 피라미드 = 라벨 위 표식(이모지 대신 도형)
  const pyramidFaceStyle = (nth: number): React.CSSProperties => {
    const transforms = [
      "rotateY(0deg) translateZ(4px) rotateX(19.5deg)",
      "rotateY(120deg) translateZ(4px) rotateX(19.5deg)",
      "rotateY(240deg) translateZ(4px) rotateX(19.5deg)",
      "rotateX(-90deg) rotateZ(60deg) translateY(4px)",
    ];
    // 보라해 톤 4면
    const colors = ["#a855f7", "#8B46E0", "#6D31C4", "#7C3AED"];
    return {
      position: "absolute",
      left: -0.5,
      top: 0,
      width: 0,
      height: 0,
      borderLeft: "6.5px solid transparent",
      borderRight: "6.5px solid transparent",
      borderBottom: `13px solid ${colors[nth]}`,
      transformOrigin: "center bottom",
      transform: transforms[nth],
    };
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes bts-pyramid-spin {
          0% { transform: rotateX(20deg) rotateY(0deg); }
          100% { transform: rotateX(20deg) rotateY(360deg); }
        }
      `}</style>

      <div
        data-globe-wrap="1"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          aspectRatio: "1 / 1",
          userSelect: "none",
          // ⚠️ 최대 줌인 = 대상 도시가 정면에 온 순간 확대(사장님 지시 2026-07-30).
          //   회전은 그때 멈추므로 확대 중에는 화면이 흔들리지 않는다.
          transform: zoomed ? `scale(${GLOBE_ZOOM})` : "scale(1)",
          transition: "transform 1.4s cubic-bezier(0.33, 0, 0.2, 1)",
          willChange: "transform",
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

        {/* ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **피켓은 1순위 도시 하나만.**
            5개를 다 띄웠더니 서로 겹쳐 아무것도 안 보였다 §19.
            나머지 도시는 지구본 위 점으로만 남는다(위치는 보이되 글자는 없음).
            라벨은 cobe 가 만든 CSS 앵커에 붙어 지구본이 돌면 따라 움직이고, 뒤로 가면 흐려진다. */}
        {(target ? [target] : []).map((c) => {
          const id = idOf(c);
          return (
            <div
              key={id}
              style={
                {
                  position: "absolute",
                  positionAnchor: `--cobe-${id}`,
                  bottom: "anchor(top)",
                  left: "anchor(center)",
                  translate: "-50% 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  pointerEvents: "none",
                  opacity: `var(--cobe-visible-${id}, 0)`,
                  filter: `blur(calc((1 - var(--cobe-visible-${id}, 0)) * 8px))`,
                  transition:
                    "opacity 0.3s, filter 0.3s, scale 1.2s cubic-bezier(0.33, 0, 0.2, 1)",
                  // ⚠️ 사장님 지시 = 지구본 줌인이 잘 안 보이더라도 **피켓이 확대되어 멈추면**
                  //   어느 도시인지 확실히 남는다. 그래서 줄이지 않고 **키운다.**
                  //   단 지구본 확대가 피켓에도 곱해지므로 **역수로 상쇄**한다(안 하면 아이폰12 에서 잘림).
                  scale: zoomed ? `${PICKET_ZOOM / GLOBE_ZOOM}` : "1",
                  transformOrigin: "center bottom",
                } as React.CSSProperties
              }
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  position: "relative",
                  transformStyle: "preserve-3d",
                  animation: "bts-pyramid-spin 4s linear infinite",
                }}
              >
                {[0, 1, 2, 3].map((n) => (
                  <div key={n} style={pyramidFaceStyle(n)} />
                ))}
              </div>
              {/* ⚠️ 수정금지(승인필요) 2026-07-30 = 아이폰12(390px) 기준으로 맞춘 피켓.
                    ① 글자 크기·여백을 지구본 배율로 나눠 = 확대돼도 원래 굵기로 보인다.
                    ② 최대 너비를 화면(100vw)에 묶어 = 어떤 도시 이름이 와도 밖으로 안 나간다.
                    ③ **도시명과 D-Day 를 두 줄로 나눈다**(사장님 지시 2026-07-30) =
                       한 줄에 붙여 놓으니 어디까지가 도시 이름인지 구분이 안 됐다.
                       아미봉 인증화면과 **같은 짜임** = 도시명(작게·자간 넓게) 위 / D-Day(크게·굵게) 아래. */}
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontFamily: "monospace",
                  color: "#FFFFFF",
                  background: "rgba(168, 85, 247, 0.92)",
                  border: "2px solid #E9D5FF",
                  padding: `${9 / PICKET_ZOOM}px ${16 / PICKET_ZOOM}px ${7 / PICKET_ZOOM}px`,
                  borderRadius: 10,
                  maxWidth: `calc((100vw - 24px) / ${PICKET_ZOOM})`,
                  boxShadow: "0 6px 24px rgba(168, 85, 247, 0.55)",
                  textAlign: "center",
                }}
              >
                {/* 윗줄 = 도시 이름 (아미봉 화면처럼 작게·자간 넓게) */}
                <span
                  style={{
                    fontSize: `${0.82 / PICKET_ZOOM}rem`,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    lineHeight: 1.2,
                    opacity: 0.85,
                    // 자간 때문에 오른쪽에 생기는 빈칸을 상쇄 = 글자가 가운데로 보인다
                    textIndent: "0.18em",
                  }}
                >
                  {(c.nameEn || "").toUpperCase()}
                </span>
                {/* 아랫줄 = D-Day (아미봉 화면처럼 크게·굵게). 값이 없으면 줄 자체가 안 생긴다.
                    글자 만드는 규칙은 네이티브 지도 카드와 **같은 함수 1벌**(formatDDay). */}
                {formatDDay(c.dDay) ? (
                  <span
                    style={{
                      fontSize: `${1.6 / PICKET_ZOOM}rem`,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.1,
                      marginTop: 1 / PICKET_ZOOM,
                    }}
                  >
                    {formatDDay(c.dDay)}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
