/**
 * Notification Service
 *
 * 알림 생성 및 푸시 발송 서비스:
 * - 인앱 알림 생성
 * - 웹 푸시 알림 발송
 * - 전체 공지 발송 (관리자용)
 *
 * @created 2025-12-06
 */

import { db } from "./db";
import { notifications, pushSubscriptions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import webpush from "web-push";

// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = VAPID 가드 = 키 있으면 웹푸시 활성, 없으면 푸시만 스킵(인앱 알림 DB저장은 정상 = 1차 릴리스).
//   2차에서 원서버(Replit Secrets) VAPID 키쌍 회수해 env 넣으면 푸시 자동 활성. 키쌍은 FE 하드코딩 공개키와 쌍 유지 필수(다르면 기존 구독 전부 무효).
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const pushEnabled = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (pushEnabled) {
  webpush.setVapidDetails(
    "mailto:dbstour1@gmail.com",
    VAPID_PUBLIC!,
    VAPID_PRIVATE!,
  );
}

export interface NotificationPayload {
  userId?: string | null;
  type: "reward" | "content" | "event" | "update" | "urgent" | "expert"; // 'expert' = 전문가 답변 도착(2026-07-13)
  title: string;
  message: string;
  icon?: string;
  link?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  link?: string;
  notificationId?: string;
}

export class NotificationService {
  /**
   * 알림 생성 (DB에 저장)
   */
  async createNotification(payload: NotificationPayload): Promise<string> {
    const result = await db
      .insert(notifications)
      .values({
        userId: payload.userId || null,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        icon: payload.icon || this.getIconForType(payload.type),
        link: payload.link || null,
      })
      .returning({ id: notifications.id });

    return result[0].id;
  }

  /**
   * 특정 유저에게 푸시 알림 발송
   */
  async sendPushToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<{ success: boolean; sent: number; failed: number }> {
    if (!pushEnabled) return { success: false, sent: 0, failed: 0 }; // VAPID 미설정 = 푸시 스킵(인앱 알림은 이미 저장됨)
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || "/icons/icon-192x192.png",
            badge: payload.badge || "/icons/badge-72x72.png",
            tag: payload.tag || payload.notificationId,
            link: payload.link,
            notificationId: payload.notificationId,
          }),
        );
        sent++;
      } catch (error: any) {
        console.error(`푸시 발송 실패 (${sub.endpoint}):`, error.message);
        failed++;

        // 410 Gone 또는 404 Not Found = 구독 만료, 삭제
        if (error.statusCode === 410 || error.statusCode === 404) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
          console.log(`만료된 구독 삭제: ${sub.id}`);
        }
      }
    }

    return { success: sent > 0, sent, failed };
  }

  /**
   * 모든 유저에게 푸시 알림 발송 (전체 공지)
   */
  async sendPushToAll(
    payload: PushPayload,
  ): Promise<{ sent: number; failed: number }> {
    if (!pushEnabled) return { sent: 0, failed: 0 }; // VAPID 미설정 = 푸시 스킵
    const allSubscriptions = await db.select().from(pushSubscriptions);

    let sent = 0;
    let failed = 0;

    for (const sub of allSubscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || "/icons/icon-192x192.png",
            badge: payload.badge || "/icons/badge-72x72.png",
            tag: payload.tag,
            link: payload.link,
            notificationId: payload.notificationId,
          }),
        );
        sent++;
      } catch (error: any) {
        failed++;

        if (error.statusCode === 410 || error.statusCode === 404) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }

    console.log(`📢 전체 푸시 발송 완료: 성공 ${sent}, 실패 ${failed}`);
    return { sent, failed };
  }

  /**
   * 알림 생성 + 푸시 발송 (통합)
   */
  async createAndSendNotification(payload: NotificationPayload): Promise<{
    notificationId: string;
    pushResult?: { sent: number; failed: number };
  }> {
    // 1. 알림 생성
    const notificationId = await this.createNotification(payload);

    // 2. 푸시 발송
    let pushResult;
    const pushPayload: PushPayload = {
      title: payload.title,
      body: payload.message,
      icon: payload.icon,
      tag: payload.type,
      link: payload.link,
      notificationId,
    };

    if (payload.userId) {
      // 특정 유저에게 발송
      pushResult = await this.sendPushToUser(payload.userId, pushPayload);
    } else {
      // 전체 공지
      pushResult = await this.sendPushToAll(pushPayload);
    }

    return { notificationId, pushResult };
  }

  /**
   * 리워드 알림 생성 + 푸시 발송
   */
  async sendRewardNotification(
    userId: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<void> {
    await this.createAndSendNotification({
      userId,
      type: "reward",
      title,
      message,
      icon: "gift",
      link,
    });
  }

  /**
   * 알림 유형별 아이콘 반환
   */
  private getIconForType(type: string): string {
    switch (type) {
      case "reward":
        return "gift";
      case "content":
        return "book-open";
      case "event":
        return "calendar";
      case "update":
        return "refresh-cw";
      case "urgent":
        return "alert-triangle";
      default:
        return "bell";
    }
  }
}

export const notificationService = new NotificationService();
