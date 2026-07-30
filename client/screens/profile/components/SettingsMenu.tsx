// 설정 및 계정 섹션 (입체감 3D 칼라 아이콘 서클 & 가득 채움 레이아웃)
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles } from "../styles";
import { shortDateCard } from "../utils"; // 날짜 서식 = 여정 카드와 같은 1벌(§16)
import type { ProfileApi } from "../hooks/useProfile";

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
    transactions,
    recharging,
    handleRecharge,
    pricing,
  } = profile;

  // 아코디언 및 언어 풀다운 드롭다운 상태
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState<boolean>(false);
  // 영수증 내역 펼침 = 결제 관리 아코디언 안에서만 쓰는 상태(2026-07-29 §9)
  const [showReceipts, setShowReceipts] = useState<boolean>(false);

  // 최근 충전 1건 = 장부의 결제 줄(type='purchase') 중 최신. 서버가 최신순으로 주므로 첫 건.
  //   날짜 서식 = 같은 폴더 utils.shortDateCard 재사용(§16). 여정 카드와 같은 서식이라 화면 안에서 갈리지 않는다.
  //   (옛 toLocaleDateString 재발명 폐기 = 2026-07-29 §16 = 플랫폼마다 서식이 달라짐)
  const lastPurchase = transactions.find((tx) => tx.type === "purchase");
  const lastTopUp = lastPurchase
    ? `${shortDateCard(lastPurchase.createdAt)} ${lastPurchase.amount} 크레딧`
    : "없음";
  // 충전 1회 금액·크레딧 = 서버 정본(GET /api/credits/pricing). 못 받았으면 그 문구만 생략(하드코딩 금지).
  const priceNote = pricing
    ? ` · 충전 1회 €${pricing.priceEur} = ${pricing.purchaseCredits} 크레딧`
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
        <ThemedText style={styles.sectionTitle}>설정</ThemedText>
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
            <Text style={styles.accordionItemLabel}>결제 관리</Text>
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
              · 안전 결제: Stripe(카드 정보 미저장){priceNote}
            </Text>
            <Text style={styles.accordionText}>· 최근 충전: {lastTopUp}</Text>
            <View style={styles.chipContainer}>
              <Pressable
                style={[
                  styles.chipBtn,
                  {
                    borderColor: Brand.primary,
                    backgroundColor: "rgba(66, 133, 244, 0.1)",
                  },
                ]}
                onPress={handleRecharge}
                disabled={recharging}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="크레딧 충전"
                accessibilityState={{ disabled: recharging, busy: recharging }}
              >
                <Text style={[styles.chipBtnText, { color: Brand.primary }]}>
                  {recharging ? "진행 중" : "충전"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chipBtn, { borderColor: "#CBD5E1" }]}
                onPress={() => setShowReceipts((prev) => !prev)}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="영수증 내역"
                accessibilityState={{ expanded: showReceipts }}
              >
                <Text style={[styles.chipBtnText, { color: "#0F172A" }]}>
                  영수증 내역
                </Text>
              </Pressable>
            </View>
            {showReceipts &&
              (transactions.length === 0 ? (
                <Text style={styles.accordionText}>· 거래 내역이 없습니다</Text>
              ) : (
                transactions.map((tx) => (
                  <Text key={tx.id} style={styles.accordionText}>
                    · {shortDateCard(tx.createdAt)} {tx.description}{" "}
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount} C (잔액{" "}
                    {tx.balance} C)
                  </Text>
                ))
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
              언어 설정 : {currentLang.name}
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
              터치하여 선호 언어로 바로 변경하세요:
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
            <Text style={styles.accordionItemLabel}>개인정보 보호</Text>
          </View>
          <Icon
            name={expandedKey === "privacy" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>
        {expandedKey === "privacy" && (
          <View style={styles.accordionBody}>
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
              개인 정보 처리 방침 (Privacy Policy)
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              손안에 가이드는 사용자의 여행 경험을 돕기 위해 최소한의 정보만을
              수집하며, AI 분석을 위한 데이터 처리에 투명성을 보장합니다.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              1. 수집하는 개인 정보의 항목
            </Text>
            <Text style={styles.accordionText}>
              • 필수 항목: 소셜 로그인(Google, Kakao)을 통해 제공받은 이메일
              주소, 이름, 프로필 사진.
            </Text>
            <Text style={styles.accordionText}>
              • 서비스 이용 과정에서 생성/수집되는 정보:
            </Text>
            <Text style={[styles.accordionText, { paddingLeft: 10 }]}>
              - 이미지 및 음성: AI 분석을 위해 사용자가 업로드하거나 촬영한
              사진, 녹음된 음성 데이터.
            </Text>
            <Text style={[styles.accordionText, { paddingLeft: 10 }]}>
              - 위치 정보: 가이드 생성 및 지도 표시를 위한 GPS 위도/경도 데이터
              (촬영 시 메타데이터 포함).
            </Text>
            <Text
              style={[
                styles.accordionText,
                { paddingLeft: 10, marginBottom: 10 },
              ]}
            >
              - 결제 정보: 크레딧 충전 시 Stripe를 통해 처리되는 결제 내역 (카드
              정보는 서버에 저장되지 않음).
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              2. 개인 정보의 수집 및 이용 목적
            </Text>
            <Text style={styles.accordionText}>
              • 서비스 제공: Gemini AI를 활용한 이미지/음성 분석 및 여행
              가이드(상세페이지) 콘텐츠 생성.
            </Text>
            <Text style={styles.accordionText}>
              • 회원 관리: 개인 식별, 보관함 데이터 동기화, 불량 회원의 부정
              이용 방지.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • 리워드 지급: 친구 추천 크레딧 지급 및 캐시백 처리를 위한 식별.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              3. 개인 정보의 보유 및 이용 기간
            </Text>
            <Text style={styles.accordionText}>
              • 회원 정보: 회원 탈퇴 시까지 보유하며, 탈퇴 요청 시 즉시
              파기합니다.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • 이미지 데이터: AI 분석 완료 후 즉시 삭제되거나, 사용자의
              '보관함' 기능 제공을 위해 암호화된 데이터베이스 또는 보안
              스토리지에 보관됩니다.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              4. 제3자 제공 및 위탁
            </Text>
            <Text style={styles.accordionText}>
              서비스 향상을 위해 다음과 같이 외부 전문 업체에 일부 업무를
              위탁합니다.
            </Text>
            <Text style={styles.accordionText}>
              • AI 분석: Google (Gemini API) - 이미지 및 텍스트 분석.
            </Text>
            <Text style={styles.accordionText}>
              • 결제 처리: Stripe - 크레딧 충전 결제 대행.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • 데이터 호스팅: Replit/Neon - 서비스 서버 및 데이터베이스 운영.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              5. 정보 주체의 권리
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 14 }]}>
              사용자는 언제든지 자신의 개인 정보를 열람, 수정하거나 회원
              탈퇴(데이터 삭제)를 요청할 수 있습니다. 설정 &gt; 데이터 관리
              메뉴에서 '내 데이터 다운로드'를 요청할 수 있습니다.
            </Text>

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
              외부 서비스 연결 및 권리 해제
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 8 }]}>
              사용자는 소셜 로그인을 통해 연결된 외부 서비스의 접근 권한을
              언제든지 관리할 수 있습니다.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              1. 연결된 계정 목록
            </Text>
            <Text style={styles.accordionText}>
              현재 손안에 가이드는 간편 로그인을 위해 다음 서비스와 연결될 수
              있습니다.
            </Text>
            <Text style={styles.accordionText}>
              • Google 계정: 이메일, 프로필 사진 접근.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • Kakao 계정: 프로필 정보 접근.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              2. 접근 권한 해제 방법
            </Text>
            <Text style={styles.accordionText}>
              앱 내에서 '로그아웃' 또는 '탈퇴'를 하더라도 소셜 서비스 상의 연결
              고리는 남아있을 수 있습니다. 아래 방법을 통해 직접 연결을 해제할
              수 있습니다.
            </Text>
            <Text style={styles.accordionText}>
              • Google: [Google 계정 &gt; 데이터 및 개인 정보 보호 &gt; 내
              계정에 액세스할 수 있는 앱]에서 'My Hand Guide' 연결 해제.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • Kakao: [카카오톡 설정 &gt; 카카오계정 &gt; 연결된 서비스
              관리]에서 연결 해제.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              3. 데이터 삭제 요청
            </Text>
            <Text style={styles.accordionText}>
              타사 앱 연결을 해제한 후, 손안에 가이드 서버에 저장된 모든
              데이터의 영구 삭제를 원하실 경우, 설정 페이지의 [회원 탈퇴] 기능을
              이용해 주시기 바랍니다.
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
            <Text style={styles.accordionItemLabel}>도움말 및 고객센터</Text>
          </View>
          <Icon
            name={expandedKey === "help" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>
        {expandedKey === "help" && (
          <View style={styles.accordionBody}>
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
              자주 묻는 질문 (FAQ)
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              Q1. 앱이 처음에 바로 안 열리거나 멈춘 것 같아요!
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 12 }]}>
              🚀 조금만 기다려주세요! 앱을 처음 실행할 때 최신 기능을 준비하느라
              약 3초 정도의 로딩 시간이 필요할 수 있습니다. 만약 계속 반응이
              없다면 브라우저를 새로고침해 주세요. 또한, 이 앱은 크롬(Chrome)
              브라우저에 최적화되어 있습니다. AI가 최고의 설명을 들려드리기
              위해서는 카메라, 마이크, 위치 정보 권한 승인이 반드시 필요하니 꼭
              허용해 주세요!
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              Q2. AI 설명이 더 정확하게 나오게 하려면 어떻게 찍어야 하나요?
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 12 }]}>
              📸 AI에게 힌트를 주세요! 사진을 찍으실 때, 단순히 대상만 찍기보다
              작품의 이름표(캡션)나 가게의 간판/현판 글자가 함께 나오도록 촬영해
              보세요. 글자 정보를 포함하면 AI가 훨씬 더 정확하고 깊이 있는
              해설을 들려드릴 수 있답니다.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              Q3. 한국어 말고 다른 언어로도 들을 수 있나요?
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 12 }]}>
              🌍 설정이 필요할 수 있어요. 기본적으로 한국어에 최적화되어
              있습니다. 만약 다른 언어를 선택하실 경우, 앱 내의 일부 음성 설명이
              지원되지 않거나 매끄럽지 않을 수 있습니다. 원활한 청취를 위해
              사용자님 모바일 기기의 '텍스트 읽어주기(TTS) 설정'을 해당 언어에
              맞게 최적화해 주시는 것을 권장합니다.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              Q4. 인터넷이 안 터지는 박물관이나 붐비는 여행지에서도 쓸 수
              있나요?
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 12 }]}>
              ✈️ 물론입니다! 한 번 열어본 공유 페이지(링크)는 인터넷 연결이
              끊겨도 완벽하게 재생됩니다. 여행 떠나기 전이나 숙소에서 미리
              링크를 열어두기만 하면, 데이터 걱정 없이 어디서든 나만의 가이드를
              즐길 수 있어요.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              Q5. 크레딧은 어떻게 사용되고, 충전은 어떻게 하나요?
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 12 }]}>
              💰 사진을 분석하고 해설을 만들 때마다 크레딧이 사용돼요. 처음
              가입하시면 무료 크레딧을 드리고, 친구에게 이 앱을 추천해서 친구가
              가입하면 두 분 모두에게 보너스 크레딧을 드립니다! 물론, 부족하면
              언제든 프로필 페이지에서 충전할 수도 있어요.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              Q6. 저장한 가이드 내용을 수정할 수 있나요?
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 8 }]}>
              😅 수정은 어려워요. 아쉽게도 한 번 만들어진 가이드는 내용 수정이
              어렵습니다. 만약 설명이 마음에 들지 않는다면, 삭제 후 Q2번의 팁을
              활용해 새로운 사진으로 다시 가이드를 생성해 보세요. 더 멋진 해설이
              기다리고 있을지도 몰라요!
            </Text>
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
            <Text style={styles.accordionItemLabel}>관리자</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#CBD5E1" />
        </Pressable>
      </View>

      {/* 🚪 개별 하단 분리 대형 로그아웃 카드 */}
      {isAuth && (
        <Pressable style={styles.logoutSeparateCard} onPress={handleLogout}>
          <Icon name="log-out" size={20} color="#EF4444" />
          <Text style={styles.logoutSeparateText}>로그아웃</Text>
        </Pressable>
      )}
    </View>
  );
}
