// ⚠️ 수정금지(승인필요) — BTS 세계지도 줌인 + 3D 글래스 알림판
// 마커가 mapArea 안에 배치 → 줌인과 함께 자연스럽게 확대
// 데이터: /api/bts/next-concert 실시간 (날짜, D-Day, 공연장)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { loadBtsWorldMapSvg } from "@/constants/bts-world-map-svg";
import { geoToViewBox } from "@/components/DotWorldMap";

const { width: SW, height: SH } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 지도 크기 (viewBox 99x50 비율 유지)
const MAP_W = SW;
const MAP_H_ORIGINAL = SW * (50 / 99);
// ⚠️ 수정금지(승인필요) — 원본 비율 유지, 화면 폭 꽉 채움
// ⚠️ 수정금지(승인필요) — 세로 1.6배 확장 (K6 최종안)
const MAP_H = MAP_H_ORIGINAL * 1.6;
const MAP_TOP = (SH - MAP_H) / 2;

// ⚠️ 수정금지(승인필요) — 도시 좌표 DB (위경도 → viewBox 변환)
// 추후 API에서 가져오도록 확장 가능
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  GOYANG: { lat: 37.6584, lng: 126.832 },
  TOKYO: { lat: 35.6762, lng: 139.6503 },
  TAMPA: { lat: 27.9506, lng: -82.4572 },
  PARIS: { lat: 48.8566, lng: 2.3522 },
  LONDON: { lat: 51.5074, lng: -0.1278 },
  "LOS ANGELES": { lat: 34.0522, lng: -118.2437 },
  BUSAN: { lat: 35.1796, lng: 129.0756 },
  MADRID: { lat: 40.4168, lng: -3.7038 },
  MUNICH: { lat: 48.1351, lng: 11.582 },
  SINGAPORE: { lat: 1.3521, lng: 103.8198 },
  BANGKOK: { lat: 13.7563, lng: 100.5018 },
  SYDNEY: { lat: -33.8688, lng: 151.2093 },
  MANILA: { lat: 14.5995, lng: 120.9842 },
};

type RouteParams = {
  city?: string;
  cityId?: number;
  date?: string;
  dDay?: number;
  venue?: string;
};

export default function BTSWorldMapScreen() {
  const navigation = useNavigation<any>();
  const route =
    useRoute<RouteProp<{ BTSWorldMap: RouteParams }, "BTSWorldMap">>();

  // ⚠️ 수정금지(승인필요) — SVG 에셋 비동기 로딩 (번들 크기 축소)
  const [svgXml, setSvgXml] = useState<string | null>(null);
  useEffect(() => {
    loadBtsWorldMapSvg().then(setSvgXml);
  }, []);

  // ⚠️ 수정금지(승인필요) — API 실시간 데이터 (랜딩 params + API fallback)
  const [concert, setConcert] = useState({
    city: route.params?.city || "GOYANG",
    date: route.params?.date || "",
    dDay: route.params?.dDay ?? 0,
    venue: route.params?.venue || "",
  });

  // ⚠️ 수정금지(승인필요) — params 없으면 API에서 직접 가져옴
  useEffect(() => {
    if (!concert.date) {
      fetch(`${getApiUrl()}/api/bts/next-concert`)
        .then((r) => r.json())
        .then((d) => {
          if (d.city)
            setConcert({
              city: d.city.toUpperCase(),
              date: d.date,
              dDay: d.dDay,
              venue: d.venue || "",
            });
        })
        .catch(() => {}); // fallback 유지
    }
  }, []);

  const targetCity = concert.city;
  const concertDate = concert.date;
  const dDay = concert.dDay;
  const venue = concert.venue;

  // ⚠️ 수정금지(승인필요) — 도시 좌표 → viewBox → 화면 좌표
  const coords = CITY_COORDS[targetCity.toUpperCase()] || CITY_COORDS.GOYANG;
  const vb = geoToViewBox(coords.lat, coords.lng);
  const targetX = (vb.x / 99) * MAP_W;
  const targetY = (vb.y / 50) * MAP_H;

  // ⚠️ 수정금지(승인필요) — 애니메이션 값
  const mapScale = useSharedValue(1);
  const mapTx = useSharedValue(0);
  const mapTy = useSharedValue(0);
  const fadeOut = useSharedValue(0);
  const cardScale = useSharedValue(0); // 카드 팽창: 0=점, 1=풀카드
  const textOpacity1 = useSharedValue(0); // 도시명
  const textOpacity2 = useSharedValue(0); // 날짜
  const textOpacity3 = useSharedValue(0); // D-Day
  const textOpacity4 = useSharedValue(0); // 공연장

  useEffect(() => {
    // ⚠️ 수정금지(승인필요) — 줌인 좌표 계산
    const S = 6;
    const tx = SW / 2 - MAP_W / 2 - (targetX - MAP_W / 2) * S;
    const ty = SH / 2 - MAP_TOP - MAP_H / 2 - (targetY - MAP_H / 2) * S;

    // ⚠️ 수정금지(승인필요) — 1초 후 줌인 시작 (1.5초, 원본 타이밍)
    const zoomTimer = setTimeout(() => {
      mapScale.value = withTiming(S, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      });
      mapTx.value = withTiming(tx, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      });
      mapTy.value = withTiming(ty, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      });
    }, 1000);

    // ⚠️ 수정금지(승인필요) — 줌인 거의 완료 시 (2초) 카드 팽창
    const cardTimer = setTimeout(() => {
      cardScale.value = withSpring(1, { damping: 15, stiffness: 160 });
      textOpacity1.value = withTiming(1, { duration: 300 });
      textOpacity2.value = withDelay(100, withTiming(1, { duration: 300 }));
      textOpacity3.value = withDelay(200, withTiming(1, { duration: 300 }));
      textOpacity4.value = withDelay(300, withTiming(1, { duration: 300 }));
    }, 2000);

    // ⚠️ 수정금지(승인필요) — 알림판 유지 후 전환 (총 3.5초, 원본 타이밍)
    let innerTimer: NodeJS.Timeout;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 3500);

    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(cardTimer);
      clearTimeout(navTimer);
      clearTimeout(innerTimer);
    };
  }, []);

  // ⚠️ 수정금지(승인필요) — 지도 transform
  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mapTx.value },
      { translateY: mapTy.value },
      { scale: mapScale.value },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 카드 스타일 (도시 위치에서 팽창)
  const cardAnimStyle = useAnimatedStyle(() => {
    const s = interpolate(
      cardScale.value,
      [0, 1],
      [0.1, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale: s }],
      opacity: interpolate(
        cardScale.value,
        [0, 0.3, 1],
        [0, 0.5, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeOut.value }));
  const t1 = useAnimatedStyle(() => ({ opacity: textOpacity1.value }));
  const t2 = useAnimatedStyle(() => ({ opacity: textOpacity2.value }));
  const t3 = useAnimatedStyle(() => ({ opacity: textOpacity3.value }));
  const t4 = useAnimatedStyle(() => ({ opacity: textOpacity4.value }));

  const dDayText =
    dDay > 0 ? `D-${dDay}` : dDay === 0 ? "D-Day" : `D+${Math.abs(dDay)}`;
  // ⚠️ 수정금지(승인필요) — 날짜 포맷: 2026.4.17 (전 인류 이해, 년월일 제외)
  const dateDisplay = concertDate
    ? (() => {
        const d = new Date(concertDate);
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
      })()
    : "";

  // 🌐 OriginKit (Cobe) 스타일 3D 도트 회전 지구본 + BTS 보라해 톤앤매너 피켓 & 아크 연결선 라이브 렌더링
  if (Platform.OS === "web") {
    const webGlobeHtml = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OriginKit Style 3D Dotted Globe - BTS World Tour 2026</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body { background: #070514; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif; overflow: hidden; width: 100vw; height: 100vh; }
    
    /* Header Tone & Manner */
    header { position: absolute; top: 22px; left: 0; right: 0; text-align: center; z-index: 20; pointer-events: none; }
    .tour-tag { font-size: 11px; font-weight: 800; letter-spacing: 6px; color: rgba(192, 132, 252, 0.6); margin-bottom: 4px; }
    .main-title { font-size: 34px; font-weight: 900; color: #FFFFFF; letter-spacing: -1px; }
    .brand-purple { color: #C084FC; font-style: italic; text-shadow: 0 0 16px rgba(192, 132, 252, 0.6); }
    .subtitle { font-size: 12.5px; color: rgba(255, 255, 255, 0.65); margin-top: 5px; }

    #canvas-container { width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; z-index: 1; cursor: grab; }
    #canvas-container:active { cursor: grabbing; }

    /* OriginKit Style 3D Picket Pins */
    .picket-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
    .picket-pin { position: absolute; transform: translate(-50%, -100%); pointer-events: auto; cursor: pointer; transition: transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    .picket-pin:hover { z-index: 100 !important; transform: translate(-50%, -112%) scale(1.14); }

    .picket-card {
      background: rgba(15, 10, 32, 0.9);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1.5px solid rgba(192, 132, 252, 0.7);
      box-shadow: 0 8px 30px rgba(124, 58, 237, 0.4), 0 0 15px rgba(192, 132, 252, 0.3);
      border-radius: 14px;
      padding: 7px 13px;
      display: flex;
      align-items: center;
      gap: 9px;
      white-space: nowrap;
    }
    .picket-flag { font-size: 17px; }
    .picket-info { display: flex; flex-direction: column; }
    .picket-city { font-size: 13px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.3px; }
    .picket-dday { font-size: 11px; font-weight: 800; color: #C084FC; }
    .picket-stem { width: 2px; height: 28px; background: linear-gradient(to bottom, rgba(192, 132, 252, 0.95), rgba(192, 132, 252, 0.15)); margin: 0 auto; box-shadow: 0 0 10px #C084FC; }
    .picket-dot { width: 8px; height: 8px; background: #FACC15; border-radius: 50%; margin: 0 auto; box-shadow: 0 0 12px #FACC15; }

    /* City Details Modal */
    .city-modal {
      position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%) translateY(140%);
      background: rgba(12, 8, 28, 0.94); border: 1.5px solid #C084FC; backdrop-filter: blur(24px);
      padding: 20px 28px; border-radius: 24px; box-shadow: 0 16px 45px rgba(0,0,0,0.65), 0 0 30px rgba(192, 132, 252, 0.4);
      z-index: 30; width: 90%; max-width: 420px; text-align: center; transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .city-modal.active { transform: translateX(-50%) translateY(0); }
    .modal-city-name { font-size: 24px; font-weight: 900; color: #FFFFFF; }
    .modal-venue { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 4px; }
    .modal-btn { margin-top: 16px; background: linear-gradient(135deg, #7C3AED, #9333EA); border: none; color: #FFF; font-weight: 800; padding: 12px 24px; border-radius: 50px; font-size: 14px; cursor: pointer; box-shadow: 0 4px 20px rgba(147, 51, 234, 0.5); }
    .hint { position: absolute; bottom: 16px; left: 20px; font-size: 12px; color: rgba(255,255,255,0.45); z-index: 20; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <header>
    <div class="tour-tag">WORLD TOUR 2026</div>
    <h1 class="main-title">BTS <span class="brand-purple">'Arirang'</span> 3D GLOBE</h1>
    <p class="subtitle">OriginKit Cobe 스타일 3D 도트 회전 지구본 & 도시 피켓 핀</p>
  </header>
  <div id="canvas-container"></div>
  <div class="picket-container" id="picket-container"></div>
  <div class="hint">🖱️ 마우스/터치 드래그: 3D 지구본 회전 | 도시 3D 피켓 클릭: 공연 정보 확인</div>

  <div class="city-modal" id="city-modal">
    <h2 class="modal-city-name" id="m-city">GOYANG</h2>
    <p class="modal-venue" id="m-venue">Goyang Stadium • 2026.04.09</p>
    <button class="modal-btn" onclick="nextStep()">이 도시 투어 선택 및 캐릭터 설정 →</button>
  </div>

  <script>
    const container = document.getElementById('canvas-container');
    const picketContainer = document.getElementById('picket-container');
    const cityModal = document.getElementById('city-modal');

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070514, 0.0014);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const CITIES = [
      { id: 'GOYANG', name: '고양 (GOYANG)', flag: '🇰🇷', lat: 37.6584, lng: 126.832, dDay: 'D-110', date: '2026.04.09', venue: 'Goyang Stadium' },
      { id: 'PARIS', name: '파리 (PARIS)', flag: '🇫🇷', lat: 48.8566, lng: 2.3522, dDay: 'D-125', date: '2026.04.24', venue: 'Stade de France' },
      { id: 'BRUSSELS', name: '브뤼셀 (BRUSSELS)', flag: '🇧🇪', lat: 50.8503, lng: 4.3517, dDay: 'D-130', date: '2026.04.29', venue: 'King Baudouin Stadium' },
      { id: 'MADRID', name: '마드리드 (MADRID)', flag: '🇪🇸', lat: 40.4168, lng: -3.7038, dDay: 'D-135', date: '2026.05.04', venue: 'Estadio Santiago Bernabéu' },
      { id: 'MUNICH', name: '뮌헨 (MUNICH)', flag: '🇩🇪', lat: 48.1351, lng: 11.582, dDay: 'D-140', date: '2026.05.09', venue: 'Allianz Arena' },
      { id: 'LONDON', name: '런던 (LONDON)', flag: '🇬🇧', lat: 51.5074, lng: -0.1278, dDay: 'D-145', date: '2026.05.14', venue: 'Wembley Stadium' },
      { id: 'LA', name: 'LOS ANGELES', flag: '🇺🇸', lat: 34.0522, lng: -118.2437, dDay: 'D-160', date: '2026.05.29', venue: 'SoFi Stadium' }
    ];

    // 백엔드 연동 실시간 콘서트 도시
    const TARGET_CITY_ID = "${targetCity.toUpperCase()}";
    const TARGET_CITY_INFO = CITIES.find(c => c.id === TARGET_CITY_ID) || CITIES[0];

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    const GLOBE_RADIUS = 92;

    // 1. OriginKit / Cobe Style 3D Dotted Sphere (구체 도트 메쉬)
    const dotCount = 1800;
    const dotPositions = [];
    const dotColors = [];
    const colorBorahae = new THREE.Color(0xC084FC);
    const colorGlow = new THREE.Color(0x9333EA);

    for (let i = 0; i < dotCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / dotCount);
      const theta = Math.sqrt(dotCount * Math.PI) * phi;
      const x = GLOBE_RADIUS * Math.cos(theta) * Math.sin(phi);
      const y = GLOBE_RADIUS * Math.sin(theta) * Math.sin(phi);
      const z = GLOBE_RADIUS * Math.cos(phi);
      dotPositions.push(x, y, z);
      const c = (i % 3 === 0) ? colorBorahae : colorGlow;
      dotColors.push(c.r, c.g, c.b);
    }

    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
    dotGeo.setAttribute('color', new THREE.Float32BufferAttribute(dotColors, 3));

    const dotMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });
    const dotsMesh = new THREE.Points(dotGeo, dotMat);
    globeGroup.add(dotsMesh);

    // Inner Dark Core Sphere
    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS - 1, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x0A0620, transparent: true, opacity: 0.94 })
    );
    globeGroup.add(coreMesh);

    // Atmosphere Ring Glow
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dLight = new THREE.DirectionalLight(0xA855F7, 1.4);
    dLight.position.set(200, 250, 200);
    scene.add(dLight);

    function latLngToVector3(lat, lng, radius) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);
      return new THREE.Vector3(-(radius * Math.sin(phi) * Math.cos(theta)), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
    }

    // 2. 3D Arc Connections (OriginKit Great Circle Arcs)
    function createArc(v1, v2) {
      const distance = v1.distanceTo(v2);
      const mid = v1.clone().add(v2).multiplyScalar(0.5);
      const midLength = mid.length();
      mid.normalize().multiplyScalar(midLength + distance * 0.25);

      const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);
      const points = curve.getPoints(40);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
      const arcMat = new THREE.LineBasicMaterial({ color: 0xC084FC, transparent: true, opacity: 0.45 });
      const arcLine = new THREE.Line(arcGeo, arcMat);
      globeGroup.add(arcLine);
    }

    // Connect Goyang to other cities with arcs
    const goyangPos = latLngToVector3(CITIES[0].lat, CITIES[0].lng, GLOBE_RADIUS);
    for (let i = 1; i < CITIES.length; i++) {
      const targetPos = latLngToVector3(CITIES[i].lat, CITIES[i].lng, GLOBE_RADIUS);
      createArc(goyangPos, targetPos);
    }

    // 3. Create 3D Pickets
    const pickets = [];
    CITIES.forEach((city) => {
      const pos = latLngToVector3(city.lat, city.lng, GLOBE_RADIUS);
      const dotMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 16), new THREE.MeshBasicMaterial({ color: 0xFACC15 }));
      dotMesh.position.copy(pos);
      globeGroup.add(dotMesh);

      const el = document.createElement('div');
      el.className = 'picket-pin';
      el.innerHTML = '<div class="picket-card"><span class="picket-flag">' + city.flag + '</span><div class="picket-info"><span class="picket-city">' + city.name + '</span><span class="picket-dday">' + city.dDay + '</span></div></div><div class="picket-stem"></div><div class="picket-dot"></div>';
      el.onclick = () => selectCity(city);
      picketContainer.appendChild(el);
      pickets.push({ data: city, meshPos: pos, element: el });
    });

    let isDragging = false, prevPos = { x: 0, y: 0 };
    let animPhase = 0; // 0: intro rotate, 1: focus target city, 2: zoom in, 3: modal open & auto next
    let startTime = performance.now();

    // 타겟 도시 3D 각도 계산 (위경도 -> 구체 3D 회전각)
    const targetLngRad = -(TARGET_CITY_INFO.lng * Math.PI / 180) - Math.PI / 2;
    const targetLatRad = (TARGET_CITY_INFO.lat * Math.PI / 180) * 0.55;

    container.addEventListener('mousedown', () => { isDragging = true; animPhase = 99; });
    window.addEventListener('mouseup', () => isDragging = false);
    container.addEventListener('mousemove', (e) => {
      if (isDragging) {
        globeGroup.rotation.y += (e.clientX - prevPos.x) * 0.004;
        globeGroup.rotation.x += (e.clientY - prevPos.y) * 0.004;
      }
      prevPos = { x: e.clientX, y: e.clientY };
    });

    function selectCity(city) {
      document.getElementById('m-city').innerText = city.name;
      document.getElementById('m-venue').innerText = city.venue + ' • ' + city.date + ' (' + city.dDay + ')';
      cityModal.classList.add('active');
    }

    function nextStep() {
      if (window.parent) {
        window.parent.postMessage({ type: 'NEXT_STEP' }, '*');
      }
    }

    // 🎬 인트로 연출 시퀀스 타임라인 (1.0s 타겟도시 회전정지 -> 2.2s 3D 줌인 -> 3.5s 카드팝업 -> 5.2s 자동전환)
    setTimeout(() => { if (animPhase === 0) animPhase = 1; }, 1000);
    setTimeout(() => { if (animPhase === 1) animPhase = 2; }, 2200);
    setTimeout(() => {
      if (animPhase === 2) {
        animPhase = 3;
        selectCity(TARGET_CITY_INFO);
      }
    }, 3400);
    setTimeout(() => {
      if (animPhase === 3) nextStep();
    }, 5200);

    function animate() {
      requestAnimationFrame(animate);

      // 3D 애니메이션 페이즈별 보간 (Smooth Lerp)
      if (!isDragging) {
        if (animPhase === 0) {
          globeGroup.rotation.y += 0.0035;
        } else if (animPhase === 1 || animPhase === 2 || animPhase === 3) {
          // 타겟 도시로 회전 각도 부드럽게 정지 (Lerp)
          globeGroup.rotation.y += (targetLngRad - globeGroup.rotation.y) * 0.04;
          globeGroup.rotation.x += (targetLatRad - globeGroup.rotation.x) * 0.04;
        }

        if (animPhase === 2 || animPhase === 3) {
          // 3D 줌인 (카메라 접근: 300 -> 145)
          camera.position.z += (145 - camera.position.z) * 0.05;
        }
      }

      const tempV = new THREE.Vector3();
      pickets.forEach((p) => {
        tempV.copy(p.meshPos);
        tempV.applyMatrix4(globeGroup.matrixWorld);
        if (tempV.z > -20) {
          tempV.project(camera);
          p.element.style.display = 'block';
          p.element.style.left = (tempV.x * 0.5 + 0.5) * window.innerWidth + 'px';
          p.element.style.top = (-(tempV.y * 0.5) + 0.5) * window.innerHeight + 'px';
          p.element.style.opacity = Math.max(0.35, Math.min(1.0, (tempV.z + 50) / 120));
          p.element.style.zIndex = Math.floor(tempV.z + 100);
        } else {
          p.element.style.display = 'none';
        }
      });
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>`;

    return (
      <View style={{ flex: 1, backgroundColor: "#070514" }}>
        <iframe
          srcDoc={webGlobeHtml}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            backgroundColor: "#070514",
          }}
          onMessage={(e: any) => {
            if (e?.data?.type === "NEXT_STEP") {
              navigation.replace("BTSMiniApp");
            }
          }}
        />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <View style={styles.bg} />

      {/* ⚠️ 수정금지(승인필요) — 상단 타이틀 (랜딩과 동일, 일관성) */}
      <View style={styles.hero}>
        <Text style={styles.tourLabel}>WORLD TOUR 2026</Text>
        <View style={styles.titleRow}>
          <Text style={styles.titleBTS}>BTS </Text>
          <Text style={styles.titleArirang}>'Arirang'</Text>
        </View>
      </View>

      {/* ⚠️ 수정금지(승인필요) — 도트맵 + 마커 (같은 부모 안) */}
      <Animated.View style={[styles.mapArea, mapStyle]}>
        {svgXml ? <SvgXml xml={svgXml} width={MAP_W} height={MAP_H} /> : null}

        {/* ⚠️ 수정금지(승인필요) — 공연 알림판 카드 (도시 좌표 위에 배치) */}
        <Animated.View
          style={[
            styles.cardAnchor,
            { left: targetX - 100, top: targetY - 70 },
            cardAnimStyle,
          ]}
        >
          <BlurView intensity={100} tint="light" style={styles.cardBlur}>
            <Animated.Text style={[styles.cardCity, t1]}>
              {targetCity}
            </Animated.Text>
            <Animated.View style={[styles.divider, t2]} />
            <Animated.Text style={[styles.cardDate, t2]}>
              {dateDisplay}
            </Animated.Text>
            <Animated.Text style={[styles.cardDDay, t3]}>
              {dDayText}
            </Animated.Text>
            {venue ? (
              <Animated.Text style={[styles.cardVenue, t4]}>
                {venue}
              </Animated.Text>
            ) : null}
          </BlurView>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF" },
  // ⚠️ 수정금지(승인필요) — 상단 타이틀 (랜딩과 동일 구조, 흰 배경용 색상)
  // ⚠️ 수정금지(승인필요) — 상단 타이틀 (중앙, 지도 위 여백 채움)
  // ⚠️ 수정금지(승인필요) — 타이틀을 지도 바로 위에 배치 (절대 위치)
  hero: {
    position: "absolute" as const,
    top: MAP_TOP - 110, // ⚠️ 수정금지(승인필요) — 지도 위 최소 여백
    left: 0,
    right: 0,
    alignItems: "center" as const,
    zIndex: 20,
  },
  tourLabel: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 8,
    color: "rgba(0,0,0,0.35)",
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
  },
  titleBTS: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    color: "#6C2DC7",
  },
  titleArirang: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    fontStyle: "italic" as const,
    color: "#6C2DC7",
  },
  mapArea: {
    position: "absolute",
    left: 0,
    top: MAP_TOP,
    width: MAP_W,
    height: MAP_H,
  },
  // ⚠️ 수정금지(승인필요) — 카드 앵커 (도시 좌표 위)
  cardAnchor: {
    position: "absolute",
    width: 200,
    height: 140,
    zIndex: 10,
  },
  // ⚠️ 수정금지(승인필요) — 3D 글래스 카드 (최대한 옅은 보라 + 입체)
  cardBlur: {
    flex: 1,
    borderRadius: 20,
    borderCurve: "continuous" as any, // ⚠️ 수정금지(승인필요) — iOS 스무스 코너 (RN 베스트프랙티스)
    // ⚠️ 수정금지(승인필요) — 흰색 글래스 배경 (보라 도트맵 위에서 돋보임)
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(108, 45, 199, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
    overflow: "hidden",
    // ⚠️ 수정금지(승인필요) — 3D 그림자 (RN 베스트프랙티스: boxShadow CSS 문법)
    boxShadow:
      "0 12px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(108, 45, 199, 0.3)" as any,
  },
  divider: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(108, 45, 199, 0.3)",
    marginVertical: 3,
  },
  // ⚠️ 수정금지(승인필요) — 카드 텍스트 (흰 배경 + 보라 텍스트)
  cardCity: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    color: "#1A1A1A",
    letterSpacing: 2,
  },
  cardDate: {
    fontSize: 6,
    fontFamily: "Pretendard-Bold",
    color: "rgba(0,0,0,0.6)",
    letterSpacing: 0.5,
  },
  cardDDay: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    color: "#6C2DC7",
  },
  cardVenue: {
    fontSize: 5,
    fontFamily: "Pretendard-Bold",
    color: "rgba(0,0,0,0.5)",
    marginTop: 2,
  },
});
