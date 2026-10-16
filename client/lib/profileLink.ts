// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 웹 주소로 프로필 안내 바로 열기 = 판별 1벌(/privacy → 개인정보 보호, /delete-account → 그 안의 탈퇴 안내, /support → 도움말), 한 번 쓰면 비운다 (정본 9-27)
import { Platform } from "react-native";

export const PROFILE_ANCHOR = {
  privacy: "profile-privacy",
  deleteAccount: "profile-delete-account",
  help: "profile-help",
} as const;

export type ProfileLink = {
  section: "privacy" | "help";
  anchor: (typeof PROFILE_ANCHOR)[keyof typeof PROFILE_ANCHOR];
};

const PATHS: Record<string, ProfileLink> = {
  "/privacy": { section: "privacy", anchor: PROFILE_ANCHOR.privacy },
  "/delete-account": {
    section: "privacy",
    anchor: PROFILE_ANCHOR.deleteAccount,
  },
  "/support": { section: "help", anchor: PROFILE_ANCHOR.help },
};

function readOnce(): ProfileLink | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || !window.location) return null;
  return PATHS[window.location.pathname.replace(/\/+$/, "")] ?? null;
}

let snapshot = readOnce();

export function readProfileLink(): ProfileLink | null {
  return snapshot;
}

export function clearProfileLink(): void {
  snapshot = null;
}
