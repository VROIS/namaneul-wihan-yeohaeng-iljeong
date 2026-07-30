// 2026-06-29 = 구글 공식 장소 자동완성 위젯(PlaceAutocompleteElement) = WebView 래퍼
// = 자체 입력창+드롭다운+프록시 재발명 폐기(§16·§19) → 구글 위젯 100% 활용 (사장님 SSOT)
//   웹 = div+SDK 직접 / 앱 = react-native-webview. ItineraryMap 패턴 동일. API키 = /api/bts/map-config.
//   선택 → onSelect(name·address·coords) → 호출측이 handleSetDayAccommodation 등으로 전달 → 지도 깃발 자동.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  Platform,
  TextInput,
} from "react-native";
import { apiRequest } from "@/lib/query-client";
import {
  PLACE_AUTOCOMPLETE_HTML,
  type PlaceAutoSelection,
} from "./place-autocomplete-html";

export type { PlaceAutoSelection };

type Props = {
  onSelect: (place: PlaceAutoSelection) => void;
  // 🏨 2026-06-29 = 미지정 기본 = 호텔+주소 전부 검색. (특정 타입만 원하면 지정, 숙소검색은 미지정이 정답=호텔+에어비앤비주소)
  includedPrimaryTypes?: string;
  // 🏨 2026-06-29 사용자 SSOT(구글맵 실증) = 입력칸에 도시명 prefill(예 "Paris ") → 사용자가 뒤에 숙소명 = "Paris 노보텔" = 그 도시만. (좌표 불필요)
  cityPrefix?: string;
  placeholder?: string;
  language?: string;
  height?: number; // WebView 높이 (= 입력 + 드롭다운 펼침 공간)
  tint?: string;
};

// ============================================================
// Web 분기 = div + Google Maps SDK 직접 (PlaceAutocompleteElement)
// ============================================================
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
  // onSelect = 최신 콜백 ref 보관 (= 부모 인라인 콜백이라도 위젯 재생성 안 함 = 입력중 초기화 방지, review MAJOR)
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
        // 🏨 도시명 prefill = "Paris " → 사용자가 뒤에 숙소명 = "Paris 노보텔" = 그 도시만 (구글맵 방식)
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

// ============================================================
// Native 분기 = react-native-webview
// ============================================================
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
  // 🏨 2026-06-29 = WebView 동적높이 (= 고정 280px 빈공간 결함 해소): 위젯이 resize로 알려준 높이만큼만 차지.
  const [webHeight, setWebHeight] = useState(56);
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
        // 입력칸(작게) ↔ 드롭다운 펼침(크게) = 컨텐츠만큼만 (빈공간 제거)
        setWebHeight(Math.max(48, Math.min(340, Math.ceil(data.height))));
      } else if (data.type === "select") {
        // 선택 → 호출측이 이 위젯을 언마운트(첫화면=섹션숨김 / 여정속=setHotelModalDay null) = 입력창 사라져 키보드 자동 닫힘(iOS·AOS). RN Keyboard.dismiss는 WebView 키보드 못 내려 무용(실기기 실증)이라 제거(§19).
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

// ============================================================
// 메인 = API키 fetch(/api/bts/map-config 재사용) + 플랫폼 분기
// ============================================================
export default function PlaceAutocompleteWidget(props: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [localInput, setLocalInput] = useState<string>("");

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
        } catch (e) {
          // ignore
        }
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
            props.placeholder ||
            "숙소명이나 도시명을 한글이나 원어로 입력해주세요"
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
