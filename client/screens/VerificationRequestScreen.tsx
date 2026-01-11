import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, BorderRadius, Brand, Colors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { apiRequest } from "@/lib/query-client";

type RouteParams = RouteProp<RootStackParamList, "VerificationRequest">;

export default function VerificationRequestScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteParams>();
  const { itinerary } = route.params;

  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const userId = `user_${Date.now()}`;
      const response = await apiRequest("POST", "/api/verification/request", {
        userId,
        itineraryData: itinerary,
        userMessage: comment || null,
      });

      const result = await response.json();
      if (result.success) {
        Alert.alert(
          "검증 요청 완료",
          "현지 전문가가 일정을 검토한 후 알려드리겠습니다.",
          [{ text: "확인", onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error("Verification request error:", error);
      Alert.alert("오류", "요청 처리 중 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPlaces = itinerary.days?.reduce((sum, day) => sum + (day.places?.length || 0), 0) || 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>전문가 검증</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={[styles.infoCard, { backgroundColor: `${Brand.primary}10` }]}>
          <Feather name="award" size={24} color={Brand.primary} />
          <View style={styles.infoTextContainer}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>파리 현지 35년 경력 가이드</Text>
            <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
              AI 생성 일정을 검토하고 개선점을 알려드립니다
            </Text>
          </View>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: theme.backgroundDefault }]}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>검증 요청 일정</Text>
          <Text style={[styles.summaryTitle, { color: theme.text }]}>{itinerary.destination}</Text>
          <View style={styles.summaryMeta}>
            <View style={styles.metaItem}>
              <Feather name="calendar" size={14} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {itinerary.startDate} ~ {itinerary.endDate}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={14} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {itinerary.days?.length || 0}일 / {totalPlaces}개 장소
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.commentSection}>
          <Text style={[styles.commentLabel, { color: theme.text }]}>전문가에게 한마디 (선택)</Text>
          <TextInput
            style={[styles.commentInput, { 
              backgroundColor: theme.backgroundDefault, 
              color: theme.text,
              borderColor: theme.border,
            }]}
            placeholder="궁금한 점이나 요청사항을 적어주세요"
            placeholderTextColor={theme.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
          />
        </View>
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.backgroundRoot }]}>
        <Pressable
          style={[styles.submitButton, { backgroundColor: Brand.primary, opacity: submitting ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Feather name="send" size={18} color="#FFFFFF" />
          <Text style={styles.submitText}>{submitting ? "처리 중..." : "검증 요청하기"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  backButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  infoTextContainer: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  infoDesc: { fontSize: 13 },
  summaryCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  summaryLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  summaryTitle: { fontSize: 20, fontWeight: "800", marginBottom: Spacing.sm },
  summaryMeta: { gap: Spacing.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  metaText: { fontSize: 13 },
  commentSection: { marginBottom: Spacing.lg },
  commentLabel: { fontSize: 14, fontWeight: "700", marginBottom: Spacing.sm },
  commentInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: "top",
  },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  submitText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
