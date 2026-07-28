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

  // 본인 프로필 프리필(공용 대표전문가 값 아님 = 로그인한 본인 값 = 다수 전문가 정체성 덮어쓰기 방지).
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

  // 📷 웹/모바일 이미지 파일 선택 시 base64 변환
  const handlePickImage = () => {
    if (Platform.OS === "web") {
      if (typeof document !== "undefined") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (file) {
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
        "이미지 업로드 안내",
        "웹 환경에서 원하는 사진 파일을 바로 선택해 업로드할 수 있습니다.",
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
        notify("프로필이 저장되었습니다.");
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
          전문가 프로필 편집
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
          <Text style={[styles.pfLabel, { color: theme.text, fontSize: 14, fontWeight: "700" }]}>
            📷 전문가 프로필 이미지 (소개 카드 아바타)
          </Text>
          <Text style={{ fontSize: 12, color: theme.textTertiary, marginBottom: 8 }}>
            여행자에게 보여지는 소개 카드 규격 아바타입니다. (권장 사이즈: 56 × 56 px 원형 이미지)
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              marginBottom: 16,
              backgroundColor: theme.backgroundDefault,
              padding: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: `${Brand.primary}20`,
                alignItems: "center",
                justify: "center",
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
                <Text style={{ fontSize: 18, fontWeight: "700", color: Brand.primary }}>
                  {character || "가이드"}
                </Text>
              )}
            </View>

            <View style={{ flex: 1, gap: 6 }}>
              <Pressable
                style={{
                  backgroundColor: Brand.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
                onPress={handlePickImage}
              >
                <Icon name="camera" size={14} color="#FFFFFF" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>
                  사진 파일 선택/업로드
                </Text>
              </Pressable>
              {avatarUrl ? (
                <Pressable onPress={() => setAvatarUrl("")}>
                  <Text style={{ fontSize: 11, color: "#EF4444", textDecorationLine: "underline" }}>
                    기존 사진 삭제하기
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* 2. 닉네임 */}
          <Text style={[styles.pfLabel, { color: theme.text, fontSize: 14, fontWeight: "700" }]}>
            닉네임 (소개 타이틀)
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder="예: 파리 빵돌이"
            placeholderTextColor={theme.textTertiary}
            value={nickname}
            onChangeText={setNickname}
            maxLength={40}
          />

          {/* 3. 경력 및 대표 칭호 */}
          <Text style={[styles.pfLabel, { color: theme.text, fontSize: 14, fontWeight: "700" }]}>
            경력 및 칭호
          </Text>
          <TextInput
            style={[
              styles.pfInput,
              { backgroundColor: theme.backgroundDefault, color: theme.text },
            ]}
            placeholder="예: 파리 현지 35년 베테랑 가이드"
            placeholderTextColor={theme.textTertiary}
            value={career}
            onChangeText={setCareer}
            maxLength={60}
          />

          {/* ✍️ 4. 자기소개 (카드 노출 글자 수 100자 이내 제한 및 실시간 카운터) */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 4 }}>
            <Text style={[styles.pfLabel, { color: theme.text, fontSize: 14, fontWeight: "700", marginTop: 0 }]}>
              자기소개 (카드 노출 100자 제한)
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: bio.length > 90 ? "#EF4444" : Brand.primary }}>
              [{bio.length} / 100자]
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.textTertiary, marginBottom: 8 }}>
            여행자 소개 카드에 최대 3줄(100자 이내)로 노출되는 핵심 소개글입니다.
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
            placeholder="여행자에게 보여줄 소개글을 100자 이내로 입력하세요."
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
