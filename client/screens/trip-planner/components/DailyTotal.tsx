// 일별 합계(입장료·식비·교통비) 섹션 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
import {
  buildDayRouteUrl,
  openMapsUrl,
  type DayRouteStop,
} from "@/lib/openPlaceInMaps";

// 이동 과다 경고 기준 = 당일 운전 6시간 초과(시뮬 실증: 좌표불량 일정 = 13~26시간으로 즉시 적발됨)
const DAY_DRIVE_WARN_SEC = 6 * 3600;

export default function DailyTotal({
  currentDay,
  planner,
}: {
  currentDay: DayPlan;
  planner: PlannerApi;
}) {
  const { theme, t, itinerary, dayAccommodations, requestExpert } = planner;
  // 백엔드 dailyCost에서 직접 읽기
  const dc = (currentDay as any)?.dailyCost;
  const td = (currentDay as any)?.transportDisplay;
  const entranceEur = dc?.breakdown?.entranceEur || 0;
  const mealEur = dc?.breakdown?.mealEur || 0;
  const transportEur = dc?.breakdown?.transportEur || 0;
  const totalEur = dc?.perPersonEur || entranceEur + mealEur + transportEur;

  // ⚠️ 2026-07-24 사장님 SSOT = 버튼 노출 = 드라이빙 가이드 여정만. 판별 = metadata.transportCategory 단일 소스(§0 폴백 금지)
  //   = 모든 파이프라인(DB-only ag4·MIX v3) 공통 방출 = DB 실측(i87~i107) 전 여정 존재. day 레벨 transportDisplay 는 db-only 미방출 = 판별 부적합(실측).
  const isGuide = (itinerary as any)?.metadata?.transportCategory === "guide";

  const [routeLoading, setRouteLoading] = useState(false);
  const [eta, setEta] = useState<{
    durationSec: number;
    distanceKm: number;
  } | null>(null);

  // [n일차 동선 바로가기] = 선처리(실시간 실소요시간·거리 = day-live) 후 딥링크 최종 노출(사장님 SSOT 2026-07-24).
  //   순서 = 클릭 시점 화면 상태 그대로(숙소 출발 포함 = 이미 구현된 동적 재배열 결과). 선처리 실패 = 딥링크만 오픈(기능 불중단).
  const onOpenRoute = async () => {
    if (routeLoading) return;
    const accom =
      dayAccommodations?.find((a) => a.day === currentDay.day) ||
      currentDay.accommodation ||
      null;
    // 클릭 시점 화면 순서(숙소 출발 포함) = 좌표 배열. 슬롯 rawData 엔 PID 미탑재라 좌표만 확실.
    const stops: DayRouteStop[] = [
      ...(accom?.coords
        ? [
            {
              name: accom.name, // 숙소 로컬명(폴백 텍스트). 라벨은 placeId 있으면 구글 통제.
              lat: accom.coords.lat,
              lng: accom.coords.lng,
              googlePlaceId: accom.placeId,
            },
          ]
        : []),
      ...(currentDay.places || [])
        .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
        .map((p) => ({
          name: p.name, // 폴백 텍스트 = 슬롯 로컬명(구글 실제명) = place_id 실패 시 정확 검색(한국어명은 오매칭 위험 = 콜마르 실증)
          lat: p.lat,
          lng: p.lng,
          googlePlaceId: (p as any).googlePlaceId,
        })),
    ];
    if (stops.length < 2) return;
    setRouteLoading(true);
    // 웹 = 팝업차단 회피: 사용자 제스처 동기 시점에 창 먼저 열고 → 선처리 후 URL 주입
    const pre =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.open("", "_blank")
        : null;
    let url = buildDayRouteUrl(stops); // 폴백 = 좌표/슬롯명(day-live 실패 대비)
    try {
      const res = await fetch(
        new URL("/api/routes/day-live", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stops: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.durationSec != null) setEta(data);
        // ⚠️ day-live 가 PSR 에서 PID+이름 보충 → 딥링크에 주소 대신 장소명(사장님 SSOT 2026-07-24).
        //   화면 라벨 = place_id 의 구글 공식명(기기 언어) = 구글 통제(실증). 우리 텍스트는 place_id 실패 시 폴백뿐 → 로컬명(구글 실제명) 우선 = 오매칭(콜마르) 방지.
        if (Array.isArray(data.stops) && data.stops.length === stops.length) {
          const enriched: DayRouteStop[] = stops.map((s, i) => ({
            name: data.stops[i]?.nameLocal || data.stops[i]?.nameKo || s.name,
            lat: s.lat,
            lng: s.lng,
            googlePlaceId: data.stops[i]?.placeId || s.googlePlaceId,
          }));
          url = buildDayRouteUrl(enriched) || url;
        }
      }
    } catch {
      // 선처리 실패 = 폴백 URL 로 오픈(기능 불중단)
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
            · 1인 €{td.perPersonPerDay}/일
          </Text>
          {td.category === "guide" && td.uberBlackComparison && (
            <Text style={{ fontSize: 11, color: "#666" }}>
              vs 우버블랙 시간제 1인 €{td.uberBlackComparison.perPersonPerDay}
              /일
            </Text>
          )}
          {td.category === "transit" && td.guideUpsell && (
            <Text style={{ fontSize: 11, color: "#666" }}>
              드라이빙 가이드 이용시 1인 €{td.guideUpsell.perPersonPerDay}/일
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
          <Text style={[styles.dailyTotalValue, { color: theme.text }]}>
            {/* ⚠️ 2026-07-04 사장님 SSOT = 대중교통 구간당 €3 균일 예상가 기반 합산 = "(예상)" 명시로 정직 표기 */}
            €{transportEur.toFixed(1)} ({t("trip.estimated")})
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
              <Text style={[styles.dailyActionText, { color: Brand.primary }]}>
                {t("trip.dayOpenRoute", { day: currentDay.day })}
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
              <Text style={[styles.dailyActionText, { color: "#FFF" }]}>
                {t("trip.dayBookNow", { day: currentDay.day })}
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
