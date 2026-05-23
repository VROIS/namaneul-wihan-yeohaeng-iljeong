/**
 * ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 완전 정리 후 = 단순 SELECT 만
 * = 옛 627 줄 (= GDELT + Gemini 수집 + admin 함수 다수) = 모두 폐기 (= 비용 0 + 사용 0)
 * = 유지 = getAlertsForTrip = TripPlannerScreen.tsx 가 호출하는 단순 DB SELECT 만
 * = 데이터 출처 = 옛 crisis_alerts 테이블 (= 139 행 = 옛 수집 결과) 사용
 */

import { db } from '../db';
import { crisisAlerts } from '../../shared/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

type CrisisType = 'strike' | 'protest' | 'traffic' | 'weather' | 'security';
type SeverityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface CrisisAlert {
  id?: number;
  type: CrisisType;
  title: string;
  titleKo: string;
  description: string;
  date: string;
  endDate?: string;
  city: string;
  affected: string[];
  severity: SeverityLevel;
  recommendation: string;
  recommendationKo: string;
  source: string;
  sourceUrl?: string;
  isActive: boolean;
  createdAt?: Date;
}

/**
 * 여행 일정 시 위기 정보 매칭 (= FE TripPlannerScreen 호출)
 */
export async function getAlertsForTrip(
  city: string,
  startDate: string,
  endDate: string
): Promise<{
  hasAlerts: boolean;
  highSeverity: boolean;
  alerts: CrisisAlert[];
  summary: string;
}> {
  if (!db) {
    return { hasAlerts: false, highSeverity: false, alerts: [], summary: '위기 정보를 확인할 수 없습니다.' };
  }
  try {
    const alerts = await db.select().from(crisisAlerts)
      .where(and(
        eq(crisisAlerts.city, city),
        eq(crisisAlerts.isActive, true),
        sql`${crisisAlerts.date} <= ${endDate}`,
        sql`COALESCE(${crisisAlerts.endDate}, ${crisisAlerts.date}) >= ${startDate}`
      ))
      .orderBy(desc(crisisAlerts.severity));

    const hasAlerts = alerts.length > 0;
    const highSeverity = alerts.some(a => (a.severity || 0) >= 7);

    let summary = '';
    if (!hasAlerts) {
      summary = `${city} 여행 기간 중 특별한 주의사항이 없습니다. 즐거운 여행 되세요! 🎉`;
    } else if (highSeverity) {
      const highAlerts = alerts.filter(a => (a.severity || 0) >= 7);
      summary = `⚠️ ${city}에 ${highAlerts.length}개의 주요 알림이 있습니다. 여행 전 확인하세요!`;
    } else {
      summary = `📢 ${city}에 ${alerts.length}개의 참고 알림이 있습니다.`;
    }

    return { hasAlerts, highSeverity, alerts: alerts as CrisisAlert[], summary };
  } catch (error) {
    console.error(`[CrisisAlert] 여행 매칭 실패: ${city}`, error);
    return { hasAlerts: false, highSeverity: false, alerts: [], summary: '위기 정보를 확인할 수 없습니다.' };
  }
}

export const crisisAlertService = {
  getAlertsForTrip,
};
