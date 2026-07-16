// 여행 스타일 섹션 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable } from "react-native";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles } from "../styles";
import type { ProfileApi } from "../hooks/useProfile";

export default function PersonaSection({ profile }: { profile: ProfileApi }) {
  const { theme, persona, setPersona } = profile;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>여행 스타일</ThemedText>
      <View style={styles.personaContainer}>
        <Pressable
          style={[
            styles.personaCard,
            { backgroundColor: theme.backgroundDefault },
            persona === "luxury" && {
              borderColor: Brand.luxuryGold,
              borderWidth: 2,
            },
          ]}
          onPress={() => setPersona("luxury")}
        >
          <View
            style={[
              styles.personaIcon,
              { backgroundColor: `${Brand.luxuryGold}20` },
            ]}
          >
            <Icon name="star" size={24} color={Brand.luxuryGold} />
          </View>
          <Text style={[styles.personaTitle, { color: theme.text }]}>
            럭셔리
          </Text>
          <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>
            프리미엄 경험
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.personaCard,
            { backgroundColor: theme.backgroundDefault },
            persona === "comfort" && {
              borderColor: Brand.comfortBlue,
              borderWidth: 2,
            },
          ]}
          onPress={() => setPersona("comfort")}
        >
          <View
            style={[
              styles.personaIcon,
              { backgroundColor: `${Brand.comfortBlue}20` },
            ]}
          >
            <Icon name="heart" size={24} color={Brand.comfortBlue} />
          </View>
          <Text style={[styles.personaTitle, { color: theme.text }]}>
            편안함
          </Text>
          <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>
            안전한 여행
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
