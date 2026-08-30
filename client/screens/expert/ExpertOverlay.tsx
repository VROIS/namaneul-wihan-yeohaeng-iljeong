// ⚠️ 사장님 SSOT 2026-07-25 = 전문가(현지 전문가 문의) 오버레이 = 전역 1벌(App 마운트). 어느 화면(일정·AI의견·프로필·Tripis)에서든 requestExpert() 신호로 즉시 열림.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import SnapSheet from "@/components/SnapSheet";
import ExpertSheet from "@/screens/expert/ExpertSheet";
import { Brand } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type HeaderInfo = {
  avatarUrl?: string;
  nickname?: string;
  onPress?: () => void;
} | null;

export default function ExpertOverlay() {
  const { t } = useTranslation();
  const { expertRequestedAt, clearExpertRequest, requestLogin } =
    useMapToggle();
  // ⚠️ 2026-08-07 사장님 SSOT = 시트 제목("현지 전문가") 삭제 → **본인 사진 1개**로 대체(터치 = 프로필 편집).
  const [header, setHeader] = useState<HeaderInfo>(null);
  const handleHeaderChange = useCallback((h: HeaderInfo) => setHeader(h), []);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!expertRequestedAt) return;
    setVisible(true);
    clearExpertRequest();
  }, [expertRequestedAt, clearExpertRequest]);

  // ⚠️ 수정금지(승인필요) 2026-08-07 §22 판단검증이 잡은 회귀 차단 = **BTS 위에서는 화면을 바꾸지 않는다.**
  const restoreToHome = (itineraryId: number) => {
    const st: any = navigation.getState?.();
    const current = st?.routes?.[st?.index]?.name ?? st?.routes?.at?.(-1)?.name;
    if (current === "BTSMiniApp") return;
    navigation.navigate("Main", {
      screen: "Home",
      params: { itineraryId },
    } as never);
  };

  return (
    <SnapSheet
      visible={visible}
      onClose={() => setVisible(false)}
      title={t("expert.title")}
      headerLeft={
        header ? (
          <Pressable
            onPress={header.onPress}
            disabled={!header.onPress}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            accessibilityRole={header.onPress ? "button" : "image"}
            accessibilityLabel={
              header.onPress ? t("expert.editProfile") : header.nickname
            }
          >
            {header.avatarUrl ? (
              <Image
                source={{ uri: header.avatarUrl }}
                style={{ width: 32, height: 32, borderRadius: 16 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: Brand.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#FFF", fontWeight: "700" }}>
                  {(header.nickname || "P").slice(0, 1)}
                </Text>
              </View>
            )}
          </Pressable>
        ) : undefined
      }
    >
      <ExpertSheet
        onHeaderChange={handleHeaderChange}
        onClose={() => setVisible(false)}
        onOpenItinerary={(itineraryId) => {
          setVisible(false);
          restoreToHome(itineraryId);
        }}
        onRestoreBackground={(itineraryId) => {
          restoreToHome(itineraryId);
        }}
        onRequestLogin={() => {
          setVisible(false);
          requestLogin();
        }}
      />
    </SnapSheet>
  );
}
