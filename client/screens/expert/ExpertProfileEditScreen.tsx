// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 현지 전문가 본인 프로필 편집(닉네임/경력/자기소개/캐릭터).
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Colors, Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getMyExpertProfile, saveExpertProfile } from "./expertApi";

export default function ExpertProfileEditScreen({ navigation }: any) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  const [character, setCharacter] = useState("");
  const [nickname, setNickname] = useState("");
  const [career, setCareer] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    getMyExpertProfile()
      .then(({ profile }) => {
        if (!mounted.current || !profile) return;
        setCharacter(profile.character || "");
        setNickname(profile.nickname || "");
        setCareer(profile.career || "");
        setBio(profile.bio || "");
      })
      .catch(() => {})
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, []);

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await saveExpertProfile({
        character: character.trim(),
        nickname: nickname.trim(),
        career: career.trim(),
        bio: bio.trim(),
      });
      if (r.ok) {
        Alert.alert(t("expert.pfSaved"));
        navigation?.goBack?.();
      } else if (r.error === "expert_only" || r.error === "login_required") {
        Alert.alert(t("expert.loginTitle"), t("expert.loginMsg"));
      } else {
        Alert.alert(t("common.error"), t("expert.sendError"));
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving, character, nickname, career, bio, navigation, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* 고정 헤더 (닫기 + 제목) */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.sm,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation?.goBack?.()}
          hitSlop={10}
          style={styles.back}
        >
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {t("expert.editProfile")}
        </Text>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={{
            padding: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 캐릭터(아바타 글자) */}
          <Text style={[styles.label, { color: theme.text }]}>
            {t("expert.pfCharacter")}
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfCharacterPh")}
            placeholderTextColor={theme.textTertiary}
            value={character}
            onChangeText={setCharacter}
            maxLength={2}
          />

          {/* 닉네임 */}
          <Text style={[styles.label, { color: theme.text }]}>
            {t("expert.pfNickname")}
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfNicknamePh")}
            placeholderTextColor={theme.textTertiary}
            value={nickname}
            onChangeText={setNickname}
            maxLength={40}
          />

          {/* 경력 */}
          <Text style={[styles.label, { color: theme.text }]}>
            {t("expert.pfCareer")}
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfCareerPh")}
            placeholderTextColor={theme.textTertiary}
            value={career}
            onChangeText={setCareer}
            maxLength={60}
          />

          {/* 자기소개 */}
          <Text style={[styles.label, { color: theme.text }]}>
            {t("expert.pfBio")}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.inputMultiline,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfBioPh")}
            placeholderTextColor={theme.textTertiary}
            value={bio}
            onChangeText={setBio}
            maxLength={300}
            multiline
          />

          <Pressable
            style={[
              styles.saveBtn,
              { backgroundColor: Brand.primary, opacity: saving ? 0.5 : 1 },
            ]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Icon name="check" size={18} color="#FFF" />
            )}
            <Text style={styles.saveText}>{t("expert.pfSave")}</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: Fonts.bold,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  label: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 15,
    fontFamily: Fonts.medium,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: "top" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xl,
  },
  saveText: { color: "#FFF", fontSize: 16, fontFamily: Fonts.bold },
});
