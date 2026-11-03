//   옛 전용 화면(client/screens/video/) = 이 슬롯으로 본문이 옮겨온 뒤 호출자 0 = 완전삭제 2026-08-03 §19 사장님 승인.
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/query-client";
import { Icon } from "@/components/Icon";
import { Brand, Fonts } from "@/constants/theme";

export interface DayVideo {
  status: "processing" | "succeeded" | "failed";
  url: string | null;
  taskId: string;
  scenesDone: number;
  totalScenes: number;
  error?: string; // 실패 사유(서버 예외 문구 그대로 = 뭉개기 금지 SSOT, 2026-08-06)
}

interface Props {
  itineraryId: number;
  day: number; // 현재 보고 있는 일차 (기기 저장 파일명에도 사용)
  dayVideo: DayVideo | undefined;
  hasSlots: boolean; // 그 날 일정 슬롯 존재 여부 = 없으면 생성 버튼 비활성
  canGenerate: boolean; // 만들 수 있는 자리인가(생성기=true / 감상=false, 2026-08-03 사장님)
  isRequesting: boolean; // 껍데기의 생성 요청 진행 중 여부
  onGenerate(): void; // 생성 요청 = 껍데기 소유 함수 1벌(§0)
  onVideoByDay(v: Record<string, DayVideo>): void; // 폴링 결과를 껍데기로 올림
  pauseSignal?: number; // 껍데기가 멈춤을 요청할 때마다 1씩 오름(공유 시트를 열 때)
}

export default function VideoPlaySlot({
  itineraryId,
  day,
  dayVideo,
  hasSlots,
  canGenerate,
  isRequesting,
  onGenerate,
  onVideoByDay,
  pauseSignal = 0,
}: Props) {
  const { t } = useTranslation();
  const [pollTick, setPollTick] = useState(0); // 폴링 재가동 신호 = 네트워크 1회 오류에도 다음 폴링 이어감(§22 react-best)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<Video>(null);

  const handledPause = useRef(pauseSignal);
  useEffect(() => {
    if (pauseSignal === handledPause.current) return;
    handledPause.current = pauseSignal;
    void videoRef.current?.pauseAsync();
  }, [pauseSignal]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (dayVideo?.status !== "processing") return;
    pollRef.current = setTimeout(async () => {
      try {
        const r = await apiRequest(
          "GET",
          `/api/itineraries/${itineraryId}/video`,
        );
        const v = await r.json();
        onVideoByDay(v.videoByDay || {});
      } catch {
      } finally {
        setPollTick((n) => n + 1);
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [dayVideo?.status, itineraryId, pollTick, onVideoByDay]);

  // 기기 저장 기능 = 완전삭제 = 2026-08-01 사장님 §19 (이미 저장된 것을 보는 화면 = 더 저장할 곳 없음).

  return (
    <View style={styles.body}>
      {dayVideo?.status === "succeeded" && dayVideo.url ? (
        // ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "유리카드처럼 생긴 그거 다 삭제하고 이거를 정본으로" = 지금 코드: 완료 = 전체 재생(지명은 영상 안 타이포그래피) · [공유]를 누르면 멈춤 (정본 2026-11-01)
        <View style={styles.playerBox}>
          {/* 화면 풀 채움 + 터치 시 재생·정지 컨트롤 = useNativeControls(이전 영상보기 그대로).
              videoStyle = 웹에서 contain 강제(2026-08-01 사장님 "잘림" 실측 = 웹이 cover 로 그려 위아래가 잘렸음.
              이전 모듈이 다 보였던 비밀 = contain = 전체가 항상 보이게 축소). */}
          <Video
            ref={videoRef}
            source={{ uri: dayVideo.url }}
            style={styles.player}
            videoStyle={
              { width: "100%", height: "100%", objectFit: "contain" } as any
            }
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
          />
          {/* ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 영상 위 안내 없음(빠진 장소 수는 DB 기록만) (정본 2026-11-03) */}
        </View>
      ) : dayVideo?.status === "processing" ? (
        // ⏳ 생성중 = 진행률. 문구 = 2026-08-03 사장님 교체('지브리' 폐기 §19) + 나가도 됨 안내(백그라운드 진행).
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Brand.primary} />
          <Text style={styles.progressText}>
            {t("tripisVideo.generatingTitle")}{" "}
            {dayVideo.totalScenes
              ? `${Math.round((dayVideo.scenesDone / dayVideo.totalScenes) * 100)}%`
              : ""}
          </Text>
          <Text style={styles.progressSub}>
            {t("tripisVideo.generatingScenes", {
              done: dayVideo.scenesDone,
              total: dayVideo.totalScenes,
            })}
          </Text>
          <Text style={styles.noticeBig}>
            {t("tripisVideo.generatingNotice")}
          </Text>
        </View>
      ) : canGenerate ? (
        // ⚠️ 수정금지(승인필요) 만들 수 있는 자리에서만 그린다(2026-08-03 사장님) = 감상(도시 대표카드·프로필)에서는
        <View style={styles.center}>
          <Icon name="film" size={56} color={Brand.primary} />
          <Text style={styles.introTitle}>
            {t("tripisVideo.introTitle", { day })}
          </Text>
          <Text style={styles.introDesc}>{t("tripisVideo.introDesc")}</Text>
          <Text style={styles.creditNotice}>
            {t("tripisVideo.creditNotice")}
          </Text>
          <Text style={styles.noticeBig}>{t("tripisVideo.genNotice")}</Text>
          {dayVideo?.status === "failed" && (
            <Text style={styles.failText}>
              {/* 서버 실패 사유 그대로 표시(뭉개기 금지 SSOT 2026-08-06). 사유 미기록(옛 실패 건) = 기본 문구 */}
              {dayVideo.error
                ? t("tripisVideo.failWithReason", { reason: dayVideo.error })
                : t("tripisVideo.failGeneric")}
            </Text>
          )}
          <Pressable
            style={[styles.genBtn, isRequesting && { opacity: 0.6 }]}
            onPress={onGenerate}
            disabled={isRequesting || !hasSlots}
          >
            {isRequesting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Icon name="play" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.genBtnText}>
              {t("tripisVideo.generateBtn")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.center}>
          <Icon name="film" size={56} color={Brand.primary} />
          <Text style={styles.introTitle}>
            {t("tripisVideo.notYet", { d: day })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  playerBox: { flex: 1 },
  player: { width: "100%", height: "100%" },
  progressText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts?.bold || undefined,
  },
  progressSub: { color: "#94a3b8", fontSize: 13 },
  // 크게 표시(2026-08-03 사장님) = 크레딧 차감 고지 + 나가도 됨 안내
  creditNotice: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts?.bold || undefined,
    marginTop: 10,
  },
  noticeBig: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: Fonts?.bold || undefined,
    marginTop: 8,
  },
  introDesc: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 19,
  },
  failText: { color: "#f87171", fontSize: 13 },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Brand.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    marginTop: 12,
  },
  genBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts?.bold || undefined,
  },
});
