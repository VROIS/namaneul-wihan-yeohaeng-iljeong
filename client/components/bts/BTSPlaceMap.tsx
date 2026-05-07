// ⚠️ 수정금지(승인필요) — 2026-05-06 BTS Screen 4 카트 캐러셀 → 인앱 지도 (Web 직접 div + Native WebView)
// 사용자 SSOT: docs/BTS_MASTERPLAN_v3.md Step 4
// HERO 궤도 + 상세 섹션 = 절대 유지. 이 컴포넌트 = 카트 자리만 채움.
// venue 마커 = 항상 표시 + 첫 카드 떼면 "BTS" 라벨 활성 (= 사용자 명시)
// web 환경 = iframe X (= about:srcdoc/blob 둘 다 Google Maps tile 거부) → div + window.google 직접
// native 환경 = react-native-webview
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Platform } from "react-native";
import { BTS_MAP_HTML, type BTSMapPlace } from "./bts-map-html";
import type { BTSPlace } from "@/contexts/BTSContext";

type Props = {
  places: BTSPlace[];        // top-places 응답 8 슬롯 (= venue + vibe5 + 식사2)
  selectedIds: number[];     // 카트에 담긴 카드 id (= 마커 등장 트리거)
  venueId: number | null;    // slot 1 = bts_venue id (= 항상 표시)
  apiKey: string | null;     // /api/bts/map-config 에서 fetch
  onMarkerPress: (id: number) => void;
  height?: number;           // 단계 3 사용자 시각 검수로 확정 (초기 = 240)
  tint?: string;
};

function toMapPlace(p: BTSPlace): BTSMapPlace {
  return {
    id: p.id,
    nameEn: p.nameEn,
    nameKo: p.nameKo,
    seedCategory: p.seedCategory,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
  };
}

// ============================================================
// QA HTML 클론 = 색상 + lucide SVG 패스 (= 사용자 명시: lucide 마커 그대로)
// ============================================================
const COLORS: Record<string, string> = {
  bts_venue: "#9333ea",
  heritage: "#92400e",
  hotspot: "#eab308",
  attraction: "#f97316",
  adventure: "#dc2626",
  healing: "#16a34a",
  shopping: "#ec4899",
  restaurant: "#0891b2",
};

const LUCIDE: Record<string, string> = {
  bts_venue:
    '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  heritage:
    '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  hotspot:
    '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  attraction:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  adventure: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  healing:
    '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
  shopping:
    '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  restaurant:
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
};

function makeIcon(google: any, cat: string, isVenue: boolean, isActive: boolean) {
  const color = COLORS[cat] || "#666";
  const path = LUCIDE[cat] || '<circle cx="12" cy="12" r="6"/>';
  const size = isVenue ? 56 : 40;
  const iconSize = isVenue ? 28 : 20;
  const off = (size - iconSize) / 2;
  const sc = iconSize / 24;
  let label = "";
  if (isVenue && isActive) {
    label =
      '<g transform="translate(' +
      size / 2 +
      "," +
      (size - 8) +
      ')"><rect x="-13" y="-7" width="26" height="13" rx="3" fill="white" stroke="' +
      color +
      '" stroke-width="1.5"/><text x="0" y="3" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="' +
      color +
      '">BTS</text></g>';
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
    '"><circle cx="' +
    size / 2 +
    '" cy="' +
    size / 2 +
    '" r="' +
    (size / 2 - 2) +
    '" fill="' +
    color +
    '" stroke="white" stroke-width="3"/><g transform="translate(' +
    off +
    "," +
    off +
    ") scale(" +
    sc +
    ')" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    path +
    "</g>" +
    label +
    "</svg>";
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f8f7fb" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#e9e6f0" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9d5ff" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcfce7" }] },
];

// Google Maps SDK 로드 = 페이지당 1 회 (= 모듈 레벨 promise)
let sdkPromise: Promise<any> | null = null;
function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("ssr");
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const cb = `__btsMapInit_${Date.now()}`;
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

// ============================================================
// Web 분기 = 직접 div + Google Maps SDK (= iframe 미사용)
// ============================================================
function BTSPlaceMapWeb({
  selectedIds,
  apiKey,
  onMarkerPress,
  height = 240,
  tint = "#9333ea",
  mapPlaces: validPlaces,
  mapVenue: venue,
  venueId,
}: InternalProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const venueMarkerRef = useRef<any>(null);
  const markersRef = useRef<Record<number, any>>({});
  const obsRef = useRef<{ io?: IntersectionObserver; ro?: ResizeObserver }>({});
  const [mapReady, setMapReady] = useState(false);

  // SDK 로드 + map 인스턴스 생성 (= apiKey 변경 시 재생성)
  // ⚠️ 수정금지(승인필요) — 2026-05-06: ScrollView 안 mapSection 이 viewport 밖일 때 = init 시 container 0x0 = tile load X.
  // → IntersectionObserver 으로 visible 진입 시 = google.maps.event.trigger(map, 'resize') 호출.
  useEffect(() => {
    if (!apiKey || !mapDivRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey).then((google) => {
      if (cancelled || !mapDivRef.current) return;
      mapRef.current = new google.maps.Map(mapDivRef.current, {
        center: { lat: 19.4049, lng: -99.0959 },
        zoom: 11,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        styles: MAP_STYLES,
      });
      setMapReady(true);

      // viewport 진입 시 1 회 trigger resize → 그 후 disconnect (= 중복 발화 방지)
      try {
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting && mapRef.current) {
              google.maps.event.trigger(mapRef.current, "resize");
              io.disconnect();
              obsRef.current.io = undefined;
              break;
            }
          }
        }, { threshold: 0.1 });
        io.observe(mapDivRef.current as any);
        obsRef.current.io = io;
        // ResizeObserver = container size 변경 (rAF 으로 debounce)
        let raf = 0;
        const ro = new ResizeObserver(() => {
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            if (mapRef.current) google.maps.event.trigger(mapRef.current, "resize");
          });
        });
        ro.observe(mapDivRef.current as any);
        obsRef.current.ro = ro;
      } catch {}
    }).catch((e) => console.warn("[BTSPlaceMap-web] SDK load failed:", e));
    return () => {
      cancelled = true;
      obsRef.current.io?.disconnect();
      obsRef.current.ro?.disconnect();
      obsRef.current = {};
    };
  }, [apiKey]);

  // venue 마커 렌더 = 항상 표시. active = selectedIds.length >= 1 = "BTS" 라벨
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const w = window as any;
    const google = w.google;
    if (!google) return;
    if (venueMarkerRef.current) {
      venueMarkerRef.current.setMap(null);
      venueMarkerRef.current = null;
    }
    if (venue && venue.latitude != null && venue.longitude != null) {
      const isActive = selectedIds.length >= 1;
      const m = new google.maps.Marker({
        position: { lat: Number(venue.latitude), lng: Number(venue.longitude) },
        map: mapRef.current,
        icon: makeIcon(google, venue.seedCategory || "bts_venue", true, isActive),
        title: venue.nameEn || "",
        zIndex: 999,
      });
      m.addListener("click", () => onMarkerPress(venue.id));
      venueMarkerRef.current = m;
    }
  }, [mapReady, venue, selectedIds.length, onMarkerPress]);

  // 일반 마커 동기화 (= 카트에 담긴 카드 id 만 마커 노출)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const w = window as any;
    const google = w.google;
    if (!google) return;
    const want = new Set(selectedIds);
    const placesById: Record<number, BTSMapPlace> = {};
    for (const p of validPlaces) placesById[p.id] = p;
    // 제거
    for (const idStr of Object.keys(markersRef.current)) {
      const id = Number(idStr);
      if (!want.has(id)) {
        markersRef.current[id]?.setMap(null);
        delete markersRef.current[id];
      }
    }
    // 추가
    for (const id of selectedIds) {
      if (markersRef.current[id]) continue;
      const p = placesById[id];
      if (!p || p.latitude == null || p.longitude == null) continue;
      // venue = 별도 처리 = 일반 마커 X
      if (venue && p.id === venue.id) continue;
      const m = new google.maps.Marker({
        position: { lat: Number(p.latitude), lng: Number(p.longitude) },
        map: mapRef.current,
        icon: makeIcon(google, p.seedCategory || "attraction", false, false),
        title: p.nameEn || "",
      });
      m.addListener("click", () => onMarkerPress(p.id));
      markersRef.current[id] = m;
    }
    // fitBounds = venue + 마커들
    const ks = Object.keys(markersRef.current);
    let count = 0;
    const b = new google.maps.LatLngBounds();
    if (venueMarkerRef.current) {
      b.extend(venueMarkerRef.current.getPosition());
      count++;
    }
    for (const k of ks) {
      b.extend(markersRef.current[Number(k)].getPosition());
      count++;
    }
    if (count === 0) return;
    if (count === 1) {
      mapRef.current.setCenter(b.getCenter());
      mapRef.current.setZoom(13);
    } else {
      mapRef.current.fitBounds(b, { top: 60, right: 60, bottom: 60, left: 60 });
    }
  }, [mapReady, validPlaces, venue, selectedIds, onMarkerPress]);

  // 도시 변경 (= venue 자체 변경) 시 = 모든 일반 마커 reset
  useEffect(() => {
    return () => {
      for (const idStr of Object.keys(markersRef.current)) {
        markersRef.current[Number(idStr)]?.setMap(null);
      }
      markersRef.current = {};
    };
  }, [venueId]);

  if (!apiKey) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator size="small" color={tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <View
        ref={mapDivRef as any}
        style={{ width: "100%", height: "100%" }}
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
// Native 분기 = react-native-webview
// ============================================================
function BTSPlaceMapNative(props: InternalProps) {
  const { WebView } = require("react-native-webview") as typeof import("react-native-webview");
  const {
    selectedIds,
    apiKey,
    onMarkerPress,
    height = 240,
    tint = "#9333ea",
    mapPlaces: validPlaces,
    mapVenue: venue,
  } = props;

  const webRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const html = useMemo(() => (apiKey ? BTS_MAP_HTML(apiKey) : ""), [apiKey]);

  // ⚠️ syncPlaces 가 syncMarkers 내장 호출 = 중복 inject 방지 위해 단일 effect.
  useEffect(() => {
    if (!mapReady) return;
    const payload = { places: validPlaces, venue, selectedIds };
    webRef.current?.injectJavaScript(
      `window.syncPlaces(${JSON.stringify(payload)}); true;`
    );
  }, [mapReady, validPlaces, venue, selectedIds]);

  function onMessage(e: any) {
    try {
      const data = JSON.parse(e.nativeEvent.data || "{}");
      if (data.type === "ready") setMapReady(true);
      else if (data.type === "marker" && typeof data.id === "number") onMarkerPress(data.id);
      else if (data.type === "error") console.warn("[BTSPlaceMap] WebView error:", data.message);
    } catch {}
  }

  if (!apiKey) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator size="small" color={tint} />
      </View>
    );
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
        allowsInlineMediaPlayback
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
// 메인 export = 플랫폼 분기 + validPlaces/venue 1 회 계산 (web/native 중복 제거)
// ============================================================
type InternalProps = Props & {
  mapPlaces: BTSMapPlace[];
  mapVenue: BTSMapPlace | null;
};

export default function BTSPlaceMap(props: Props) {
  const mapPlaces = useMemo(
    () => props.places.filter((p) => p.latitude != null && p.longitude != null).map(toMapPlace),
    [props.places]
  );
  const mapVenue = useMemo<BTSMapPlace | null>(() => {
    if (props.venueId == null) return null;
    const v = props.places.find((p) => p.id === props.venueId);
    return v && v.latitude != null && v.longitude != null ? toMapPlace(v) : null;
  }, [props.venueId, props.places]);

  const internal: InternalProps = { ...props, mapPlaces, mapVenue };
  if (Platform.OS === "web") return <BTSPlaceMapWeb {...internal} />;
  return <BTSPlaceMapNative {...internal} />;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#f8f7fb",
    borderRadius: 14,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
