// 설정 및 계정 섹션 (입체감 3D 칼라 아이콘 서클 & 가득 채움 레이아웃)
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles } from "../styles";
import { shortDateCard } from "../utils"; // 날짜 서식 = 여정 카드와 같은 1벌(§16)
import type { ProfileApi } from "../hooks/useProfile";

// ❔ 도움말 FAQ = 실제 TRIPIS 기능 기준 재구성(2026-08-03 사장님 승인, 옛 '손안에 가이드' 문서 폐기 §19).
//   icon = client/components/Icon.tsx ICON_MAP 에 이미 있는 이름만 사용(이모지 금지 = 사장님 지시).
const HELP_FAQ: { icon: string; q: string; a: string }[] = [
  {
    icon: "compass",
    q: "앱 하단 5개 버튼(여정 / AI 의견 / 전문가 검증 / 프로필 / Tripis)은 각각 뭔가요?",
    a: "[여정]에서 도시·날짜·스타일을 고르면 나만의 일정이 만들어져요. [AI 의견]과 [전문가 검증]은 만든 여정이 있어야 눌립니다(여정이 없으면 회색으로 비활성화되는 게 정상이에요). [프로필]에서 내가 만든 여정·해설·영상을 다시 볼 수 있고, [Tripis]는 카메라로 여행지를 찍어 바로 해설을 받는 기능이에요.",
  },
  {
    icon: "dollar-sign",
    q: "크레딧은 어디에, 얼마나 쓰이나요?",
    a: "기능별로 정해진 만큼만 차감돼요 — 여정 생성 5 · AI 의견 5 · Tripis 해설 5 · 전문가 검증 10 · 여행 영상 제작 60. 가입하면 50 크레딧을 무료로 드리고, 부족하면 프로필 > 결제 관리에서 충전(€10 = 140 크레딧)할 수 있어요.",
  },
  {
    icon: "bot",
    q: '"AI 의견"과 "전문가 검증"의 차이가 뭔가요?',
    a: "[AI 의견]은 AI가 내 여정을 보고 즉시 조언을 주는 기능이고, [전문가 검증]은 실제 현지 전문가에게 문의해 답변을 받는 기능이에요. 그래서 전문가 검증이 크레딧을 더 씁니다(10크레딧). 두 기능 모두 로그인과 여정 생성이 먼저 필요해요.",
  },
  {
    icon: "book-open",
    q: '각 장소의 "해설 듣기" 버튼을 누르면 뭐가 나오나요?',
    a: "그 장소에 대한 AI 음성 해설이 재생돼요. 처음 듣는 장소라면 해설을 새로 만드는 데 약간의 시간이 걸릴 수 있고, 이미 만들어진 해설이 있으면 바로 재생됩니다. 프로필 > 설정 > 언어 설정에서 고른 언어(7개 언어 지원)로 나와요.",
  },
  {
    icon: "film",
    q: '하루 일정을 "여행 애니메이션"으로 만드는 기능은 뭔가요?',
    a: "여정 화면 우측 상단의 영상 버튼을 누르면, 그 날 일정을 애니메이션 영상으로 만들 수 있어요(60크레딧, 약 4~5분 소요). 만드는 동안 앱을 나가거나 다른 화면을 봐도 괜찮아요 — 완성되면 하단 [Tripis] 탭에 빨간 알림이 뜨고, 눌러보면 완성된 영상이 프로필에 자동으로 올라와 있어요. 이미 만들어진 영상이 있는 날짜는 다시 만들 필요 없이 바로 감상하거나 [저장]으로 내 프로필에 담을 수 있어요.",
  },
  {
    icon: "camera",
    q: "Tripis(카메라 아이콘) 탭은 정확히 뭘 하는 기능인가요?",
    a: "여행 중 궁금한 장소나 작품을 카메라로 찍으면 AI가 그 자리에서 해설을 만들어줘요(5크레딧). 사진과 함께 있는 이름표·간판 글자가 잘 보이게 찍으면 더 정확한 해설을 받을 수 있어요. 궁금한 점은 음성으로 바로 물어볼 수도 있습니다.",
  },
  {
    icon: "star",
    q: "도시 대표 카드에는 왜 내가 만든 여정이 안 뜨나요?",
    a: "첫 화면의 도시 카드는 운영팀이 별 표시로 선정한 대표 여정만 보여줘요. 내가 만든 여정은 자동으로 대표가 되지 않지만, 프로필 > 나의 여정에서 언제든 다시 열어볼 수 있어요.",
  },
  {
    icon: "map",
    q: "일정에 있는 [바로가기] · [바로 예약하기] 버튼은 뭔가요?",
    a: "[바로가기]를 누르면 그 날 전체 일정이 장소마다 구간별로 이어진 구글맵 경로가 바로 열려요. [바로 예약하기]는 그 날 일정을 함께할 드라이빙 가이드와 연결해 드립니다.",
  },
  {
    icon: "share-2",
    q: "일정에 있는 [여정 공유] · [캘린더 저장] 버튼은 뭔가요?",
    a: "[여정 공유]는 완성된 여정을 링크로 만들어 카카오톡·문자 등으로 다른 사람에게 바로 보낼 수 있게 해줘요. [캘린더 저장]은 그 여정의 일정을 내 휴대폰 캘린더 앱에 등록해서 날짜별로 확인할 수 있게 해줘요. 두 기능 모두 로그인이 필요하고, 아직 저장 안 한 여정이면 자동으로 먼저 저장돼요.",
  },
  {
    icon: "user",
    q: "로그인은 어떤 방법으로 할 수 있나요?",
    a: "Google, Kakao, Apple 3가지 소셜 로그인을 지원해요. 별도의 회원가입·비밀번호 없이 간편하게 시작할 수 있습니다.",
  },
];

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
              개인 정보 처리 방침
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              TRIPIS는 여정 생성과 AI 해설 제공에 필요한 최소한의 정보만
              수집하며, AI 데이터 처리 과정을 투명하게 안내합니다.
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
              • 필수: 소셜 로그인(Google·Kakao·Apple)으로 받는 이메일, 이름,
              프로필 사진.
            </Text>
            <Text style={[styles.accordionText, { paddingLeft: 10 }]}>
              - 여정 생성 시: 목적지, 여행 날짜, 동행자 유형·인원, 여행 스타일
              선택값.
            </Text>
            <Text style={[styles.accordionText, { paddingLeft: 10 }]}>
              - Tripis(해설) 이용 시: 촬영·업로드한 사진, GPS 위치정보, AI와
              음성으로 대화할 때의 음성 데이터.
            </Text>
            <Text
              style={[
                styles.accordionText,
                { paddingLeft: 10, marginBottom: 10 },
              ]}
            >
              - 결제 시: Stripe를 통해 처리되는 결제 내역(카드 정보 자체는
              저장하지 않음).
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
              • AI 여정 생성·해설 생성(Google Gemini API 활용).
            </Text>
            <Text style={styles.accordionText}>• 크레딧 차감·잔액 관리.</Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • 회원 식별, '나의 여정'·'나의 TRIPIS' 보관함 동기화.
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
              • 회원 정보: 탈퇴 시까지 보유하며, 탈퇴 요청 시 즉시 파기합니다.
            </Text>
            <Text style={styles.accordionText}>
              • 생성한 여정·해설: 사용자가 직접 삭제(카드의 X)하기 전까지
              보관됩니다.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • 일별 여행 영상: 서비스 콘텐츠로 제작되므로, 프로필에서 숨겨도
              서버에는 보관될 수 있습니다.
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
              • AI 분석: Google(Gemini API) — 사진·텍스트 분석, 지도 표시.
            </Text>
            <Text style={styles.accordionText}>
              • 결제 대행: Stripe — 크레딧 충전 결제 처리.
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 10 }]}>
              • 서버·데이터 보관: Supabase — 서버 운영, 이미지·영상 저장.
            </Text>

            <Text
              style={[
                styles.accordionText,
                { fontWeight: "bold", color: "#0F172A", marginTop: 4 },
              ]}
            >
              5. 이용자의 권리
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 14 }]}>
              언제든 개인정보 열람·수정·삭제(회원 탈퇴)를 요청할 수 있습니다.
              프로필 &gt; 도움말 및 고객센터로 문의해 주세요.
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
              외부 서비스 연결 해제
            </Text>
            <Text style={[styles.accordionText, { marginBottom: 8 }]}>
              앱 안에서 로그아웃·탈퇴해도 소셜 서비스 쪽 연결은 남아있을 수
              있습니다. 아래 방법으로 직접 해제할 수 있습니다.
            </Text>
            <Text style={styles.accordionText}>
              • Google: [Google 계정 &gt; 데이터 및 개인정보 보호 &gt; 내 계정에
              액세스할 수 있는 앱]에서 해제.
            </Text>
            <Text style={styles.accordionText}>
              • Kakao: [카카오톡 설정 &gt; 카카오계정 &gt; 연결된 서비스
              관리]에서 해제.
            </Text>
            <Text style={styles.accordionText}>
              • Apple: [설정 &gt; Apple ID &gt; 암호 및 보안 &gt; Apple로
              로그인을 사용하는 앱]에서 해제.
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
              자주 묻는 질문
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
                    {item.q}
                  </Text>
                </View>
                <Text style={styles.accordionText}>▸ {item.a}</Text>
              </View>
            ))}
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
