// 전문가 프로필 편집(ExpertProfileEditScreen 로직 인라인 §16) = 뒤로 = setView(home)
// ExpertSheet.tsx 분리(2026-07-15 §0 슬림화, 순수 이동, 리팩토링 금지).
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Colors, Brand, Spacing } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getMyExpertProfile, saveExpertProfile } from "../expertApi";
import { styles } from "../styles";

export default function ProfileEditView({
  theme,
  insets,
  t,
  onBack,
}: {
  theme: typeof Colors.light;
  insets: { bottom: number };
  t: (k: string, o?: any) => string;
  onBack: () => void;
}) {
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

  // 본인 프로필 프리필(공용 대표전문가 값 아님 = 로그인한 본인 값 = 다수 전문가 정체성 덮어쓰기 방지).
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

  const notify = (title: string, msg?: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined")
        window.alert(msg ? `${title}\n\n${msg}` : title);
    } else Alert.alert(title, msg);
  };

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
        notify(t("expert.pfSaved"));
        onBack();
      } else if (r.error === "expert_only" || r.error === "login_required") {
        notify(t("expert.loginTitle"), t("expert.loginMsg"));
      } else {
        notify(t("common.error"), t("expert.sendError"));
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving, character, nickname, career, bio, onBack, t]);

  return (
    <View style={styles.container}>
      {/* 서브헤더 = ← 뒤로(home) + 제목 */}
      <View style={[styles.pfHeader, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.pfBack}>
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.pfTitle, { color: theme.text }]}>
          {t("expert.editProfile")}
        </Text>
        <View style={styles.pfBack} />
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
          <Text style={[styles.pfLabel, { color: theme.text }]}>
            {t("expert.pfCharacter")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfCharacterPh")}
            placeholderTextColor={theme.textTertiary}
            value={character}
            onChangeText={setCharacter}
            maxLength={2}
          />

          {/* 닉네임 */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>
            {t("expert.pfNickname")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfNicknamePh")}
            placeholderTextColor={theme.textTertiary}
            value={nickname}
            onChangeText={setNickname}
            maxLength={40}
          />

          {/* 경력 */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>
            {t("expert.pfCareer")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfCareerPh")}
            placeholderTextColor={theme.textTertiary}
            value={career}
            onChangeText={setCareer}
            maxLength={60}
          />

          {/* 자기소개 */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>
            {t("expert.pfBio")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              styles.pfInputMultiline,
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
