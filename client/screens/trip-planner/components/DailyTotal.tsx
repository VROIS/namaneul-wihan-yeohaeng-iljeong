// ⚠️ 수정금지(승인필요) 2026-07-24 사장님 승인 = 하단 2버튼(일별 동선 바로가기 + 바로 예약하기) = 드라이빙 가이드 여정 전용(핵심 비즈니스).
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Brand, Fonts } from "@/constants/theme";
import { resultStyles as styles } from "../styles/result";
import { DayPlan } from "@/types/trip";
import type { PlannerApi } from "../hooks/useTripPlanner";
import Icon from "@/components/Icon";
import { getApiUrl } from "@/lib/query-client";
import { fitTextPropsSingleLine } from "../utils";
import {
  buildDayRouteUrl,
  openMapsUrl,
  type DayRouteStop,
  type DayRouteEnd,
} from "@/lib/openPlaceInMaps";

const DAY_DRIVE_WARN_SEC = 6 * 3600;

export default function DailyTotal({
  currentDay,
  planner,
}: {
  currentDay: DayPlan;
  planner: PlannerApi;
}) {
  const { theme, t, itinerary, dayAccommodations, requestExpert } = planner;
  const dc = (currentDay as any)?.dailyCost;
  const td = (currentDay as any)?.transportDisplay;
  const entranceEur = dc?.breakdown?.entranceEur || 0;
  const mealEur = dc?.breakdown?.mealEur || 0;
  const transportEur = dc?.breakdown?.transportEur || 0;
  const totalEur = dc?.perPersonEur || entranceEur + mealEur + transportEur;

  // ⚠️ 2026-07-24 사장님 SSOT = 버튼 노출 = 드라이빙 가이드 여정만. 판별 = metadata.transportCategory 단일 소스(§0 폴백 금지)
  const isGuide = (itinerary as any)?.metadata?.transportCategory === "guide";

  const [routeLoading, setRouteLoading] = useState(false);
  const [eta, setEta] = useState<{
    durationSec: number;
    distanceKm: number;
  } | null>(null);

  // [바로가기] = day-live 선처리 후 딥링크 노출(사장님 SSOT 2026-07-24).
  const onOpenRoute = async () => {
    if (routeLoading) return;
    const accom =
      dayAccommodations?.find((a) => a.day === currentDay.day) ||
      currentDay.accommodation ||
      null;
    const cityName = (itinerary as any)?.destination ?? "";
    const placeStops: DayRouteStop[] = (currentDay.places || [])
      .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
      .map((p) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        googlePlaceId: (p as any).googlePlaceId,
      }));
    if (placeStops.length < 1) return;
    const end: DayRouteEnd = accom?.coords
      ? {
          name: accom.name,
          lat: accom.coords.lat,
          lng: accom.coords.lng,
          googlePlaceId: accom.placeId,
        }
      : { name: cityName };
    if (!end.name?.trim() && typeof end.lat !== "number") return; // 도시명·숙소 둘 다 없음
    const accomBody = accom?.coords
      ? {
          lat: accom.coords.lat,
          lng: accom.coords.lng,
          name: accom.name,
          placeId: accom.placeId,
        }
      : null;
    setRouteLoading(true);
    const pre =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.open("", "_blank")
        : null;
    let url = buildDayRouteUrl(placeStops, end, end); // 폴백 = 슬롯 로컬명(day-live 실패 대비)
    try {
      const res = await fetch(
        new URL("/api/routes/day-live", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slots: placeStops.map((s) => ({ lat: s.lat, lng: s.lng })),
            accommodation: accomBody, // 숙소 변경시 = 실소요 왕복 기준
            cityName, // 미설정 시 = 도시명 주소로 왕복
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.durationSec != null) setEta(data);
        if (Array.isArray(data.stops) && data.stops.length >= 1) {
          const wps: DayRouteStop[] = data.stops.map((s: any) => ({
            name: s.nameEn || s.nameLocal || s.nameKo || null, // ⚠️ 2026-08-22 사장님 원칙 = nameEn 1순위
            lat: s.lat,
            lng: s.lng,
            googlePlaceId: s.placeId || null,
          }));
          url = buildDayRouteUrl(wps, end, end) || url;
        }
      }
    } catch {
    } finally {
      if (pre) pre.location.href = url || "about:blank";
      else if (url) openMapsUrl(url);
      setRouteLoading(false);
    }
  };

  const etaText = eta
    ? t("trip.dayLiveEta", {
        time:
          eta.durationSec >= 3600
            ? t("trip.durationHM", {
                h: Math.floor(eta.durationSec / 3600),
                m: Math.round((eta.durationSec % 3600) / 60),
              })
            : t("trip.durationM", {
                m: Math.max(1, Math.round(eta.durationSec / 60)),
              }),
        km: eta.distanceKm.toFixed(1),
      })
    : null;
  const etaWarn = !!eta && eta.durationSec > DAY_DRIVE_WARN_SEC;

  return (
    <View
      style={[
        styles.dailyTotalSection,
        { backgroundColor: theme.backgroundSecondary },
      ]}
    >
      {/* 교통비 카테고리 표시 (A/B 분기) */}
      {td && (
        <View
          style={{
            backgroundColor: td.category === "guide" ? "#E3F2FD" : "#E8F5E9",
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: Fonts.bold,
              color: td.category === "guide" ? "#1565C0" : "#2E7D32",
              marginBottom: 4,
            }}
          >
            {td.category === "guide"
              ? t("trip.guideTransport")
              : t("trip.publicTransport")}{" "}
            · {t("trip.perPersonPerDay", { cost: td.perPersonPerDay })}
          </Text>
          {/* ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 기존에 있던 다국어 키(vsUberBlack/guideUpsell) 재사용(§16) */}
          {td.category === "guide" && td.uberBlackComparison && (
            <Text style={{ fontSize: 11, color: "#666" }}>
              {t("trip.vsUberBlack", {
                cost: td.uberBlackComparison.perPersonPerDay,
              })}
            </Text>
          )}
          {td.category === "transit" && td.guideUpsell && (
            <Text style={{ fontSize: 11, color: "#666" }}>
              {t("trip.guideUpsell", { cost: td.guideUpsell.perPersonPerDay })}
            </Text>
          )}
        </View>
      )}

      <Text style={[styles.dailyTotalTitle, { color: theme.text }]}>
        {t("trip.dailySummary", { day: currentDay.day })}
      </Text>
      <View style={styles.dailyTotalRow}>
        <View style={styles.dailyTotalItem}>
          <Text
            style={[styles.dailyTotalLabel, { color: theme.textSecondary }]}
          >
            {t("trip.entranceFee")}
          </Text>
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            €{entranceEur.toFixed(1)}
          </Text>
        </View>
        <View style={styles.dailyTotalItem}>
          <Text
            style={[styles.dailyTotalLabel, { color: theme.textSecondary }]}
          >
            {t("trip.mealCost")}
          </Text>
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            €{mealEur.toFixed(1)}
          </Text>
        </View>
        <View style={styles.dailyTotalItem}>
          <Text
            style={[styles.dailyTotalLabel, { color: theme.textSecondary }]}
          >
            {t("trip.transportCost")}
          </Text>
          {/* ⚠️ 2026-07-04 사장님 SSOT = 대중교통 구간당 €3 균일 예상가 기반 합산 = "(예상)" 명시로 정직 표기.
              ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 값과 라벨을 별도 줄로 분리(위 주석 근거). */}
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            €{transportEur.toFixed(1)}
          </Text>
          <Text
            style={[styles.dailyTotalValueNote, { color: theme.textSecondary }]}
          >
            ({t("trip.estimated")})
          </Text>
        </View>
      </View>
      <View style={[styles.dailyTotalGrand, { borderTopColor: theme.border }]}>
        <Text style={[styles.dailyTotalGrandLabel, { color: theme.text }]}>
          {t("trip.dailyTotal")}
        </Text>
        <Text style={[styles.dailyTotalGrandValue, { color: Brand.primary }]}>
          €{totalEur.toFixed(1)}
        </Text>
      </View>

      {/* ⚠️ 2026-07-24 사장님 승인 = 드라이빙 가이드 여정 전용 2버튼(일별 고정) = 핵심 비즈니스 */}
      {isGuide && (
        <>
          <View style={styles.dailyActionRow}>
            <Pressable
              style={[
                styles.dailyActionBtn,
                { backgroundColor: `${Brand.primary}1F` },
              ]}
              onPress={onOpenRoute}
              disabled={routeLoading}
            >
              {routeLoading ? (
                <ActivityIndicator size="small" color={Brand.primary} />
              ) : (
                <Icon name="map" size={16} color={Brand.primary} />
              )}
              <Text
                style={[styles.dailyActionText, { color: Brand.primary }]}
                {...fitTextPropsSingleLine}
              >
                {t("trip.dayOpenRoute")}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.dailyActionBtn,
                { backgroundColor: Brand.primary },
              ]}
              onPress={() =>
                requestExpert({ mode: "booking", day: currentDay.day })
              }
            >
              <Icon name="calendar" size={16} color="#FFF" />
              <Text
                style={[styles.dailyActionText, { color: "#FFF" }]}
                {...fitTextPropsSingleLine}
              >
                {t("trip.dayBookNow")}
              </Text>
            </Pressable>
          </View>
          {etaText ? (
            <Text
              style={[
                styles.dailyActionEta,
                { color: etaWarn ? "#C62828" : theme.textSecondary },
              ]}
            >
              {etaText}
              {etaWarn ? ` · ${t("trip.dayLiveWarn")}` : ""}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
