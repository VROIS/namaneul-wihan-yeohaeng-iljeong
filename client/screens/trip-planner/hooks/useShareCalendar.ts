// 여정 공유(시스템 공유시트) + 캘린더 저장(.ics) = ResultStep footer 신규 버튼 2개 (2026-07-21 신규, §16 서브훅 패턴)
// useSaveItinerary.ts 회원게이트 패턴 복제(§16 재발명 금지 = 동일 로직 1벌 재사용).
import { useState } from "react";
import { Platform, Share } from "react-native";
import { Itinerary } from "@/types/trip";
import { getApiUrl } from "@/lib/query-client";
import { openCalendar } from "@/lib/itinerary-calendar";
import { ensureLoggedIn } from "./login-gate";

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

  // 🆔 저장된 여정 id 확보 = 미저장이면 이 자리에서 자동저장(§16 handleSaveItinerary 재사용). 실패(비로그인·오류) = null.
  const ensureItineraryId = async (): Promise<number | null> => {
    if (currentItineraryId) return currentItineraryId;
    return (await handleSaveItinerary()) ?? null;
  };

  // 🔗 여정 공유 = 저장된 여정 id 확보(미저장이면 자동저장) → /shared/itinerary/{id} 링크 → 시스템 공유시트(카카오톡 포함).
  const handleShareItinerary = async () => {
    if (!itinerary) return;
    if (!(await ensureLoggedIn(t, navigation))) return;

    setIsSharing(true);
    try {
      const id = await ensureItineraryId();
      if (!id) return; // 저장 실패 = 공유 중단.

      const url = `${getApiUrl()}/shared/itinerary/${id}`;

      if (Platform.OS === "web") {
        // 🖥️ 2026-07-21 실증 = PC(Windows) navigator.share 는 OS 공유창(메일·근처기기뿐)이라 빈약 →
        //   모바일웹만 시스템 공유시트, PC 는 클립보드 복사 + 안내가 사용자에게 실제로 유용.
        const isMobileWeb =
          typeof navigator !== "undefined" &&
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
        if (isMobileWeb && (navigator as any).share) {
          try {
            await (navigator as any).share({ title: itinerary.title, url });
          } catch {
            // 사용자가 공유 취소 = 정상 흐름(에러 아님).
          }
        } else if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(url);
          if (typeof window !== "undefined") {
            window.alert(t("trip.shareLinkCopied"));
          }
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

  // 📅 캘린더 저장 (2026-07-21 재구현) = 회원게이트 → 플랫폼별 원탭:
  //   iOS = 서버 .ics URL(저장된 여정 id 필요 = 미저장이면 자동저장, 공유와 동일 패턴 §16) → Safari 네이티브 "일정 추가".
  //   Android·웹 = 구글캘린더 render 링크(id 불필요, 클라 데이터로 즉시).
  const handleSaveCalendar = async () => {
    if (!itinerary) return;
    if (!(await ensureLoggedIn(t, navigation))) return;
    setIsSharing(true);
    try {
      let icsUrl: string | null = null;
      if (Platform.OS === "ios") {
        const id = await ensureItineraryId();
        if (!id) return; // 저장 실패 = 캘린더 중단.
        icsUrl = `${getApiUrl()}/api/itineraries/${id}/calendar.ics`;
      }
      await openCalendar(itinerary, icsUrl);
    } catch (error) {
      console.error("[TripPlanner] 캘린더 저장 오류:", error);
    } finally {
      setIsSharing(false);
    }
  };

  return { isSharing, handleShareItinerary, handleSaveCalendar };
}
