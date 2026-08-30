import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Platform } from "react-native";
import { apiRequest } from "@/lib/query-client";
// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 마커 title(호버용) 다국어 = HTML 템플릿과 같은 싱글턴 재사용(§16).
import i18n from "@/lib/i18n";
import {
  ITINERARY_MAP_HTML,
  type ItinMapPlace,
  type ItinMapStart,
} from "./itinerary-map-html";
import {
  COLORS as SSOT_COLORS,
  LUCIDE as SSOT_LUCIDE,
} from "./bts/bts-marker-svg";

type Props = {
  places: ItinMapPlace[];
  start: ItinMapStart | null;
  onMarkerPress: (id: string) => void;
  selectedSlotId?: string | null;
  height?: number;
  tint?: string;
  // ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 지도 배경(구글 SDK 자체 도로명·지명) 다국어 대응.
  language?: string;
};

let sdkPromise: Promise<any> | null = null;
function loadGoogleMaps(apiKey: string, language: string): Promise<any> {
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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${cb}&v=quarterly&language=${language}`;
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

function ItineraryMapWeb({
  places,
  start,
  onMarkerPress,
  selectedSlotId,
  height = 240,
  tint = "#2563eb",
  apiKey,
  language = "ko",
}: Props & { apiKey: string }) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const prevSelectedRef = useRef<string | null>(null);
  const markerMetaRef = useRef<
    Record<string, { cat: string; slot: number | null }>
  >({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapDivRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey, language)
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
    // ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = language 는 deps 에서 의도적으로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const google = (window as any).google;
    if (!google) return;

    if (startMarkerRef.current) {
      startMarkerRef.current.setMap(null);
      startMarkerRef.current = null;
    }
    if (start && start.lat != null && start.lng != null) {
      startMarkerRef.current = new google.maps.Marker({
        position: { lat: Number(start.lat), lng: Number(start.lng) },
        map: mapRef.current,
        icon: makeWebIcon(google, "start", true, null),
        title: start.label || i18n.t("trip.departure"),
        zIndex: 999,
      });
    }

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

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const google = (window as any).google;
    if (!google) return;
    const prevId = prevSelectedRef.current;
    if (prevId && prevId !== selectedSlotId && markersRef.current[prevId]) {
      const meta = markerMetaRef.current[prevId];
      if (meta)
        markersRef.current[prevId].setIcon(
          makeWebIcon(google, meta.cat, false, meta.slot, false),
        );
    }
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

function ItineraryMapNative({
  places,
  start,
  onMarkerPress,
  selectedSlotId,
  height = 240,
  tint = "#2563eb",
  apiKey,
  language = "ko",
}: Props & { apiKey: string }) {
  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");
  const webRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const html = useMemo(
    () => (apiKey ? ITINERARY_MAP_HTML(apiKey, language) : ""),
    [apiKey, language],
  );

  useEffect(() => {
    if (!mapReady) return;
    const payload = { places, start };
    webRef.current?.injectJavaScript(
      `window.syncItinerary(${JSON.stringify(payload)}); true;`,
    );
  }, [mapReady, places, start]);

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
        key={`${apiKey}-${language}`}
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

export default function ItineraryMap(props: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
