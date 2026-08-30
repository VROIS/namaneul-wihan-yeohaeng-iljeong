import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  Platform,
  TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/query-client";
import {
  PLACE_AUTOCOMPLETE_HTML,
  type PlaceAutoSelection,
} from "./place-autocomplete-html";

export type { PlaceAutoSelection };

type Props = {
  onSelect: (place: PlaceAutoSelection) => void;
  includedPrimaryTypes?: string;
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
          includedPrimaryTypes
            ? { includedPrimaryTypes: [includedPrimaryTypes] }
            : {},
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
        ac.addEventListener("gmp-select", async (ev: any) => {
          try {
            const pred = ev.placePrediction;
            const place = pred.toPlace();
            await place.fetchFields({
              fields: ["displayName", "formattedAddress", "location"],
            });
            const loc = place.location;
            onSelectRef.current({
              placeId: place.id || pred.placeId || "",
              name: place.displayName || "",
              address: place.formattedAddress || "",
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
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [localInput, setLocalInput] = useState<string>("");
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const delays = [0, 500, 1000];
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
        } catch (e) {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!apiKey) {
    return (
      <View
        style={[
          styles.container,
          {
            minHeight: props.height || 48,
            backgroundColor: "#F8FAFC",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          },
        ]}
      >
        <TextInput
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: "Pretendard-Medium",
            color: "#0F172A",
            paddingVertical: 8,
          }}
          value={localInput}
          onChangeText={(text) => {
            setLocalInput(text);
            props.onSelect({
              placeId: "manual_" + Date.now(),
              name: text,
              address: text,
            });
          }}
          placeholder={
            props.placeholder || t("place.hotelCitySearchPlaceholderFallback")
          }
          placeholderTextColor="#94A3B8"
        />
      </View>
    );
  }

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
