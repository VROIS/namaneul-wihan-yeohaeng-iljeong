import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Brand, Spacing, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { getVibeLabel } from "@/utils/vibeCalculator";
import ItineraryMap from "@/components/ItineraryMap";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
// 🎬 2026-08-01 사장님 §B-0 = 영상 진입점은 통합 모달 1벌(TripisModal). 옛 전용 화면 이동 폐기 §19.
import TripisModal from "@/components/tripis/TripisModal";
import { shortDate, fitTextPropsSingleLine } from "./utils";
import DaySection from "./components/DaySection";
import AiOpinionSheet from "./components/AiOpinionSheet";
import { resultStyles } from "./styles/result";
import { inputStyles } from "./styles/input";
import { displayCityName } from "@/lib/display-city-name";
import type { PlannerApi } from "./hooks/useTripPlanner";

const styles = { ...resultStyles, pickerTitle: inputStyles.pickerTitle };

export default function ResultStep({ planner }: { planner: PlannerApi }) {
  const {
    theme,
    insets,
    t,
    i18n,
    itinerary,
    setScreen,
    isSaving,
    justSaved,
    handleSaveItinerary,
    currentItineraryId,
    restoredTrip,
    formData,
    dayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    handleSetDayAccommodation,
    isReoptimizing,
    handleShareItinerary,
    handleSaveCalendar,
    sharingAction,
    resultScrollRef,
    slotLayoutsRef,
    dayLayoutsRef,
    currentMapDay,
    setCurrentMapDay,
    selectedSlotId,
    setSelectedSlotId,
  } = planner;

  const [tripisOpen, setTripisOpen] = useState(false);

  if (!itinerary) return null;

  return (
    <View
      style={[
        styles.resultContainer,
        { backgroundColor: theme.backgroundRoot },
      ]}
    >
      <View
        style={[styles.resultHeader, { paddingTop: insets.top + Spacing.sm }]}
      >
        <Pressable
          // ⚠️ 2026-07-31 사장님 지시(BTS 문제점1) = BTS 로 열렸으면 카드 화면 복귀, 메인은 입력화면(단일 출구 1벌)
          onPress={planner.handleExitResult}
          style={styles.headerButton}
        >
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        {/* ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 도시명 단독 큰 제목 완전삭제(§19) = 헤더는
            뒤로가기·저장 버튼만(순수 기능행, 최소 높이). 도시명은 날짜와 결합해 아래 요약섹션 첫 줄로 이동
            (프랑스어 등 긴 언어에서 "여행요약" 설명줄이 잘리던 문제 = 이 줄 하나 없앤 여백으로 해결). */}
        {/* 🎬 2026-07-22 사장님 SSOT = 신규 여정 = 💾 저장버튼 원래 기능 그대로(저장 후에도 유지).
            프로필 카드로 복원한 저장 여정에서만 = 저장버튼 자리가 영상 버튼으로 전환.
            2026-08-01 §B-0 = 영상 버튼 = 통합 모달을 이 화면 위에 연다(화면 이동 없음).
            ⚠️ [대표 올리기] = 프로필 '나의 여정' 카드로 이관 = 2026-08-02 사장님 지시 §19(여기서는 완전삭제). */}
        {restoredTrip && currentItineraryId ? (
          <Pressable
            style={styles.headerButton}
            onPress={() => setTripisOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("trip.cityCardVideo")}
          >
            <Icon name="film" size={22} color={Brand.primary} />
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.headerButton,
              justSaved && { backgroundColor: "#22c55e" },
            ]}
            onPress={handleSaveItinerary}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Icon
                name={justSaved ? "check" : "save"}
                size={22}
                color={justSaved ? "#FFFFFF" : theme.text}
              />
            )}
          </Pressable>
        )}
      </View>

      {/* 📊 요약 섹션: 날짜+도시명(굵게, 1줄) + 장소수·1인예산(2줄) = 한 섹션(사장님 승인 2026-08-16).
          도시명 단독 큰 제목(헤더)을 없앤 자리를 여기로 흡수 = 그만큼 위 여백 확보(§ 아래 description 2줄 허용과 연동). */}
      <View
        style={[
          styles.tripSummarySection,
          { backgroundColor: theme.backgroundSecondary },
        ]}
      >
        {/* ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 도시명만 굵게(날짜는 보통 굵기) = 도시명이
            부각돼야 함(둘 다 굵으면 효과 반감). 같은 Text 안에서 중첩 Text로 부분만 굵게 처리.
            = 왼쪽끝부터 시작(가운데정렬 X, tripDate textAlign:left) = 날짜가 왼쪽을 채워 굵은
            도시명이 자연히 줄 중간에 위치. "·" 대신 스페이스 2칸(불필요한 점 제거). */}
        <Text style={[styles.tripDate, { color: theme.text }]}>
          {shortDate(itinerary.startDate)} ~ {shortDate(itinerary.endDate)}
          {"  "}
          <Text style={[styles.tripCityName, { color: theme.text }]}>
            {displayCityName(itinerary)}
          </Text>
        </Text>
        <View style={styles.tripSummaryRow}>
          <View style={styles.tripSummaryItem}>
            <Icon name="map-pin" size={14} color={theme.textSecondary} />
            <Text style={[styles.tripSummaryText, { color: theme.text }]}>
              {t("common.places", {
                count: (itinerary.days || []).reduce(
                  (sum, d) => sum + (d.places?.length || 0),
                  0,
                ),
              })}
            </Text>
          </View>
          {(() => {
            const totalPerPerson = (itinerary.days || []).reduce(
              (sum: number, d: any) => sum + (d.dailyCost?.perPersonEur || 0),
              0,
            );
            if (totalPerPerson > 0) {
              return (
                <View style={styles.tripSummaryItem}>
                  <Icon name="credit-card" size={14} color={Brand.primary} />
                  <Text
                    style={[
                      styles.tripSummaryText,
                      { color: Brand.primary, fontFamily: Fonts.bold },
                    ]}
                  >
                    {t("common.perPerson")} €{totalPerPerson.toFixed(0)}
                  </Text>
                </View>
              );
            }
            return null;
          })()}
        </View>
      </View>

      {/* 📊 요약 섹션 2: "누구를 위한 X 여행" + 예상 비용 */}
      <View
        style={[
          styles.tripOptionsRow,
          { backgroundColor: `${Brand.primary}08` },
        ]}
      >
        <View style={styles.tripDescriptionContainer}>
          {/* ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 2줄까지 허용(프랑스어 등 긴 언어에서 잘리던
              문제, 한국어는 원래 문제없었음). flexShrink=스타일에서 부여(§ styles/result.ts 주석 참고). */}
          <Text
            style={[styles.tripDescriptionText, { color: theme.text }]}
            numberOfLines={2}
          >
            {(() => {
              const focusLabels: Record<string, string> = {
                Kids: t("labels.curationKids"),
                Parents: t("labels.curationParents"),
                Everyone: t("labels.curationEveryone"),
                Self: t("labels.curationSelf"),
              };
              const curationFocus =
                (itinerary as any).metadata?.curationFocus ||
                formData.curationFocus ||
                "Everyone";
              const focusLabel =
                focusLabels[curationFocus] || t("labels.curationEveryone");

              const companionLabels: Record<string, string> = {
                Single: t("labels.companionSingle"),
                Couple: t("labels.companionCouple"),
                Family: t("labels.companionFamily"),
                ExtendedFamily: t("labels.companionExtended"),
                Group: t("labels.companionGroup"),
              };
              const companionType =
                itinerary.companionType || formData.companionType || "Couple";
              const companionLabel =
                companionLabels[companionType] || t("labels.companionFamily");

              // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = 선택한 vibe 전부 표시(최대 3개). 옛 slice(0,2)(상위 2개만) 폐기(§19) = 3번째 선호도 누락 버그 수정.
              const vibes =
                itinerary.vibeWeights
                  ?.slice(0, 3)
                  .map((v) => getVibeLabel(v.vibe))
                  .join(" & ") || t("options.healing");

              const count =
                itinerary.companionCount || formData.companionCount || 2;
              // ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 한국어 조사(을/를)는 한국어 문장에서만 필요
              const lastChar = focusLabel.charCodeAt(focusLabel.length - 1);
              const hasFinalConsonant =
                lastChar >= 0xac00 &&
                lastChar <= 0xd7a3 &&
                (lastChar - 0xac00) % 28 !== 0;
              const objParticle =
                i18n.language === "ko" ? (hasFinalConsonant ? "을" : "를") : "";
              return t("trip.tripFor", {
                companion: companionLabel,
                count,
                focus: focusLabel,
                particle: objParticle,
                vibes,
              });
            })()}
          </Text>
          {/* ⚠️ 2026-06-24 사용자 SSOT = 1인 가격 배지 삭제 (요약섹션1 "1인 €N"과 중복, §19 완전삭제) */}
        </View>
      </View>

      {/* ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = 지도 고정섹션(항상표시, 토글폐기 §19) = BTS 패턴.
            전 슬롯 마커 + 마커클릭→슬롯 스크롤 + 출발 깃발(숙소 미설정=도심중심 / 설정=숙소). 동선 polyline 폐기. */}
      <View style={styles.mapSection}>
        <ItineraryMap
          places={(() => {
            const day =
              (itinerary.days || []).find((d) => d.day === currentMapDay) ||
              itinerary.days?.[0];
            return (day?.places || [])
              .map((p, i) => ({
                id: String(p.id),
                name: (p as any).nameEn || (p as any).nameLocal || p.name, // ⚠️ 2026-08-22 사장님 원칙 = 장소명 노출 nameEn 1순위
                // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 마커 = 취향 슬롯 카테고리(slotCategory) 우선 = "이 여정에서의 역할" 표시.
                seedCategory:
                  (p as any).slotCategory || (p as any).seedCategory || null,
                lat: p.lat,
                lng: p.lng,
                slot: i + 1,
              }))
              .filter((p) => p.lat != null && p.lng != null);
          })()}
          start={(() => {
            // ⚠️ 수정금지(승인필요) 2026-08-13 = 이름은 실제 고른 숙소만. 그 외는 좌표만 쓰고 라벨은 번역 문구.
            const dayAccom = dayAccommodations.find(
              (a) => a.day === currentMapDay,
            );
            if (dayAccom?.coords?.lat) {
              return {
                lat: dayAccom.coords.lat,
                lng: dayAccom.coords.lng,
                label: `${t("trip.departure")}: ${dayAccom.name}`,
              };
            }
            const autoCoords =
              (itinerary.days || []).find((d) => d.day === currentMapDay)
                ?.accommodation?.coords || formData.destinationCoords;
            if (autoCoords?.lat)
              return {
                lat: autoCoords.lat,
                lng: autoCoords.lng,
                label: `${t("trip.departure")}: ${t("trip.departureCityCenter", { destination: displayCityName(itinerary) })}`,
              };
            return null;
          })()}
          onMarkerPress={(id) => {
            setSelectedSlotId(id);
            const y = slotLayoutsRef.current[id];
            if (y != null)
              resultScrollRef.current?.scrollTo({
                y: Math.max(0, y - 80),
                animated: true,
              });
          }}
          selectedSlotId={selectedSlotId}
          height={Math.min(260, Dimensions.get("window").height * 0.3)}
          language={i18n.language || "ko"}
        />
      </View>

      <ScrollView
        ref={resultScrollRef}
        style={styles.resultScrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y + 100; // 지도 높이만큼 보정
          let day = 1;
          for (const [d, top] of Object.entries(dayLayoutsRef.current)) {
            if (y >= top) day = Number(d);
          }
          if (day !== currentMapDay) setCurrentMapDay(day);
        }}
      >
        {/* 재최적화 중 로딩 */}
        {isReoptimizing && (
          <View
            style={[
              styles.reoptimizeBar,
              { backgroundColor: `${Brand.primary}10` },
            ]}
          >
            <ActivityIndicator size="small" color={Brand.primary} />
            <Text style={[styles.reoptimizeText, { color: Brand.primary }]}>
              {t("trip.reoptimizing")}
            </Text>
          </View>
        )}

        {/* 🗓️ 전체 날짜 세로 나열 (한 페이지 스크롤) */}
        {(itinerary.days || []).map((currentDay, dayIdx) => (
          <DaySection
            key={dayIdx}
            currentDay={currentDay}
            dayIdx={dayIdx}
            itinerary={itinerary}
            planner={planner}
          />
        ))}
        {/* 2026-07-21 사장님 SSOT = 여정 결과화면 하단 = 여정 공유 / 캘린더 저장 바로가기(구 AI의견·전문가 바로가기 교체, §0/§19). 하단 5탭의 AI의견·전문가검증은 불변. */}
        <View style={styles.shareFooter}>
          <Text style={[styles.shareFooterCta, { color: theme.textSecondary }]}>
            {t("trip.footerCta")}
          </Text>
          <View style={styles.shareFooterRow}>
            {/* 2026-07-22 사장님 실기기 피드백 = 두 버튼이 스피너를 공유해 뭘 눌렀는지 혼동 → sharingAction 으로 분리:
                눌린 버튼만 선택색(파란 배경)으로 전환 + 자기 스피너. 캘린더 저장 = 파란 디폴트 유지(사장님 확정). */}
            <Pressable
              style={({ pressed }) => [
                styles.shareFooterBtn,
                { borderColor: theme.border },
                (pressed || sharingAction === "share") &&
                  styles.shareFooterBtnPrimary,
                sharingAction === "calendar" && { opacity: 0.4 },
              ]}
              onPress={() => handleShareItinerary()}
              disabled={sharingAction !== null}
            >
              {sharingAction === "share" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="share-2" size={18} color={Brand.primary} />
              )}
              <Text
                style={[
                  styles.shareFooterBtnText,
                  {
                    color: sharingAction === "share" ? "#FFFFFF" : theme.text,
                  },
                ]}
                {...fitTextPropsSingleLine}
              >
                {t("trip.footerShare")}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.shareFooterBtn,
                styles.shareFooterBtnPrimary,
                pressed && { opacity: 0.7 },
                sharingAction === "share" && { opacity: 0.4 },
              ]}
              onPress={() => handleSaveCalendar()}
              disabled={sharingAction !== null}
            >
              {sharingAction === "calendar" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="calendar-plus" size={18} color="#FFFFFF" />
              )}
              <Text
                style={[styles.shareFooterBtnText, { color: "#FFFFFF" }]}
                {...fitTextPropsSingleLine}
              >
                {t("trip.footerCalendar")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {/* 🏨 2026-06-29 = 인앱 숙소 모달 완전삭제(§19) → Day헤더 "숙소 설정" 버튼이 출발바 아래 구글 위젯 인라인 토글로 대체 (AOS/웹) */}

      {/* 🎹 2026-07-02 사용자 SSOT = 전체화면 위젯 Modal (iOS 검증본).
            iOS는 키보드 떠도 화면 안줄어(WKWebView 설계) → 인라인 위젯(지도 아래 중간)이 키보드에 가림 → 이 Modal 이 정답이었음.
            🎹 2026-08-13 사장님 확정 = AOS 도 이 검증본 1벌 사용. Android 15+ 가 화면축소를 OS 차원에서 제거 + 시스템웹뷰 150 은
            키보드 떠 있는 동안 웹뷰 크기가 바뀌면 내용을 지움(A36 실기기 실증) → AOS 인라인 폐기(DaySection = 웹 전용화 §19).
            안드로이드 = 위젯 높이 고정(크기변경 0 = 지워질 계기 제거). iOS = 동적 높이 그대로 무변경.
            §19: 구글 위젯(PlaceAutocompleteWidget) 그대로, "담는 그릇"만 전체화면 Modal. 자체 입력창 재발명 아님. */}
      {Platform.OS !== "web" && hotelModalDay != null && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setHotelModalDay(null)}
        >
          <View
            style={[
              styles.hotelIosModal,
              {
                backgroundColor: theme.backgroundRoot,
                paddingTop: insets.top + Spacing.sm,
              },
            ]}
          >
            <View style={styles.hotelIosModalHeader}>
              <Pressable
                onPress={() => setHotelModalDay(null)}
                style={styles.headerButton}
              >
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>
                {t("trip.accommodation")}
              </Text>
              <View style={styles.headerButton} />
            </View>
            <View style={{ marginHorizontal: 12, marginTop: 8, zIndex: 50 }}>
              <PlaceAutocompleteWidget
                placeholder={t("trip.hotelSearchPlaceholder")}
                language={i18n.language || "ko"}
                height={Platform.OS === "android" ? 360 : undefined}
                cityPrefix={
                  itinerary?.destination
                    ? `${itinerary.destination} `
                    : undefined
                }
                onSelect={(place: PlaceSelection) => {
                  if (hotelModalDay != null)
                    handleSetDayAccommodation(hotelModalDay, place);
                  setHotelModalDay(null);
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* 🎬 통합 모달 = 껍데기 1벌(§B-0). 닫으면 params=null 이라 렌더 자체가 끝난다(폴링·재생 중단). */}
      <TripisModal
        visible={tripisOpen}
        params={
          currentItineraryId
            ? // 🎬 여정 결과화면 = **영상 생성기** = 내 여정이므로 전체 일차를 고르고 만들 수 있다(2026-08-03 사장님)
              {
                mode: "itinerary",
                itineraryId: currentItineraryId,
                canGenerate: true,
              }
            : null
        }
        onClose={() => setTripisOpen(false)}
      />

      <AiOpinionSheet planner={planner} />
    </View>
  );
}
