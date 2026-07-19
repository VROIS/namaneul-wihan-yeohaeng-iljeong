/**
 * BTS 이벤트 페이지 - bts-app UI + API 연동
 * docs/BTS/BTS_구체화_계획.md 참조
 */

import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

// 멤버 (memberId = API용)
const MEMBERS = [
  { id: "collector", name: "컬렉터", color: "#BDE0FE" },
  { id: "romanticist", name: "로맨티스트", color: "#FFC8DD" },
  { id: "chiller", name: "칠러", color: "#A2D2FF" },
  { id: "explorer", name: "익스플로러", color: "#FFAFCC" },
  { id: "companion", name: "컴패니언", color: "#FFF3B0" },
  { id: "recharger", name: "리차저", color: "#CDB4DB" },
  { id: "challenger", name: "챌린저", color: "#90E0EF" },
];

type BtsCity = { id: number; nameKo: string; nameEn: string; btsRank: number };
type BtsPlace = {
  id: number;
  nameKo: string | null;
  nameEn: string;
  imageUrl: string | null;
  summaryKo: string | null;
};
type ItineraryDay = {
  day: number;
  places: {
    name: string;
    startTime: string;
    description: string;
    image?: string;
  }[];
  city: string;
};

export default function BTSConcertPlannerScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [screen, setScreen] = useState<
    "select" | "places" | "loading" | "result"
  >("select");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [cities, setCities] = useState<BtsCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [places, setPlaces] = useState<BtsPlace[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);
  const [itinerary, setItinerary] = useState<{
    title: string;
    days: ItineraryDay[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = getApiUrl();

  // 도시 목록 로드
  useEffect(() => {
    fetch(`${baseUrl}/api/bts/cities`)
      .then((r) => r.json())
      .then(setCities)
      .catch(() => setCities([]));
  }, [baseUrl]);

  // 도시 선택 시 기본값
  useEffect(() => {
    if (cities.length > 0 && !selectedCityId) setSelectedCityId(cities[0].id);
  }, [cities, selectedCityId]);

  // 상위 8곳 로드 (멤버+도시 선택 시)
  useEffect(() => {
    if (!selectedMemberId || !selectedCityId) return;
    setLoading(true);
    fetch(
      `${baseUrl}/api/bts/top-places?cityId=${selectedCityId}&memberId=${selectedMemberId}`,
    )
      .then((r) => r.json())
      .then((data: BtsPlace[]) => setPlaces(Array.isArray(data) ? data : []))
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, [selectedMemberId, selectedCityId, baseUrl]);

  const handleMemberSelect = (id: string) => {
    setSelectedMemberId(id);
    setSelectedPlaceIds([]);
  };

  const handlePlaceToggle = (id: number) => {
    setSelectedPlaceIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id].slice(0, 8),
    );
  };

  const handleGenerate = () => {
    if (!selectedCityId || !selectedMemberId || selectedPlaceIds.length === 0)
      return;
    setScreen("loading");
    setError(null);
    fetch(`${baseUrl}/api/bts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cityId: selectedCityId,
        memberId: selectedMemberId,
        selectedPlaceIds,
      }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || t("bts.generateFailed"));
        return data;
      })
      .then((data) => {
        setItinerary({
          title: data.title || t("bts.title"),
          days: data.days || [],
        });
        setScreen("result");
      })
      .catch((e) => {
        setError(e?.message || t("bts.generateFailed"));
        setScreen("places");
      });
  };

  const handleReset = () => {
    setScreen("select");
    setSelectedMemberId(null);
    setSelectedPlaceIds([]);
    setItinerary(null);
    setError(null);
  };

  // ─── Select Screen: 멤버 선택 ───
  if (screen === "select") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color="#F9FAFB" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("bts.title")}</Text>
        </View>
        <Text style={styles.subTitle}>{t("bts.selectVibe")}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cityRow}
        >
          {cities.slice(0, 10).map((c) => (
            <Pressable
              key={c.id}
              style={[
                styles.cityChip,
                selectedCityId === c.id && styles.cityChipSelected,
              ]}
              onPress={() => setSelectedCityId(c.id)}
            >
              <Text style={styles.cityChipText}>{c.nameKo}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.bubbleRow}>
          {MEMBERS.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={m.name}
              style={[
                styles.bubble,
                { backgroundColor: m.color },
                selectedMemberId === m.id && styles.bubbleSelected,
              ]}
              onPress={() => handleMemberSelect(m.id)}
            >
              <Text style={styles.bubbleText}>{m.name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("bts.nextSelectPlaces")}
          style={[
            styles.primaryBtn,
            (!selectedMemberId || loading) && styles.primaryBtnDisabled,
          ]}
          disabled={!selectedMemberId || loading}
          onPress={() => selectedMemberId && setScreen("places")}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {t("bts.nextSelectPlaces")}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // ─── Places Screen: 8곳 카드 선택 ───
  if (screen === "places") {
    const canGenerate = selectedPlaceIds.length >= 1;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setScreen("select")} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color="#F9FAFB" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {t("bts.placeSelectCount", { count: selectedPlaceIds.length })}
          </Text>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <ScrollView contentContainerStyle={styles.placeGrid}>
          {places.map((p) => {
            const isSelected = selectedPlaceIds.includes(p.id);
            return (
              <Pressable
                key={p.id}
                style={[
                  styles.placeCard,
                  isSelected && styles.placeCardSelected,
                ]}
                onPress={() => handlePlaceToggle(p.id)}
              >
                <Text style={styles.placeName} numberOfLines={2}>
                  {p.nameKo || p.nameEn}
                </Text>
                {isSelected && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          style={[styles.primaryBtn, !canGenerate && styles.primaryBtnDisabled]}
          disabled={!canGenerate}
          onPress={handleGenerate}
        >
          <Text style={styles.primaryBtnText}>
            {t("bts.generateWithPlaces", { count: selectedPlaceIds.length })}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ─── Loading ───
  if (screen === "loading") {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.loadingRing} />
        <Text style={styles.loadingTitle}>{t("bts.generating")}</Text>
        <Text style={styles.loadingSub}>{t("bts.generatingHint")}</Text>
      </View>
    );
  }

  // ─── Result ───
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={handleReset} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#F9FAFB" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {itinerary?.title || t("bts.title")}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.resultContent}>
        {itinerary?.days.map((day) => (
          <View key={day.day} style={styles.dayBlock}>
            <Text style={styles.dayTitle}>
              Day {day.day} - {day.city}
            </Text>
            {day.places.map((p, i) => (
              <View key={i} style={styles.timelineItem}>
                <View style={styles.dot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timeText}>{p.startTime}</Text>
                  <Text style={styles.placeTitle}>{p.name}</Text>
                  {p.description ? (
                    <Text style={styles.placeDesc}>{p.description}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ))}
        <Pressable
          style={[
            styles.primaryBtn,
            { backgroundColor: "#374151", marginTop: 20 },
          ]}
          onPress={handleReset}
        >
          <Text style={styles.primaryBtnText}>{t("bts.backToStart")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F14" },
  centerContent: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#F9FAFB" },
  subTitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 12,
  },
  cityRow: { maxHeight: 44, marginBottom: 16, paddingHorizontal: 16 },
  cityChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginRight: 8,
  },
  cityChipSelected: { backgroundColor: "#8B5CF6" },
  cityChipText: { color: "#F9FAFB", fontSize: 13 },
  bubbleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  bubble: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  bubbleSelected: { borderWidth: 3, borderColor: "#8B5CF6" },
  bubbleText: { fontSize: 12, fontWeight: "700", color: "#222" },
  primaryBtn: {
    margin: 20,
    padding: 18,
    borderRadius: 30,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  placeGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 12 },
  placeCard: {
    width: "47%",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  placeCardSelected: { borderColor: "#8B5CF6" },
  placeName: { color: "#F9FAFB", fontSize: 14, fontWeight: "600" },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    color: "#8B5CF6",
    fontSize: 18,
  },
  errorText: { color: "#EF4444", padding: 16, textAlign: "center" },
  loadingRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.2)",
    borderTopColor: "#8B5CF6",
    marginBottom: 20,
  },
  loadingTitle: { fontSize: 20, fontWeight: "700", color: "#F9FAFB" },
  loadingSub: { fontSize: 14, color: "#9CA3AF", marginTop: 8 },
  resultContent: { padding: 20, paddingBottom: 40 },
  dayBlock: { marginBottom: 24 },
  dayTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#8B5CF6",
    marginBottom: 12,
  },
  timelineItem: { flexDirection: "row", marginBottom: 16 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#8B5CF6",
    marginTop: 6,
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 14,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B5CF6",
    marginBottom: 4,
  },
  placeTitle: { fontSize: 16, fontWeight: "600", color: "#F9FAFB" },
  placeDesc: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
});
