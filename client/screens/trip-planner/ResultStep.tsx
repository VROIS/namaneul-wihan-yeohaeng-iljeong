// 결과 화면(Result step = 헤더·요약·지도·Day목록·전문가푸터·iOS숙소모달·AI의견시트) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
// ⚠️ 2026-06-28 사용자 SSOT = 토글 InteractiveMap → 고정 ItineraryMap(BTSPlaceMap 패턴: 웹/앱 동일·마커클릭·동선라인폐기·출발깃발) 교체(§19)
import ItineraryMap from "@/components/ItineraryMap";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
// 🎬 2026-08-01 사장님 §B-0 = 영상 진입점은 통합 모달 1벌(TripisModal). 옛 전용 화면 이동 폐기 §19.
import TripisModal from "@/components/tripis/TripisModal";
import { shortDate } from "./utils";
import DaySection from "./components/DaySection";
import AiOpinionSheet from "./components/AiOpinionSheet";
import { resultStyles } from "./styles/result";
import { inputStyles } from "./styles/input";
import type { PlannerApi } from "./hooks/useTripPlanner";

// 픽커 계열 공용 키(pickerTitle)는 입력측 스타일 1벌에서 가져와 병합(중복정의 0 = §16)
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

  // 🎬 통합 모달 열림 상태 = 이 화면 위에 그대로 뜬다(화면 이동 없음, §B-0).
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
        <Text style={[styles.resultTitle, { color: theme.text }]}>
          {itinerary.destination}
        </Text>
        {/* 🎬 2026-07-22 사장님 SSOT = 신규 여정 = 💾 저장버튼 원래 기능 그대로(저장 후에도 유지).
            프로필 카드로 복원한 저장 여정에서만 = 저장버튼 자리가 영상 버튼으로 전환.
            2026-08-01 §B-0 = 영상 버튼 = 통합 모달을 이 화면 위에 연다(화면 이동 없음).
            ⚠️ [대표 올리기] = 프로필 '나의 여정' 카드로 이관 = 2026-08-02 사장님 지시 §19(여기서는 완전삭제). */}
        {restoredTrip && currentItineraryId ? (
          <Pressable
            style={styles.headerButton}
            onPress={() => setTripisOpen(true)}
            // 아이콘뿐인 버튼 = 스크린리더용 이름 필수(2026-08-03 §22 판단검증)
            accessibilityRole="button"
            accessibilityLabel="영상"
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

      {/* 📊 요약 섹션 1: 날짜 + 장소수 + 총예산 */}
      <View
        style={[
          styles.tripSummaryRow,
          { backgroundColor: theme.backgroundSecondary },
        ]}
      >
        <View style={styles.tripSummaryItem}>
          {/* 🗓️ 2026-07-03 사용자 SSOT = 날짜 아이콘 제거(숫자가 곧 날짜=중복) + 연도 축약 "2026-07-03"→"26년 07-03"(390px 가격잘림 방지=반응형 공간확보) */}
          <Text style={[styles.tripSummaryText, { color: theme.text }]}>
            {shortDate(itinerary.startDate)} ~ {shortDate(itinerary.endDate)}
          </Text>
        </View>
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
          // 일별 dailyCost 합산으로 총 비용 계산
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

      {/* 📊 요약 섹션 2: "누구를 위한 X 여행" + 예상 비용 */}
      <View
        style={[
          styles.tripOptionsRow,
          { backgroundColor: `${Brand.primary}08` },
        ]}
      >
        <View style={styles.tripDescriptionContainer}>
          <Text style={[styles.tripDescriptionText, { color: theme.text }]}>
            {(() => {
              // 🎯 누구를 위한 (curationFocus 기반)
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
                  .join(" & ") || "힐링";

              // 예: "가족(4명)의 부모님을 위한 힐링 & 미식 여행" (이모지 금지 = 디자인 SSOT §1-3)
              const count =
                itinerary.companionCount || formData.companionCount || 2;
              // ⚠️ 수정금지(승인필요) 2026-06-24 = 한국어 조사(을/를) 받침 판정 = focusLabel 마지막 글자 받침 유무
              //   = "나을"(X) 버그 수정 → 받침 없으면 "를", 있으면 "을" (= 한국어 언어에서만 적용, 타 언어는 조사 없음)
              const lastChar = focusLabel.charCodeAt(focusLabel.length - 1);
              const hasFinalConsonant =
                lastChar >= 0xac00 &&
                lastChar <= 0xd7a3 &&
                (lastChar - 0xac00) % 28 !== 0;
              const objParticle = hasFinalConsonant ? "을" : "를";
              return `${companionLabel}(${count}명)의 ${focusLabel}${objParticle} 위한 ${vibes} 여행`;
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
            // 🗺️ 지도 = 스크롤로 보이는 현재 Day(currentMapDay)의 슬롯만 표시
            const day =
              (itinerary.days || []).find((d) => d.day === currentMapDay) ||
              itinerary.days?.[0];
            // ⚠️ slot 번호 = 카드 번호(index+1)와 일치 = 좌표결손 거르기 전에 index 매김 (마커배지≠카드번호 버그 방지)
            return (day?.places || [])
              .map((p, i) => ({
                id: String(p.id),
                name: (p as any).nameLocal || p.name,
                // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 마커 = 취향 슬롯 카테고리(slotCategory) 우선 = "이 여정에서의 역할" 표시.
                //   = 없으면(옛 저장본·DB-only) 검증 seedCategory 폴백.
                seedCategory:
                  (p as any).slotCategory || (p as any).seedCategory || null,
                lat: p.lat,
                lng: p.lng,
                slot: i + 1,
              }))
              .filter((p) => p.lat != null && p.lng != null);
          })()}
          start={(() => {
            // 출발 깃발 = 현재 Day(currentMapDay) 숙소 ?? 도시중심(destinationCoords)
            const dayAccom =
              dayAccommodations.find((a) => a.day === currentMapDay) ||
              (
                (itinerary.days || []).find(
                  (d) => d.day === currentMapDay,
                ) as any
              )?.accommodation;
            if (dayAccom?.coords?.lat) {
              return {
                lat: dayAccom.coords.lat,
                lng: dayAccom.coords.lng,
                label: `${t("trip.departure")}: ${dayAccom.name}`,
              };
            }
            const c = formData.destinationCoords;
            if (c?.lat)
              return {
                lat: c.lat,
                lng: c.lng,
                label: `${t("trip.departure")}: ${t("trip.departureCityCenter", { destination: itinerary.destination })}`,
              };
            return null;
          })()}
          onMarkerPress={(id) => {
            // 마커 클릭 → 그 슬롯으로 스크롤 + 선택 강조(양방향)
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
        />
      </View>

      <ScrollView
        ref={resultScrollRef}
        style={styles.resultScrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={(e) => {
          // 🗺️ 스크롤 위치 기준 = 화면 상단에 보이는 Day 감지 → 지도 그 Day로 자동 전환
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
              <Text style={[styles.shareFooterBtnText, { color: "#FFFFFF" }]}>
                {t("trip.footerCalendar")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {/* 🏨 2026-06-29 = 인앱 숙소 모달 완전삭제(§19) → Day헤더 "숙소 설정" 버튼이 출발바 아래 구글 위젯 인라인 토글로 대체 (AOS/웹) */}

      {/* 🎹 2026-07-02 사용자 SSOT = iOS 전용 전체화면 위젯 Modal.
            iOS는 키보드 떠도 화면 안줄어(WKWebView 설계) → 인라인 위젯(지도 아래 중간)이 키보드에 가림.
            AOS는 화면축소(adjustResize)로 위젯이 위로밀려 정상 → iOS만 이 Modal로 위젯을 화면 최상단 전체화면에 띄워 동일효과(입력창 맨위+후보 키보드위 공간).
            §19: 구글 위젯(PlaceAutocompleteWidget) 그대로, "담는 그릇"만 iOS 전체화면 Modal (NativePicker(DateTimePickers.tsx) iOS 패턴 재사용). 자체 입력창 재발명 아님. */}
      {Platform.OS === "ios" && hotelModalDay != null && (
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
