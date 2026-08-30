import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import { SUPPORTED_LANGS } from "@/lib/i18n";
import { langModalStyles } from "../langModalStyles";
import type { ProfileApi } from "../hooks/useProfile";

export default function LanguageModal({ profile }: { profile: ProfileApi }) {
  const {
    theme,
    t,
    showLanguageModal,
    setShowLanguageModal,
    currentLang,
    handleLanguageChange,
  } = profile;

  return (
    <Modal
      visible={showLanguageModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowLanguageModal(false)}
    >
      <View style={langModalStyles.overlay}>
        <View
          style={[
            langModalStyles.content,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <View style={langModalStyles.header}>
            <Text style={[langModalStyles.title, { color: theme.text }]}>
              {t("login.languageSelect")}
            </Text>
            <Pressable onPress={() => setShowLanguageModal(false)}>
              <Icon name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView style={langModalStyles.list}>
            {SUPPORTED_LANGS.map((lang) => (
              <Pressable
                key={lang.code}
                style={[
                  langModalStyles.item,
                  currentLang.code === lang.code &&
                    langModalStyles.itemSelected,
                ]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text style={langModalStyles.flag}>{lang.flag}</Text>
                <View style={langModalStyles.itemText}>
                  <Text
                    style={[langModalStyles.itemName, { color: theme.text }]}
                  >
                    {lang.nativeName}
                  </Text>
                  <Text
                    style={[
                      langModalStyles.itemSub,
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
