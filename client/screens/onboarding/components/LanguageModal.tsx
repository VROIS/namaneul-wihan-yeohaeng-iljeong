// 언어 선택 모달 = OnboardingScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import Icon from "@/components/Icon";
import { Brand, Colors } from "@/constants/theme";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";
import { styles } from "../styles";

export default function LanguageModal({
  visible,
  onClose,
  currentLang,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  currentLang: (typeof SUPPORTED_LANGS)[number];
  theme: (typeof Colors)["light"];
}) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {t("onboarding.languageSelect")}
            </Text>
            <Pressable onPress={onClose}>
              <Icon name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.languageList}>
            {SUPPORTED_LANGS.map((lang) => (
              <Pressable
                key={lang.code}
                style={[
                  styles.languageItem,
                  currentLang.code === lang.code &&
                  styles.languageItemSelected,
                ]}
                onPress={async () => {
                  await changeLanguageAndPersist(lang.code);
                  onClose();
                }}
              >
                <Text style={styles.flagText}>{lang.flag}</Text>
                <View style={styles.languageTextContainer}>
                  <Text style={[styles.languageName, { color: theme.text }]}>
                    {lang.nativeName}
                  </Text>
                  <Text
                    style={[
                      styles.languageSubname,
                      { color: theme.textTertiary },
                    ]}
                  >
                    {lang.name}
                  </Text>
                </View>
                {currentLang.code === lang.code ? (
                  <Icon name="check" size={20} color={Brand.primary} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
