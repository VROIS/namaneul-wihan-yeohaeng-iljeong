// 언어 선택 모달 = LoginScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import Icon from "@/components/Icon";
import { Brand } from "@/constants/theme";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";
import { styles } from "../styles";
import type { LoginApi } from "../hooks/useLogin";

export default function LanguageModal({ login }: { login: LoginApi }) {
  const { t, theme, currentLang, showLanguageModal, setShowLanguageModal } = login;

  return (
    <Modal
      visible={showLanguageModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowLanguageModal(false)}
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
              {t("login.languageSelect")}
            </Text>
            <Pressable onPress={() => setShowLanguageModal(false)}>
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
                  setShowLanguageModal(false);
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
