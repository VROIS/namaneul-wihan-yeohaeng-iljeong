import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import {
  Typography,
  Spacing,
  BorderRadius,
  Brand,
  Colors,
  Fonts,
} from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { apiRequest } from "@/lib/query-client";
import { getUserData, UserData } from "@/lib/auth";

type RouteParams = RouteProp<RootStackParamList, "VerificationRequest">;

export default function VerificationRequestScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteParams>();
  const itinerary = route.params?.itinerary;

  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);

  React.useEffect(() => {
    getUserData().then(setUser);
  }, []);

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
          t("verify.submitSuccess"),
          t("verify.submitSuccessMsg"),
          [{ text: t("common.confirm"), onPress: () => navigation.goBack() }],
        );
      }
    } catch (error) {
      console.error("Verification request error:", error);
      Alert.alert(
        t("common.error"),
        t("verify.submitError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const totalPlaces =
    itinerary?.days?.reduce((sum, day) => sum + (day.places?.length || 0), 0) ||
    0;

  if (!itinerary) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: theme.text }}>{t("verify.noItinerary")}</Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: Brand.primary }}>{t("common.back")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t("verify.title")}
        </Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View
          style={[styles.infoCard, { backgroundColor: `${Brand.primary}10` }]}
        >
          <Icon name="award" size={24} color={Brand.primary} />
          <View style={styles.infoTextContainer}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>
              {t("verify.expertInfo")}
            </Text>
            <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
              {t("verify.expertDesc")}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
            {t("verify.requestLabel")}
          </Text>
          <Text style={[styles.summaryTitle, { color: theme.text }]}>
            {itinerary.destination}
          </Text>
          <View style={styles.summaryMeta}>
            <View style={styles.metaItem}>
              <Icon name="calendar" size={14} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {itinerary.startDate} ~ {itinerary.endDate}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Icon name="map-pin" size={14} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {itinerary.days?.length || 0}일 / {totalPlaces}개 장소
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.membershipCard,
            {
              backgroundColor: user?.isPaid
                ? `${Brand.luxuryGold}10`
                : theme.backgroundSecondary,
              borderColor: user?.isPaid ? Brand.luxuryGold : theme.border,
            },
          ]}
        >
          <Icon
            name={user?.isPaid ? "star" : "user"}
            size={20}
            color={user?.isPaid ? Brand.luxuryGold : theme.textSecondary}
          />
          <Text
            style={[
              styles.membershipText,
              { color: user?.isPaid ? Brand.luxuryGold : theme.textSecondary },
            ]}
          >
            {user?.isPaid
              ? t("verify.premiumMember")
              : t("verify.normalMember")}
          </Text>
        </View>

        <View style={styles.commentSection}>
          <Text style={[styles.commentLabel, { color: theme.text }]}>
            {t("verify.commentLabel")}
          </Text>
          <TextInput
            style={[
              styles.commentInput,
              {
                backgroundColor: theme.backgroundDefault,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder={t("verify.commentPlaceholder")}
            placeholderTextColor={theme.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
          />
        </View>
      </KeyboardAwareScrollViewCompat>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + Spacing.md,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <Pressable
          style={[
            styles.submitButton,
            { backgroundColor: Brand.primary, opacity: submitting ? 0.6 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Icon name="send" size={18} color="#FFFFFF" />
          <Text style={styles.submitText}>
            {submitting ? t("common.processing") : t("verify.submit")}
          </Text>
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
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: Fonts.bold },
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
  infoTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 4 },
  infoDesc: { fontSize: 13 },
  summaryCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  summaryLabel: { fontSize: 12, fontFamily: Fonts.semiBold, marginBottom: 4 },
  summaryTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.sm,
  },
  summaryMeta: { gap: Spacing.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  metaText: { fontSize: 13 },
  membershipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  membershipText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  commentSection: { marginBottom: Spacing.lg },
  commentLabel: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.sm,
  },
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
  submitText: { color: "#FFFFFF", fontSize: 16, fontFamily: Fonts.bold },
});
