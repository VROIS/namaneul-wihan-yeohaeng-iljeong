import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [character, setCharacter] = useState("");
  const [nickname, setNickname] = useState("");
  const [career, setCareer] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        setAvatarUrl(profile.avatarUrl || "");
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

  const handlePickImage = () => {
    if (Platform.OS === "web") {
      if (typeof document !== "undefined") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (file) {
            // 5MB 용량 제한 체크
            if (file.size > 5 * 1024 * 1024) {
              notify(
                t("expert.pfImageSizeExceedTitle"),
                t("expert.pfImageSizeExceedMsg"),
              );
              return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
              const res = event.target?.result as string;
              if (res) setAvatarUrl(res);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }
    } else {
      notify(
        t("expert.pfImageUploadMobileTitle"),
        t("expert.pfImageUploadMobileMsg"),
      );
    }
  };

  const handleDeleteImage = () => {
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(t("expert.pfPhotoDeleteConfirmMsg"))
      ) {
        setAvatarUrl("");
      }
    } else {
      Alert.alert(
        t("expert.pfPhotoDelete"),
        t("expert.pfPhotoDeleteConfirmMsg"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => setAvatarUrl(""),
          },
        ],
      );
    }
  };

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await saveExpertProfile({
        avatarUrl: avatarUrl.trim(),
        character: character.trim(),
        nickname: nickname.trim(),
        career: career.trim(),
        bio: bio.trim().slice(0, 100),
      });
      if (r.ok) {
        notify(t("expert.pfSaveSuccessMsg"));
        onBack();
      } else if (r.error === "expert_only" || r.error === "login_required") {
        notify(t("expert.loginTitle"), t("expert.loginMsg"));
      } else {
        notify(t("common.error"), t("expert.sendError"));
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving, avatarUrl, character, nickname, career, bio, onBack, t]);

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
          {/* 🖼️ 1. 전문가 아바타 이미지 업로드 & 56x56 px 가이드 */}
          <Text
            style={[
              styles.pfLabel,
              { color: theme.text, fontSize: 14, fontWeight: "700" },
            ]}
          >
            📷 {t("expert.pfImageLabel")}
          </Text>
          {/* ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = i18n(§22 판단검증 적발) = 문장 중간에 볼드 구간을
              끼워 넣던 3조각 구조는 언어마다 어순이 달라 번역이 깨진다(§0 = 정확성 우선, 볼드 강조는 포기) =
              1개 문장 키(pfImageHint)로 통합. */}
          <Text
            style={{
              fontSize: 12,
              color: theme.textTertiary,
              marginBottom: 10,
              lineHeight: 16,
            }}
          >
            {t("expert.pfImageHint")}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
              backgroundColor: theme.backgroundDefault,
              padding: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            {/* 56x56 px 원형 미리보기 */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: `${Brand.primary}1A`,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderWidth: 2,
                borderColor: Brand.primary,
              }}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: 56, height: 56 }}
                  resizeMode="cover"
                />
              ) : (
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: Brand.primary,
                  }}
                >
                  {character || t("expert.pfCharacterFallback")}
                </Text>
              )}
            </View>

            {/* 교체 및 삭제 버튼 세트 */}
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                style={{
                  backgroundColor: Brand.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
                onPress={handlePickImage}
              >
                <Icon name="camera" size={14} color="#FFFFFF" />
                <Text
                  style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}
                >
                  {avatarUrl
                    ? t("expert.pfPhotoReplace")
                    : t("expert.pfPhotoSelect")}
                </Text>
              </Pressable>

              {avatarUrl ? (
                <Pressable
                  style={{
                    backgroundColor: "#FEE2E2",
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onPress={handleDeleteImage}
                >
                  <Icon name="trash-2" size={14} color="#EF4444" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#EF4444",
                    }}
                  >
                    {t("expert.pfPhotoDelete")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* 2. 닉네임 */}
          <Text
            style={[
              styles.pfLabel,
              { color: theme.text, fontSize: 14, fontWeight: "700" },
            ]}
          >
            {t("expert.pfNicknameFieldLabel")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfNicknameFieldPh")}
            placeholderTextColor={theme.textTertiary}
            value={nickname}
            onChangeText={setNickname}
            maxLength={40}
          />

          {/* 3. 경력 및 대표 칭호 */}
          <Text
            style={[
              styles.pfLabel,
              { color: theme.text, fontSize: 14, fontWeight: "700" },
            ]}
          >
            {t("expert.pfCareerFieldLabel")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder={t("expert.pfCareerFieldPh")}
            placeholderTextColor={theme.textTertiary}
            value={career}
            onChangeText={setCareer}
            maxLength={60}
          />

          {/* ✍️ 4. 자기소개 (카드 노출 글자 수 100자 이내 제한 및 실시간 카운터) */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 6,
              marginBottom: 4,
            }}
          >
            <Text
              style={[
                styles.pfLabel,
                {
                  color: theme.text,
                  fontSize: 14,
                  fontWeight: "700",
                  marginTop: 0,
                },
              ]}
            >
              {t("expert.pfBioFieldLabel")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: bio.length > 90 ? "#EF4444" : Brand.primary,
              }}
            >
              {t("expert.pfBioCounter", { count: bio.length })}
            </Text>
          </View>
          <Text
            style={{ fontSize: 12, color: theme.textTertiary, marginBottom: 8 }}
          >
            {t("expert.pfBioFieldHint")}
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              styles.pfInputMultiline,
              {
                backgroundColor: theme.backgroundDefault,
                color: theme.text,
                minHeight: 80,
                textAlignVertical: "top",
              },
            ]}
            placeholder={t("expert.pfBioFieldPh")}
            placeholderTextColor={theme.textTertiary}
            value={bio}
            onChangeText={(text) => setBio(text.slice(0, 100))}
            maxLength={100}
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
