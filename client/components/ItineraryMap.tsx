// 2026-06-28 = 여정 결과화면 지도 고정섹션 (BTSPlaceMap 패턴 일반화 = 웹 div+SDK / 앱 WebView+SDK)
// = 전 슬롯 마커 항상 표시 + 마커 클릭 → onMarkerPress(슬롯 스크롤) + 출발 깃발(도시중심/숙소)
// = 동선 polyline 폐기(사용자 SSOT) / 웹·앱 동일 / API키 = /api/bts/map-config 재사용
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Platform } from "react-native";
import { apiRequest } from "@/lib/query-client";
import {
  ITINERARY_MAP_HTML,
  type ItinMapPlace,
  type ItinMapStart,
} from "./itinerary-map-html";
// 마커 색/아이콘 단일 SSOT (= 카드 placeholder 와 동일) — start·culture 만 보강
import {
  COLORS as SSOT_COLORS,
  LUCIDE as SSOT_LUCIDE,
} from "./bts/bts-marker-svg";

type Props = {
  places: ItinMapPlace[];
  start: ItinMapStart | null;
  onMarkerPress: (id: string) => void;
  // 🗺️ 2026-06-28 = 슬롯 본문 터치 → 그 마커 포커스(panTo+확대+강조) = 양방향 연동
  selectedSlotId?: string | null;
  height?: number;
  tint?: string;
};

// SDK 로드 = 페이지당 1 회 (= 모듈 레벨 promise, 웹)
let sdkPromise: Promise<any> | null = null;
function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const cb = `__itinMapInit_${Date.now()}`;
    (w as any)[cb] = () => {
      try {
        delete (w as any)[cb];
      } catch {}
      resolve(w.google);
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${cb}&v=quarterly`;
    s.async = true;
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Google Maps SDK load failed"));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f8f7fb" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#e9e6f0" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#cfe8ff" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#dcfce7" }],
  },
];

// ⚠️ 2026-06-28 = 마커 색/아이콘 = bts-marker-svg.ts(SSOT) 재사용 (= 카드 placeholder ↔ 지도 마커 시각 일치, §16 재발명X).
//   start(깃발)·culture 는 SSOT 미정의라 여기서 보강. HTML 템플릿(itinerary-map-html)도 같은 값 인라인(import 불가).
const COLORS: Record<string, string> = {
  ...SSOT_COLORS,
  start: "#2563eb",
  culture: SSOT_COLORS.heritage,
};
const LUCIDE: Record<string, string> = {
  ...SSOT_LUCIDE,
  start:
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  culture: SSOT_LUCIDE.heritage,
};

function makeWebIcon(
  google: any,
  cat: string,
  isStart: boolean,
  slot: number | null,
  isSelected = false,
) {
  const color = COLORS[cat] || "#666";
  const path = LUCIDE[cat] || '<circle cx="12" cy="12" r="6"/>';
  // 🗺️ 2026-06-28 = 선택된 슬롯 마커 = 크게(확대 강조)
  const size = isStart ? 50 : isSelected ? 54 : 40;
  const iconSize = isStart ? 26 : isSelected ? 28 : 20;
  const off = (size - iconSize) / 2;
  const sc = iconSize / 24;
  let badge = "";
  if (!isStart && slot) {
    badge =
      '<g transform="translate(' +
      (size - 9) +
      ',9)"><circle r="8" fill="white" stroke="' +
      color +
      '" stroke-width="1.5"/><text x="0" y="3" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="' +
      color +
      '">' +
      slot +
      "</text></g>";
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 ' +
    size +
    " " +
    size +
    '">' +
    '<circle cx="' +
    size / 2 +
    '" cy="' +
    size / 2 +
    '" r="' +
    (size / 2 - 2) +
    '" fill="' +
    color +
    '" stroke="white" stroke-width="3"/>' +
    '<g transform="translate(' +
    off +
    "," +
    off +
    ") scale(" +
    sc +
    ')" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    path +
    "</g>" +
    badge +
    "</svg>";
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

// ============================================================
// Web 분기 = 직접 div + Google Maps SDK
// ============================================================
function ItineraryMapWeb({
  places,
  start,
  onMarkerPress,
  selectedSlotId,
  height = 240,
  tint = "#2563eb",
  apiKey,
}: Props & { apiKey: string }) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  // 🗺️ 2026-06-28 = 이전 선택 마커 id (= 선택 해제 시 기본 아이콘 복원용)
  const prevSelectedRef = useRef<string | null>(null);
  // 마커별 메타(cat·slot) 보관 = 선택/해제 시 makeWebIcon 재계산 (= 마커 재생성 없이 setIcon)
  const markerMetaRef = useRef<
    Record<string, { cat: string; slot: number | null }>
  >({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapDivRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !mapDivRef.current) return;
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center: { lat: 48.85, lng: 2.35 },
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: MAP_STYLES,
        });
        setMapReady(true);
      })
      .catch((e) => console.warn("[ItineraryMap-web] SDK load failed:", e));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // 출발 깃발 + 전 슬롯 마커 동기화
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const google = (window as any).google;
    if (!google) return;

    // 출발 깃발
    if (startMarkerRef.current) {
      startMarkerRef.current.setMap(null);
      startMarkerRef.current = null;
    }
    if (start && start.lat != null && start.lng != null) {
      startMarkerRef.current = new google.maps.Marker({
        position: { lat: Number(start.lat), lng: Number(start.lng) },
        map: mapRef.current,
        icon: makeWebIcon(google, "start", true, null),
        title: start.label || "출발",
        zIndex: 999,
      });
    }

    // 슬롯 마커 = 전부 제거 후 재생성
    for (const id of Object.keys(markersRef.current)) {
      markersRef.current[id]?.setMap(null);
      delete markersRef.current[id];
    }
    markerMetaRef.current = {};
    for (const p of places) {
      if (p.lat == null || p.lng == null) continue;
      const cat = p.seedCategory || "attraction";
      const m = new google.maps.Marker({
        position: { lat: Number(p.lat), lng: Number(p.lng) },
        map: mapRef.current,
        icon: makeWebIcon(google, cat, false, p.slot),
        title: p.name || "",
      });
      m.addListener("click", () => onMarkerPress(p.id));
      markersRef.current[p.id] = m;
      markerMetaRef.current[p.id] = { cat, slot: p.slot };
    }

    // fitBounds
    const b = new google.maps.LatLngBounds();
    let count = 0;
    if (startMarkerRef.current) {
      b.extend(startMarkerRef.current.getPosition());
      count++;
    }
    for (const id of Object.keys(markersRef.current)) {
      b.extend(markersRef.current[id].getPosition());
      count++;
    }
    if (count === 1) {
      mapRef.current.setCenter(b.getCenter());
      mapRef.current.setZoom(13);
    } else if (count > 1) {
      mapRef.current.fitBounds(b, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [mapReady, places, start, onMarkerPress]);

  // 🗺️ 2026-06-28 = 선택 슬롯 강조 전담(마커 재생성 분리 = 깜빡임 방지): 이전선택 복원 → 새선택 panTo+확대+setIcon
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const google = (window as any).google;
    if (!google) return;
    // 이전 선택 마커 = 기본 아이콘 복원
    const prevId = prevSelectedRef.current;
    if (prevId && prevId !== selectedSlotId && markersRef.current[prevId]) {
      const meta = markerMetaRef.current[prevId];
      if (meta)
        markersRef.current[prevId].setIcon(
          makeWebIcon(google, meta.cat, false, meta.slot, false),
        );
    }
    // 새 선택 마커 = 강조 아이콘 + panTo + 확대
    if (selectedSlotId && markersRef.current[selectedSlotId]) {
      const meta = markerMetaRef.current[selectedSlotId];
      const m = markersRef.current[selectedSlotId];
      if (meta)
        m.setIcon(makeWebIcon(google, meta.cat, false, meta.slot, true));
      mapRef.current.panTo(m.getPosition());
      if (mapRef.current.getZoom() < 14) mapRef.current.setZoom(15);
    }
    prevSelectedRef.current = selectedSlotId ?? null;
  }, [mapReady, selectedSlotId]);

  return (
    <View style={[styles.container, { height }]}>
      <View ref={mapDivRef as any} style={{ width: "100%", height: "100%" }} />
      {!mapReady && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={tint} />
        </View>
      )}
    </View>
  );
}

// ============================================================
// Native 분기 = react-native-webview
// ============================================================
function ItineraryMapNative({
  places,
  start,
  onMarkerPress,
  selectedSlotId,
  height = 240,
  tint = "#2563eb",
  apiKey,
}: Props & { apiKey: string }) {
  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");
  const webRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const html = useMemo(
    () => (apiKey ? ITINERARY_MAP_HTML(apiKey) : ""),
    [apiKey],
  );

  useEffect(() => {
    if (!mapReady) return;
    const payload = { places, start };
    webRef.current?.injectJavaScript(
      `window.syncItinerary(${JSON.stringify(payload)}); true;`,
    );
  }, [mapReady, places, start]);

  // 🗺️ 2026-06-28 = 슬롯 본문 터치 → 그 마커 포커스(panTo+확대+강조) = WebView window.focusSlot 호출
  useEffect(() => {
    if (!mapReady) return;
    webRef.current?.injectJavaScript(
      `window.focusSlot(${JSON.stringify(selectedSlotId ?? null)}); true;`,
    );
  }, [mapReady, selectedSlotId]);

  function onMessage(e: any) {
    try {
      const data = JSON.parse(e.nativeEvent.data || "{}");
      if (data.type === "ready") setMapReady(true);
      else if (data.type === "marker" && typeof data.id === "string")
        onMarkerPress(data.id);
      else if (data.type === "error")
        console.warn("[ItineraryMap] WebView error:", data.message);
    } catch {}
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webRef}
        key={apiKey}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://maps.googleapis.com/" }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        onMessage={onMessage}
        mixedContentMode={Platform.OS === "android" ? "always" : undefined}
        setSupportMultipleWindows={false}
        style={styles.webview}
      />
      {!mapReady && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={tint} />
        </View>
      )}
    </View>
  );
}

// ============================================================
// 메인 export = API키 fetch(/api/bts/map-config 재사용) + 플랫폼 분기
// ============================================================
export default function ItineraryMap(props: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 🗺️ 2026-06-29 = map-config fetch 재시도(backoff). 아이폰 첫 로드 시 서버가 아직 응답 준비 전이라 fetch가
    //   일시 실패(transient) → 옛: catch에서 setApiKey 안 함 → apiKey 영구 null → 무한 스피너. 재시도로 해소(새로고침하면 정상이던 증상).
    //   응답 = { googleMapsApiKey } (BTSPlaceCart 정합). data.key(X) = 영구 null 버그.
    (async () => {
      const delays = [0, 800, 1600, 3200, 5000]; // 콜드스타트 503은 수 초 내 200 전환
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
        try {
          const res = await apiRequest("GET", "/api/bts/map-config");
          const data = await res.json();
          if (cancelled) return;
          if (data.googleMapsApiKey) {
            setApiKey(data.googleMapsApiKey);
            return;
          }
        } catch (e) {
          console.warn(
            `[ItineraryMap] map-config fetch 실패(시도 ${i + 1}/${delays.length}):`,
            e,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!apiKey) {
    return (
      <View style={[styles.container, { height: props.height || 240 }]}>
        <ActivityIndicator size="small" color={props.tint || "#2563eb"} />
      </View>
    );
  }

  if (Platform.OS === "web")
    return <ItineraryMapWeb {...props} apiKey={apiKey} />;
  return <ItineraryMapNative {...props} apiKey={apiKey} />;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#f8f7fb",
    borderRadius: 14,
    overflow: "hidden",
  },
  webview: { flex: 1, backgroundColor: "transparent" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
