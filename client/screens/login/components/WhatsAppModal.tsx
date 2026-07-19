// WhatsApp OTP 모달 = LoginScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, Modal, TextInput } from "react-native";
import Icon from "@/components/Icon";
import { Spacing } from "@/constants/theme";
import { styles } from "../styles";
import type { LoginApi } from "../hooks/useLogin";

export default function WhatsAppModal({ login }: { login: LoginApi }) {
  const {
    t,
    theme,
    showWhatsAppModal,
    setShowWhatsAppModal,
    whatsappStep,
    setWhatsappStep,
    whatsappPhone,
    setWhatsappPhone,
    whatsappOtp,
    setWhatsappOtp,
    oauthLoading,
    handleWhatsAppSendOtp,
    handleWhatsAppVerify,
  } = login;

  return (
    <Modal
      visible={showWhatsAppModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowWhatsAppModal(false)}
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
              {whatsappStep === "phone"
                ? t("login.phoneInput")
                : t("login.otpInput")}
            </Text>
            <Pressable onPress={() => setShowWhatsAppModal(false)}>
              <Icon name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          {whatsappStep === "phone" ? (
            <View style={styles.whatsappModalBody}>
              <Text
                style={[
                  styles.whatsappModalHint,
                  { color: theme.textTertiary },
                ]}
              >
                {t("login.phoneHint")}
              </Text>
              <TextInput
                style={[
                  styles.whatsappInput,
                  { color: theme.text, borderColor: theme.border },
                ]}
                placeholder="01012345678"
                placeholderTextColor={theme.textTertiary}
                value={whatsappPhone}
                onChangeText={setWhatsappPhone}
                keyboardType="phone-pad"
              />
              <Pressable
                style={[styles.whatsappSubmit, styles.whatsappButton]}
                onPress={handleWhatsAppSendOtp}
                disabled={oauthLoading}
              >
                <Text style={styles.whatsappButtonText}>
                  {t("login.otpSend")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.whatsappModalBody}>
              <Text
                style={[
                  styles.whatsappModalHint,
                  { color: theme.textTertiary },
                ]}
              >
                {t("login.otpHint", { phone: whatsappPhone })}
              </Text>
              <TextInput
                style={[
                  styles.whatsappInput,
                  { color: theme.text, borderColor: theme.border },
                ]}
                placeholder="000000"
                placeholderTextColor={theme.textTertiary}
                value={whatsappOtp}
                onChangeText={(t) =>
                  setWhatsappOtp(t.replace(/\D/g, "").slice(0, 6))
                }
                keyboardType="number-pad"
                maxLength={6}
              />
              <Pressable
                style={[styles.whatsappSubmit, styles.whatsappButton]}
                onPress={handleWhatsAppVerify}
                disabled={oauthLoading}
              >
                <Text style={styles.whatsappButtonText}>
                  {t("common.confirm")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWhatsappStep("phone")}
                style={{ marginTop: Spacing.sm }}
              >
                <Text style={{ color: theme.textTertiary, fontSize: 13 }}>
                  전화번호 변경
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
