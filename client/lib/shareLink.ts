// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 링크 보내기 1벌 = 여정 공유·영상 공유가 같이 쓴다(웹 = 휴대폰 공유창 또는 복사 · 앱 = 공유 시트) (정본 §큰 일 4)
import { Platform, Share } from "react-native";

export async function shareLink(
  url: string,
  title: string,
  copiedMessage: string,
): Promise<void> {
  if (Platform.OS === "web") {
    const isMobileWeb =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    if (isMobileWeb && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
      } catch {}
    } else if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(url);
      if (typeof window !== "undefined") window.alert(copiedMessage);
    }
    return;
  }
  await Share.share(
    Platform.OS === "ios"
      ? { url, message: title }
      : { message: `${title}\n${url}` },
  );
}
