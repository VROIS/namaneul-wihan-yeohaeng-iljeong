// ⚠️ 수정금지(승인필요): 2026-03-22 One-Time Token (OTT) Store

import crypto from "crypto";

const tokens = new Map<string, { userId: number; expiresAt: number }>();

export const ottStore = {
  // ⚠️ 수정금지(승인필요): OTT 토큰 생성 — userId 매핑, 60초 만료
  create(userId: number): string {
    const token = crypto.randomUUID();
    tokens.set(token, {
      userId,
      expiresAt: Date.now() + 60_000, // 60초 만료
    });
    return token;
  },

  // ⚠️ 수정금지(승인필요): OTT 토큰 검증 + 소비 — 1회용 (검증 즉시 삭제)
  consume(token: string): number | null {
    const entry = tokens.get(token);
    if (!entry) return null;
    tokens.delete(token); // 1회용 — 즉시 삭제

    if (Date.now() > entry.expiresAt) return null; // 만료
    return entry.userId;
  },
};
