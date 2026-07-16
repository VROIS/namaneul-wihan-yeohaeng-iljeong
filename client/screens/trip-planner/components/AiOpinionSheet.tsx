// AI 의견 결과 시트(SnapSheet) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, ScrollView } from "react-native";
import { Brand, Spacing } from "@/constants/theme";
import SnapSheet from "@/components/SnapSheet"; // 배경 여정 보이는 드래그 스냅 시트(peek↔full, 2026-07-14 리서치)
import AiOpinionLoading from "./AiOpinionLoading";
import { resultStyles as styles } from "../styles/result";
import type { PlannerApi } from "../hooks/useTripPlanner";

// 🧠 2026-07-04 사장님 SSOT = AI 의견 1회 호출 = 5크레딧 차감(10유로 충전=20회). 결과 하단에만 조용히 표시.
//   차감 로직 자체는 추후 크레딧 시스템 도입 시 서버가 확정 = 여기선 표시용 상수(한 곳 관리).
const AI_OPINION_CREDIT_COST = 5;

export default function AiOpinionSheet({ planner }: { planner: PlannerApi }) {
  const {
    theme, t, aiOpinionVisible, setAiOpinionVisible,
    aiOpinionLoading, aiOpinionError, aiOpinionData,
  } = planner;
  // 🧠 2026-07-03 사장님 SSOT = "AI 의견" 결과 오버레이. 새 화면 아님 = 여정 화면 위 반투명 dim + 닫기(X) 버튼(기존 hotel Modal 패턴 재활용).
  // ⚠️ 사장님 SSOT 2026-07-14 = AI 의견 오버레이 = 전문가와 완전 동일한 SnapSheet(첫노출 half + 드래그 + 스크롤). 옛 고정 Modal(fade, 88%) 폐기 §19.
  return (
        <SnapSheet visible={aiOpinionVisible} onClose={() => setAiOpinionVisible(false)} title={t("aiOpinion.title")}>
          {aiOpinionLoading ? (
            // 🧠 2026-07-04 사장님 SSOT = 화면전환 후 오버레이 안에서 단계 안내(흐름 바 + 정직한 단계 문구).
            <AiOpinionLoading theme={theme} />
          ) : aiOpinionError ? (
            <Text style={[styles.aiOpinionLoadingText, { color: theme.textSecondary, padding: Spacing.lg }]}>
              {aiOpinionError}
            </Text>
          ) : aiOpinionData ? (
            // ⚠️ 2026-07-03 사장님 SSOT = 상세페이지형 리포트(카드 나열 아님). 이모지 금지. 버튼/링크 추가 금지(하단탭 5개로 충분).
            //   전문가 유도 = 클릭 버튼 아닌 마지막 문단의 자연스러운 한 문장("현지 전문가에게 다시 물어보세요" 톤). ScrollView flex:1 = 시트 높이에 맞춰 스크롤(§19).
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}>
                    {/* 1. 실현 가능성 */}
                    <View style={styles.aiOpinionSection}>
                      <View style={styles.aiOpinionSectionHeader}>
                        <Text style={[styles.aiOpinionSectionTitle, { color: theme.text }]}>
                          {t("aiOpinion.feasibility")}
                        </Text>
                        <Text
                          style={[
                            styles.aiOpinionVerdict,
                            {
                              color:
                                aiOpinionData.feasibility?.verdict === "ok"
                                  ? "#22c55e"
                                  : aiOpinionData.feasibility?.verdict === "risky"
                                    ? "#ef4444"
                                    : "#f59e0b",
                            },
                          ]}
                        >
                          {t(`aiOpinion.verdict.${aiOpinionData.feasibility?.verdict}`)}
                        </Text>
                      </View>
                      <Text style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                        {aiOpinionData.feasibility?.reason}
                      </Text>
                    </View>
                    <View style={[styles.aiOpinionDivider, { backgroundColor: theme.border }]} />

                    {/* 2. 동선 점검 */}
                    <View style={styles.aiOpinionSection}>
                      <Text style={[styles.aiOpinionSectionTitle, { color: theme.text }]}>
                        {t("aiOpinion.routeReview")}
                      </Text>
                      {(aiOpinionData.route_review?.issues || []).map((issue: string, idx: number) => (
                        <Text key={`issue-${idx}`} style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                          {issue}
                        </Text>
                      ))}
                      {(aiOpinionData.route_review?.optimization || []).length > 0 && (
                        <Text style={[styles.aiOpinionSubheading, { color: theme.text }]}>
                          {t("aiOpinion.optimization")}
                        </Text>
                      )}
                      {(aiOpinionData.route_review?.optimization || []).map((opt: string, idx: number) => (
                        <Text key={`opt-${idx}`} style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                          {opt}
                        </Text>
                      ))}
                    </View>
                    <View style={[styles.aiOpinionDivider, { backgroundColor: theme.border }]} />

                    {/* 3. 예상 비용 = 사장님 SSOT: 일자별 1인당 대중교통비+식비+입장료 합산(가장 민감한 항목) */}
                    <View style={styles.aiOpinionSection}>
                      <Text style={[styles.aiOpinionSectionTitle, { color: theme.text }]}>
                        {t("aiOpinion.priceCheck")}
                      </Text>
                      {(aiOpinionData.price_check?.daily || []).map((d: any, idx: number) => (
                        <View key={`day-${idx}`} style={styles.aiOpinionDayBlock}>
                          <Text style={[styles.aiOpinionSubheading, { color: theme.text }]}>
                            Day {d.day}
                          </Text>
                          <View style={styles.aiOpinionPriceRow}>
                            <Text style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                              {t("aiOpinion.transport")}
                            </Text>
                            <Text style={[styles.aiOpinionBody, { color: theme.text }]}>€{d.transport_eur}</Text>
                          </View>
                          <View style={styles.aiOpinionPriceRow}>
                            <Text style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                              {t("aiOpinion.meals")}
                            </Text>
                            <Text style={[styles.aiOpinionBody, { color: theme.text }]}>€{d.meals_eur}</Text>
                          </View>
                          <View style={styles.aiOpinionPriceRow}>
                            <Text style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                              {t("aiOpinion.entrance")}
                            </Text>
                            <Text style={[styles.aiOpinionBody, { color: theme.text }]}>€{d.entrance_eur}</Text>
                          </View>
                          <View style={styles.aiOpinionPriceRow}>
                            <Text style={[styles.aiOpinionSubheading, { color: theme.text }]}>
                              {t("aiOpinion.dayTotal")}
                            </Text>
                            <Text style={[styles.aiOpinionSubheading, { color: Brand.primary }]}>
                              €{d.total_eur}
                            </Text>
                          </View>
                        </View>
                      ))}
                      <View style={[styles.aiOpinionPriceRow, { marginTop: Spacing.sm }]}>
                        <Text style={[styles.aiOpinionSectionTitle, { color: theme.text }]}>
                          {t("aiOpinion.total")}
                        </Text>
                        <Text style={[styles.aiOpinionSectionTitle, { color: Brand.primary }]}>
                          €{aiOpinionData.price_check?.total_est_eur}
                        </Text>
                      </View>
                      <Text style={[styles.aiOpinionEstimateNote, { color: theme.textTertiary }]}>
                        {t("aiOpinion.estimateNote")}
                      </Text>
                    </View>

                    {/* 4. 주의사항 */}
                    {(aiOpinionData.cautions || []).length > 0 && (
                      <>
                        <View style={[styles.aiOpinionDivider, { backgroundColor: theme.border }]} />
                        <View style={styles.aiOpinionSection}>
                          <Text style={[styles.aiOpinionSectionTitle, { color: theme.text }]}>
                            {t("aiOpinion.cautions")}
                          </Text>
                          {aiOpinionData.cautions.map((c: string, idx: number) => (
                            <Text key={`caution-${idx}`} style={[styles.aiOpinionBody, { color: theme.textSecondary }]}>
                              {c}
                            </Text>
                          ))}
                        </View>
                      </>
                    )}

                    {/* 🧠 2026-07-04 사장님 SSOT = "현지 전문가에게 다시 검증하세요"는 이 앱의 목적 = 무조건 고정 표시(세이브존처럼 하드코딩).
                        Gemini 자유생성 문구 폐기 = 2026-07-04 §19. 고정 i18n 문구(expertCta) 1벌만 항상 렌더. */}
                    <View style={[styles.aiOpinionDivider, { backgroundColor: theme.border }]} />
                    <View style={styles.aiOpinionSection}>
                      <Text style={[styles.aiOpinionBody, { color: theme.textSecondary, fontStyle: "italic" }]}>
                        {t("aiOpinion.expertCta")}
                      </Text>
                    </View>
                    {/* 🧠 2026-07-04 사장님 SSOT = 크레딧(5) 차감 = 로딩 중엔 감춤, 결과 하단에만 조용히(textTertiary). */}
              <Text style={[styles.aiOpinionEstimateNote, { color: theme.textTertiary, marginTop: Spacing.lg }]}>
                {t("aiOpinion.creditNote", { count: AI_OPINION_CREDIT_COST })}
              </Text>
            </ScrollView>
          ) : null}
        </SnapSheet>
  );
}
