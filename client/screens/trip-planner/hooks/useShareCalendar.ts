// 여정 공유(시스템 공유시트) + 캘린더 저장(.ics) = ResultStep footer 신규 버튼 2개 (2026-07-21 신규, §16 서브훅 패턴)
// useSaveItinerary.ts 회원게이트 패턴 복제(§16 재발명 금지 = 동일 로직 1벌 재사용).
import { useState } from "react";
import { Alert, Platform, Share } from "react-native";
import { Itinerary } from "@/types/trip";
import { getApiUrl } from "@/lib/query-client";
import { getUserData } from "@/lib/auth";
// ⚠️ B(캘린더 담당)와 병렬 계약 = client/lib/itinerary-calendar.ts 의 deliverICS(itinerary) export 가 인터페이스.
import { deliverICS } from "@/lib/itinerary-calendar";

export function useShareCalendar({
  itinerary,
  currentItineraryId,
  handleSaveItinerary,
  navigation,
  t,
}: {
  itinerary: Itinerary | null;
  currentItineraryId: number | null;
  // ⚠️ useSaveItinerary.ts 실제 시그니처 = itinerary 없을 때 undefined도 반환(49줄) = 3종 유니언 그대로 수신(§16 재발명 금지 = 남 소유 함수 타입 임의 축소 금지).
  handleSaveItinerary: () => Promise<number | null | undefined>;
  navigation: { navigate: (screen: any) => void };
  t: (key: string, opts?: any) => string;
}) {
  const [isSharing, setIsSharing] = useState(false);

  // 🔒 공유·캘린더 공용 회원게이트 = useSaveItinerary.ts:56-77 과 동일 패턴(§16 재발명 금지).
  //   게스트(둘러보기 토큰만 보유)도 getUserData() null 이면 로그인 안내 = 조용한 먹통 방지.
  const requireLogin = async (): Promise<boolean> => {
    const userData = await getUserData();
    if (userData) return true;

    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(
          `${t("trip.loginRequired")}\n\n${t("trip.saveLoginHint")}`,
        )
      ) {
        navigation.navigate("Login");
      }
    } else {
      Alert.alert(t("trip.loginRequired"), t("trip.saveLoginHint"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("trip.loginBtn"),
          onPress: () => navigation.navigate("Login"),
        },
      ]);
    }
    return false;
  };

  // 🔗 여정 공유 = 저장된 여정 id 확보(미저장이면 자동저장) → /shared/itinerary/{id} 링크 → 시스템 공유시트(카카오톡 포함).
  const handleShareItinerary = async () => {
    if (!itinerary) return;
    if (!(await requireLogin())) return;

    setIsSharing(true);
    try {
      // 🆔 공유 링크는 DB 저장 행이 있어야 함. 미저장이면 이 자리에서 자동저장 후 그 id 사용(§16 handleSaveItinerary 재사용).
      let id: number | null | undefined = currentItineraryId;
      if (!id) {
        id = await handleSaveItinerary();
        if (!id) return; // 저장 실패(비로그인·오류) = 공유 중단.
      }

      const url = `${getApiUrl()}/shared/itinerary/${id}`;

      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && (navigator as any).share) {
          try {
            await (navigator as any).share({ title: itinerary.title, url });
          } catch {
            // 사용자가 공유 취소 = 정상 흐름(에러 아님).
          }
        } else if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          // ⚠️ 신규 i18n 키 추가는 이 todo 범위 밖(D 담당 locale) = 기존 키만 사용, 복사만 수행(안내문구는 후속 작업).
          await navigator.clipboard.writeText(url);
        }
      } else {
        // 📱 네이티브 = 기존 사용례(BTSDashboardScreen.tsx:57) 동일 Share.share = 카카오톡·문자·클립보드 등 시스템 공유시트(사장님 확정 A안).
        await Share.share(
          Platform.OS === "ios"
            ? { url, message: itinerary.title }
            : { message: `${itinerary.title}\n${url}` },
        );
      }
    } catch (error) {
      console.error("[TripPlanner] 공유 오류:", error);
    } finally {
      setIsSharing(false);
    }
  };

  // 📅 캘린더 저장 = 회원게이트 후 B 담당 deliverICS 위임(.ics 생성+공유/저장 시트).
  // ⚠️ 수정금지(승인필요) — deliverICS 예외 미포착 시 unhandled rejection 발생 = handleShareItinerary(87-91줄)와 동일한 try/catch 패턴 재사용(§16 재발명 금지) = 2026-07-21 검수 수정.
  const handleSaveCalendar = async () => {
    if (!itinerary) return;
    if (!(await requireLogin())) return;
    try {
      await deliverICS(itinerary);
    } catch (error) {
      console.error("[TripPlanner] 캘린더 저장 오류:", error);
    }
  };

  return { isSharing, handleShareItinerary, handleSaveCalendar };
}
