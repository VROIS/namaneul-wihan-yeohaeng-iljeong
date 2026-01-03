import React, { useState } from "react";
import { View, StyleSheet, Text, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { Typography, Spacing, BorderRadius, Brand, Shadows } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollView";
import ThemedText from "@/components/ThemedText";

export default function PlanModalScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [destination, setDestination] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<"luxury" | "comfort">("comfort");

  const handleCreate = () => {
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <ThemedText style={styles.cancelText}>취소</ThemedText>
        </Pressable>
        <ThemedText style={styles.headerTitle}>새 여정 만들기</ThemedText>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>어디로 떠나시나요?</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text }
            ]}
            placeholder="도시 또는 나라 검색"
            placeholderTextColor={theme.textTertiary}
            value={destination}
            onChangeText={setDestination}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>여행 스타일</ThemedText>
          <View style={styles.personaContainer}>
            <Pressable
              style={[
                styles.personaCard,
                { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
                selectedPersona === "luxury" && { borderColor: Brand.luxuryGold, borderWidth: 2 }
              ]}
              onPress={() => setSelectedPersona("luxury")}
            >
              <View style={[styles.personaIcon, { backgroundColor: `${Brand.luxuryGold}20` }]}>
                <Feather name="star" size={24} color={Brand.luxuryGold} />
              </View>
              <Text style={[styles.personaTitle, { color: theme.text }]}>럭셔리</Text>
              <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>
                시간 최적화, 포토제닉
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.personaCard,
                { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
                selectedPersona === "comfort" && { borderColor: Brand.comfortBlue, borderWidth: 2 }
              ]}
              onPress={() => setSelectedPersona("comfort")}
            >
              <View style={[styles.personaIcon, { backgroundColor: `${Brand.comfortBlue}20` }]}>
                <Feather name="heart" size={24} color={Brand.comfortBlue} />
              </View>
              <Text style={[styles.personaTitle, { color: theme.text }]}>편안함</Text>
              <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>
                안전 우선, 검증된 맛집
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable onPress={handleCreate} style={styles.createButton}>
          <LinearGradient
            colors={Brand.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createButtonGradient}
          >
            <Text style={styles.createButtonText}>여정 생성</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    width: 60,
  },
  cancelText: {
    ...Typography.body,
    color: Brand.primary,
  },
  headerTitle: {
    ...Typography.h3,
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    ...Typography.body,
  },
  personaContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  personaCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  personaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  personaTitle: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  personaDesc: {
    ...Typography.caption,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  createButton: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    ...Shadows.card,
  },
  createButtonGradient: {
    height: Spacing.buttonHeight,
    justifyContent: "center",
    alignItems: "center",
  },
  createButtonText: {
    ...Typography.label,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
