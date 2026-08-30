import React, { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles } from "../styles";
import { shortDateCard, pickBi } from "../utils"; // 날짜 서식 = 여정 카드와 같은 1벌(§16)
import { HELP_FAQ, FAQ_HEADING } from "../helpFaq";
import { PRIVACY } from "../privacyContent";
import type { ProfileApi } from "../hooks/useProfile";

// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 = 고객센터 대표 메일 = 이 상수 1벌.
const SUPPORT_EMAIL = "vrois75015@gmail.com";

// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 SSOT = 크레딧 내역 DB description 은 장부용 한국어 그대로 둔다
const CREDIT_LABEL_TO_KEY: Record<string, string> = {
  "여정 생성": "credit.txRouteGenerate",
  "AI 의견": "credit.txAiOpinion",
  "Tripis 해설": "credit.txGuideExplain",
  "전문가 검증": "credit.txExpertVerify",
  "일별 영상": "credit.txDayVideo",
};
function txLabel(
  tx: { type: string; description: string },
  t: (k: string) => string,
): string {
  if (tx.type === "purchase") return t("credit.txPurchase");
  if (tx.type === "signup_bonus") return t("credit.txSignupBonus");
  return t(CREDIT_LABEL_TO_KEY[tx.description] || "credit.txPurchase");
}

export default function SettingsMenu({ profile }: { profile: ProfileApi }) {
  const {
    theme,
    t,
    navigation,
    isAuth,
    setShowLanguageModal,
    handleLogout,
    currentLang,
    handleLanguageChange,
    credits,
    transactions,
    pricing,
    handleDeleteAccount,
    deletingAccount,
  } = profile;

  // 🌐 2026-08-14 사장님 승인 = 개인정보방침·FAQ 한/영 2벌 선택 기준(privacyContent.ts·helpFaq.ts 참조)
  const isKo = currentLang.code === "ko";

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState<boolean>(false);
  const [showReceipts, setShowReceipts] = useState<boolean>(false);

  const lastPurchase = transactions.find((tx) => tx.type === "purchase");
  const lastTopUp = lastPurchase
    ? t("credit.topUpDetail", {
        date: shortDateCard(lastPurchase.createdAt),
        amount: lastPurchase.amount,
      })
    : t("credit.none");
  const priceNote = pricing
    ? ` · ${t("credit.priceNote", { price: pricing.priceEur, credits: pricing.purchaseCredits })}`
    : "";

  const toggleAccordion = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const languageOptions = [
    { code: "ko", name: "한국어" },
    { code: "en", name: "English" },
    { code: "ja", name: "日本語" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "zh", name: "中文" },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleHeader}>
        <View
          style={[
            styles.sectionIconBox,
            { backgroundColor: "rgba(245, 158, 11, 0.12)" },
          ]}
        >
          <Icon name="settings" size={18} color="#F59E0B" />
        </View>
        <ThemedText style={styles.sectionTitle}>{t("tab.settings")}</ThemedText>
      </View>

      <View style={styles.accordionCard}>
        {/* 1. 결제 관리 아코디언 */}
        <Pressable
          style={styles.accordionItemHeader}
          onPress={() => toggleAccordion("payment")}
        >
          <View style={styles.accordionItemLeft}>
            <View
              style={[
                styles.menuIconCircle,
                { backgroundColor: "rgba(66, 133, 244, 0.12)" },
              ]}
            >
              <Icon name="credit-card" size={18} color={Brand.primary} />
            </View>
            <Text style={styles.accordionItemLabel}>
              {t("profile.payment")}
            </Text>
          </View>
          <Icon
            name={expandedKey === "payment" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>
        {expandedKey === "payment" && (
          <View style={styles.accordionBody}>
            {/* ⚠️ 2026-07-29 §9 = 행 구성·스타일은 그대로 두고 **내용만 진짜로** 교체.
                옛 가짜값(신한카드 4520-…, 최근결제 €9.00/100C, 이모지) 완전삭제 §19.
                카드번호는 Stripe 호스티드 결제라 우리 서버에 애초에 없다 = 보여줄 값이 없으므로 사실을 적는다. */}
            <Text style={styles.accordionText}>
              · {t("credit.securePayment")}
              {priceNote}
            </Text>
            <Text style={styles.accordionText}>
              · {t("credit.recentTopUp")}: {lastTopUp}
            </Text>
            {/* ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 = 여기 [충전] 칩 완전삭제 §19.
                사유 = 프로필 헤더에 이미 같은 버튼이 있어 한 화면에 두 벌(§0). 충전 진입 = 헤더 1벌만.
                이름도 교체 = [영수증 내역] → [크레딧 내역] (실제로 나오는 것이 영수증이 아니라 크레딧 증감 기록). */}
            <View style={styles.chipContainer}>
              <Pressable
                style={[styles.chipBtn, { borderColor: "#CBD5E1" }]}
                onPress={() => setShowReceipts((prev) => !prev)}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t("credit.history")}
                accessibilityState={{ expanded: showReceipts }}
              >
                <Text style={[styles.chipBtnText, { color: "#0F172A" }]}>
                  {t("credit.history")}
                </Text>
              </Pressable>
            </View>
            {showReceipts &&
              (transactions.length === 0 ? (
                <Text style={styles.accordionText}>
                  · {t("credit.noHistory")}
                </Text>
              ) : (
                <View>
                  {/* ⚠️ 수정금지(승인필요) 2026-08-14 사장님 지시 = 엑셀표처럼: 잔액은 맨 위 1번만, 그 아래는
                      날짜·항목·금액 3칸 표. 지출=-(적자색), 충전/보너스=+(성공색). 줄마다 반복하던 "(잔액 N C)" 삭제. */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingBottom: 8,
                      marginBottom: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: "#E2E8F0",
                    }}
                  >
                    <Text style={[styles.accordionText, { marginBottom: 0 }]}>
                      {t("credit.balance")}
                    </Text>
                    <Text
                      style={[
                        styles.accordionText,
                        {
                          marginBottom: 0,
                          fontFamily: Fonts.bold,
                          color: "#0F172A",
                        },
                      ]}
                    >
                      {credits ?? 0} C
                    </Text>
                  </View>
                  {transactions.map((tx) => (
                    <View
                      key={tx.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 4,
                        gap: 8,
                      }}
                      accessible
                      accessibilityLabel={`${shortDateCard(tx.createdAt)} ${txLabel(tx, t)} ${tx.amount > 0 ? "+" : ""}${tx.amount} C`}
                    >
                      <Text
                        style={[
                          styles.accordionText,
                          { marginBottom: 0, width: 62, color: "#94A3B8" },
                        ]}
                      >
                        {shortDateCard(tx.createdAt)}
                      </Text>
                      <Text
                        style={[
                          styles.accordionText,
                          { marginBottom: 0, flex: 1 },
                        ]}
                        numberOfLines={1}
                      >
                        {txLabel(tx, t)}
                      </Text>
                      <Text
                        style={[
                          styles.accordionText,
                          {
                            marginBottom: 0,
                            fontFamily: Fonts.bold,
                            color: tx.amount > 0 ? theme.success : theme.danger,
                          },
                        ]}
                      >
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount} C
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
          </View>
        )}

        {/* 2. 언어 설정 풀다운 드롭다운 (Pull-down Select) */}
        <Pressable
          style={[
            styles.accordionItemHeader,
            { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
          ]}
          onPress={() => setIsLangDropdownOpen((prev) => !prev)}
        >
          <View style={styles.accordionItemLeft}>
            <View
              style={[
                styles.menuIconCircle,
                { backgroundColor: "rgba(16, 185, 129, 0.12)" },
              ]}
            >
              <Icon name="globe" size={18} color="#10B981" />
            </View>
            <Text style={styles.accordionItemLabel}>
              {t("profile.language")} : {currentLang.nativeName}
            </Text>
          </View>
          <Icon
            name={isLangDropdownOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color="#10B981"
          />
        </Pressable>
        {isLangDropdownOpen && (
          <View style={styles.accordionBody}>
            <Text style={styles.accordionText}>
              {t("profile.touchToChangeLang")}
            </Text>
            <View style={styles.chipContainer}>
              {languageOptions.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[
                    styles.chipBtn,
                    {
                      borderColor:
                        currentLang.code === lang.code ? "#10B981" : "#CBD5E1",
                      backgroundColor:
                        currentLang.code === lang.code
                          ? "rgba(16, 185, 129, 0.12)"
                          : "#FFFFFF",
                    },
                  ]}
                  onPress={() => {
                    handleLanguageChange(lang.code);
                    setIsLangDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.chipBtnText,
                      {
                        color:
                          currentLang.code === lang.code
                            ? "#10B981"
                            : "#0F172A",
                      },
                    ]}
                  >
                    {lang.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* 3. 개인정보 보호 아코디언 */}
        <Pressable
          style={[
            styles.accordionItemHeader,
            { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
          ]}
          onPress={() => toggleAccordion("privacy")}
        >
          <View style={styles.accordionItemLeft}>
            <View
              style={[
                styles.menuIconCircle,
                { backgroundColor: "rgba(139, 92, 246, 0.12)" },
              ]}
            >
              <Icon name="lock" size={18} color="#8B5CF6" />
            </View>
            <Text style={styles.accordionItemLabel}>
              {t("profile.privacy")}
            </Text>
          </View>
          <Icon
            name={expandedKey === "privacy" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>
        {expandedKey === "privacy" && (
          <View style={styles.accordionBody}>
            {/* ⚠️ 수정금지(승인필요) 2026-08-03 사장님 승인 = 옛 '손안에 가이드'(카메라 전용 앱) 문서 전면 교체.
                지금 TRIPIS(여정생성·AI의견·전문가검증·Tripis해설/영상·크레딧) 실제 데이터 흐름 기준으로 다시 씀 = §19.
                정본 = docs/2026-07-29 결제·크레딧 구현.md (이 컴포넌트를 이미 다루는 문서). */}
            <Text
              style={[
                styles.accordionText,
                {
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#0F172A",
                  marginBottom: 8,
                },
              ]}
            >
              {pickBi(PRIVACY.title, isKo)}
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              {pickBi(PRIVACY.intro, isKo)}
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              {pickBi(PRIVACY.h1, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b1_1, isKo)}
            </Text>
            <Text style={[styles.accordionText, { paddingLeft: 10 }]}>
              {pickBi(PRIVACY.b1_2, isKo)}
            </Text>
            <Text style={[styles.accordionText, { paddingLeft: 10 }]}>
              {pickBi(PRIVACY.b1_3, isKo)}
            </Text>
            <Text
              style={[
                styles.accordionText,
                { paddingLeft: 10, marginBottom: 10 },
              ]}
            >
              {pickBi(PRIVACY.b1_4, isKo)}
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              {pickBi(PRIVACY.h2, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b2_1, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b2_2, isKo)}
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              {pickBi(PRIVACY.b2_3, isKo)}
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              {pickBi(PRIVACY.h3, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b3_1, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b3_2, isKo)}
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              {pickBi(PRIVACY.b3_3, isKo)}
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              {pickBi(PRIVACY.h4, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b4_1, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.b4_2, isKo)}
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              {pickBi(PRIVACY.b4_3, isKo)}
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              {pickBi(PRIVACY.h5, isKo)}
            </Text>
            {/* ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 옛 "고객센터로 문의해 주세요" 완전삭제 §19.
                사유 = 방침이 "탈퇴 요청 시 즉시 파기"를 약속해 놓고 정작 앱에 탈퇴 수단이 없어 문의로 떠넘기고 있었다.
                자리 = 권리 문단 바로 아래(읽고 그 자리에서 누름). 로그아웃과 떨어져 있어 오조작도 없다.
                표시 = 아이콘 + "탈퇴" 두 글자(§23 = 설명은 버튼 밖 안내줄로). */}
            <Text style={[styles.accordionText, { marginBottom: 8 }]}>
              {pickBi(PRIVACY.rightsNotice, isKo).replace(
                "{email}",
                SUPPORT_EMAIL,
              )}
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 8 }]}>
              {pickBi(PRIVACY.withdrawNotice, isKo)}
            </Text>
            {isAuth && (
              <Pressable
                style={[
                  styles.chipBtn,
                  { borderColor: "#FCA5A5", alignSelf: "flex-start" },
                ]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t("profile.withdrawA11y")}
                accessibilityState={{ disabled: deletingAccount }}
              >
                <View style={styles.faqQRow}>
                  <Icon name="x-circle" size={15} color="#DC2626" />
                  <Text style={[styles.chipBtnText, { color: "#DC2626" }]}>
                    {deletingAccount
                      ? t("common.processing")
                      : t("profile.withdraw")}
                  </Text>
                </View>
              </Pressable>
            )}
            <View style={{ height: 6 }} />

            <View
              style={{
                height: 1,
                backgroundColor: "#CBD5E1",
                marginVertical: 10,
              }}
            />

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginBottom: 6 },
              ]}
            >
              {pickBi(PRIVACY.extH, isKo)}
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 8 }]}>
              {pickBi(PRIVACY.extIntro, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.extGoogle, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.extKakao, isKo)}
            </Text>
            <Text style={styles.accordionText}>
              {pickBi(PRIVACY.extApple, isKo)}
            </Text>
          </View>
        )}

        {/* 4. 도움말 및 고객센터 아코디언 */}
        <Pressable
          style={[
            styles.accordionItemHeader,
            { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
          ]}
          onPress={() => toggleAccordion("help")}
        >
          <View style={styles.accordionItemLeft}>
            <View
              style={[
                styles.menuIconCircle,
                { backgroundColor: "rgba(245, 158, 11, 0.12)" },
              ]}
            >
              <Icon name="help-circle" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.accordionItemLabel}>{t("profile.help")}</Text>
          </View>
          <Icon
            name={expandedKey === "help" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>
        {expandedKey === "help" && (
          <View style={styles.accordionBody}>
            {/* ⚠️ 수정금지(승인필요) 2026-08-03 사장님 승인 = 옛 '손안에 가이드'(카메라 전용 앱) FAQ 전면 교체.
                지금 TRIPIS 실제 기능 기준 = 사용자가 헷갈릴 수 있는 화면·버튼 위주로 재구성 = §19.
                이모지 금지(사장님 지시) → lucide 아이콘 1벌(Icon.tsx ICON_MAP 기존 목록에서만 사용). */}
            <Text
              style={[
                styles.accordionText,
                {
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#0F172A",
                  marginBottom: 10,
                },
              ]}
            >
              {pickBi(FAQ_HEADING, isKo)}
            </Text>

            {HELP_FAQ.map((item, i) => (
              <View key={item.icon} style={i > 0 ? { marginTop: 12 } : null}>
                <View style={styles.faqQRow}>
                  <Icon name={item.icon} size={15} color="#64748B" />
                  <Text
                    style={[
                      styles.accordionText,
                      { fontWeight: "bold", color: "#0F172A", flex: 1 },
                    ]}
                  >
                    {pickBi(item.q, isKo)}
                  </Text>
                </View>
                <Text style={styles.accordionText}>
                  ▸ {pickBi(item.a, isKo)}
                </Text>
              </View>
            ))}

            {/* ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 = 고객센터 대표 메일 + 바로 보내기 링크.
                주소 상수 1벌(SUPPORT_EMAIL) = 개인정보 방침 §5 도 같은 값을 쓴다(두 곳에 손으로 적으면 갈라짐 §0). */}
            <View
              style={{
                height: 1,
                backgroundColor: "#CBD5E1",
                marginVertical: 12,
              }}
            />
            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginBottom: 6 },
              ]}
            >
              {t("profile.contactUs")}
            </Text>
            <Pressable
              style={styles.faqQRow}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="link"
              accessibilityLabel={t("profile.contactEmailA11y", {
                email: SUPPORT_EMAIL,
              })}
            >
              <Icon name="send" size={15} color={Brand.primary} />
              <Text
                style={[
                  styles.accordionText,
                  { color: Brand.primary, textDecorationLine: "underline" },
                ]}
              >
                {SUPPORT_EMAIL}
              </Text>
            </Pressable>
          </View>
        )}

        {/* 5. 🛡️ '관리자' (독립 모달창 즉시 열림) */}
        <Pressable
          style={[
            styles.accordionItemHeader,
            { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
          ]}
          onPress={() => navigation.navigate("AdminModal")}
        >
          <View style={styles.accordionItemLeft}>
            <View
              style={[
                styles.menuIconCircle,
                { backgroundColor: "rgba(100, 116, 139, 0.12)" },
              ]}
            >
              <Icon name="shield" size={18} color="#64748B" />
            </View>
            <Text style={styles.accordionItemLabel}>{t("profile.admin")}</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#CBD5E1" />
        </Pressable>
      </View>

      {/* 🚪 개별 하단 분리 대형 로그아웃 카드 */}
      {isAuth && (
        <Pressable style={styles.logoutSeparateCard} onPress={handleLogout}>
          <Icon name="log-out" size={20} color="#EF4444" />
          <Text style={styles.logoutSeparateText}>{t("profile.logout")}</Text>
        </Pressable>
      )}
    </View>
  );
}
