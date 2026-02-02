import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Brand } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Place {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  vibeScore?: number;
  startTime?: string;
  endTime?: string;
}

interface InteractiveMapProps {
  places: Place[];
  height?: number;
}

export function InteractiveMap({ places, height = 200 }: InteractiveMapProps) {
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMapHtml = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const validPlaces = places.filter(p => p.lat && p.lng);
        
        const response = await apiRequest("POST", "/api/map/html", {
          places: validPlaces.map(p => ({
            lat: p.lat,
            lng: p.lng,
            name: p.name,
            vibeScore: p.vibeScore || 0,
          })),
        });
        
        const data = await response.json();
        setMapHtml(data.html);
      } catch (err) {
        console.error("Failed to load map:", err);
        setError("지도를 불러올 수 없습니다");
      } finally {
        setLoading(false);
      }
    };

    fetchMapHtml();
  }, [places]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Expo Go에서 지도 확인</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <ActivityIndicator size="small" color={Brand.primary} />
          <Text style={[styles.fallbackText, { marginTop: 8 }]}>지도 로딩 중...</Text>
        </View>
      </View>
    );
  }

  if (error || !mapHtml) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>{error || "지도를 불러올 수 없습니다"}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html: mapHtml }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
        onError={() => setError("지도 로드 실패")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  fallback: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    color: "#666",
    fontSize: 14,
  },
});
