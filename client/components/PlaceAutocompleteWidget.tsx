import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Platform } from "react-native";
import { useGoogleMapsKey } from "@/lib/useGoogleMapsKey";
import {
  PLACE_AUTOCOMPLETE_HTML,
  type PlaceAutoSelection,
} from "./place-autocomplete-html";

export type { PlaceAutoSelection };

// ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 여정 목적지 검색 = 도시·숙소·주소·건물·역 5종만 보인다 = 나라·도(道)·지역은 목록에 안 나옴 (정본 §2026-10-27)
export const CITY_LEVEL_TYPES = [
  "locality",
  "lodging",
  "street_address",
  "premise",
  "transit_station",
];

type Props = {
  onSelect: (place: PlaceAutoSelection) => void;
  includedPrimaryTypes?: string[];
  cityPrefix?: string;
  placeholder?: string;
  language?: string;
  height?: number; // WebView 높이 (= 입력 + 드롭다운 펼침 공간)
  tint?: string;
};

function PlaceAutocompleteWeb({
  onSelect,
  includedPrimaryTypes,
  cityPrefix,
  placeholder,
  language = "ko",
  height = 56,
  tint = "#2563eb",
  apiKey,
}: Props & { apiKey: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (typeof window === "undefined" || !hostRef.current) return;
    let cancelled = false;
    const host = hostRef.current;

    function loadSdk(): Promise<any> {
      const w = window as any;
      if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
      if (w.__placeSdkPromise) return w.__placeSdkPromise;
      w.__placeSdkPromise = new Promise((resolve, reject) => {
        const cb = `__placeInit_${Date.now()}`;
        (w as any)[cb] = () => {
          try {
            delete (w as any)[cb];
          } catch {}
          resolve(w.google);
        };
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&language=${language}&libraries=places&callback=${cb}`;
        s.async = true;
        s.onerror = () => {
          w.__placeSdkPromise = null;
          reject(new Error("Places SDK load failed"));
        };
        document.body.appendChild(s);
      });
      return w.__placeSdkPromise;
    }

    loadSdk()
      .then(async (google) => {
        if (cancelled || !host) return;
        const { PlaceAutocompleteElement } =
          await google.maps.importLibrary("places");
        const ac = new PlaceAutocompleteElement(
          includedPrimaryTypes?.length ? { includedPrimaryTypes } : {},
        );
        try {
          if (placeholder) (ac as any).placeholder = placeholder;
        } catch {}
        if (cityPrefix) {
          try {
            (ac as any).value = cityPrefix;
          } catch {}
        }
        (ac as any).style.width = "100%";
        host.innerHTML = "";
        host.appendChild(ac);
        // ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 위젯이 구글 종류·주소 조각(나라 포함)을 받아 서버로 보낸다 = 나라 코드 한 벌 · 같은 나라 거점 우선 · 서버가 도시를 잘라 낸다 (정본 §2026-10-27)
        ac.addEventListener("gmp-select", async (ev: any) => {
          try {
            const pred = ev.placePrediction;
            const place = pred.toPlace();
            await place.fetchFields({
              fields: [
                "displayName",
                "formattedAddress",
                "location",
                "addressComponents",
                "types",
              ],
            });
            const loc = place.location;
            onSelectRef.current({
              placeId: place.id || pred.placeId || "",
              name: place.displayName || "",
              address: place.formattedAddress || "",
              types: place.types || [],
              components: (place.addressComponents || []).map((c: any) => ({
                longText: c.longText,
                shortText: c.shortText,
                types: c.types || [],
              })),
              coords: {
                lat: typeof loc.lat === "function" ? loc.lat() : loc.lat,
                lng: typeof loc.lng === "function" ? loc.lng() : loc.lng,
              },
            });
          } catch (e) {
            console.warn("[PlaceAutocompleteWidget-web] fetchFields 실패:", e);
          }
        });
        setReady(true);
      })
      .catch((e) => console.warn("[PlaceAutocompleteWidget-web] SDK 실패:", e));

    return () => {
      cancelled = true;
    };
  }, [apiKey, includedPrimaryTypes, cityPrefix, placeholder, language]);

  return (
    <View style={[styles.container, { minHeight: height }]}>
      <View ref={hostRef as any} style={{ width: "100%" }} />
      {!ready && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={tint} />
        </View>
      )}
    </View>
  );
}

function PlaceAutocompleteNative({
  onSelect,
  includedPrimaryTypes,
  cityPrefix,
  placeholder,
  language = "ko",
  height,
  tint = "#2563eb",
  apiKey,
}: Props & { apiKey: string }) {
  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");
  const [ready, setReady] = useState(false);
  const [webHeight, setWebHeight] = useState(56);
  // ⌨️ 2026-08-13 사장님 지시("딱 위젯 핸들러만") = 안드로이드 크기반영 지연 핸들러.
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyHeight = (h: number) => {
    if (Platform.OS === "android") {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => setWebHeight(h), 350);
      return;
    }
    setWebHeight(h);
  };
  useEffect(() => {
    return () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, []);
  const html = useMemo(
    () =>
      PLACE_AUTOCOMPLETE_HTML({
        apiKey,
        includedPrimaryTypes,
        cityPrefix,
        placeholder,
        language,
      }),
    [apiKey, includedPrimaryTypes, cityPrefix, placeholder, language],
  );

  function onMessage(e: any) {
    try {
      const data = JSON.parse(e.nativeEvent.data || "{}");
      if (data.type === "ready") setReady(true);
      else if (data.type === "resize" && typeof data.height === "number") {
        applyHeight(Math.max(48, Math.min(340, Math.ceil(data.height))));
      } else if (data.type === "select") {
        onSelect({
          placeId: data.placeId,
          name: data.name,
          address: data.address,
          types: data.types,
          components: data.components,
          coords: data.coords,
        });
      } else if (data.type === "error")
        console.warn("[PlaceAutocompleteWidget] WebView error:", data.message);
    } catch {}
  }

  return (
    <View style={[styles.container, { height: height ?? webHeight }]}>
      <WebView
        key={apiKey}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://maps.googleapis.com/" }}
        javaScriptEnabled
        domStorageEnabled
        keyboardDisplayRequiresUserAction={false}
        onMessage={onMessage}
        mixedContentMode={Platform.OS === "android" ? "always" : undefined}
        setSupportMultipleWindows={false}
        style={styles.webview}
      />
      {!ready && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={tint} />
        </View>
      )}
    </View>
  );
}

export default function PlaceAutocompleteWidget(props: Props) {
  const apiKey = useGoogleMapsKey([0, 500, 1000]);

  if (!apiKey)
    return (
      <View style={[styles.container, { minHeight: props.height || 48 }]} />
    );

  if (Platform.OS === "web")
    return <PlaceAutocompleteWeb {...props} apiKey={apiKey} />;
  return <PlaceAutocompleteNative {...props} apiKey={apiKey} />;
}

const styles = StyleSheet.create({
  container: { width: "100%", justifyContent: "center" },
  webview: { flex: 1, backgroundColor: "transparent" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
