/**
 * 위기 정보 수집 서비스 (Crisis Alert Service)
 * 
 * 🚨 수집 대상:
 * - 파업 (Strike): RATP, SNCF, 항공사
 * - 시위 (Protest): 노란조끼, 노동절 등
 * - 교통 장애 (Traffic): 도로 통제, 메트로 폐쇄
 * - 기상 경보 (Weather Alert): 폭우, 폭설, 폭염
 * 
 * 📊 데이터 흐름:
 * GDELT API (실시간 뉴스) → Gemini AI (분석/구조화) → DB 저장 → 대시보드/푸시 알림
 * 
 * ⏰ 수집 스케줄: 새벽 3:30 KST 자동 수집
 */

import { db } from '../db';
import { crisisAlerts } from '../../shared/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

// === 타입 정의 ===
type CrisisType = 'strike' | 'protest' | 'traffic' | 'weather' | 'security';
type SeverityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

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

// === GDELT API 설정 ===
const GDELT_API_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

// 도시별 검색 키워드 (다국어)
const CITY_KEYWORDS: Record<string, string[]> = {
  Paris: [
    'Paris strike', 'Paris protest', 'Paris grève', 'Paris manifestation',
    'RATP strike', 'SNCF strike', 'CDG airport strike',
    'Paris metro closure', 'Paris traffic', 'Champs-Elysées protest',
  ],
  London: [
    'London strike', 'London protest', 'Tube strike', 'Heathrow strike',
    'London traffic', 'Westminster protest',
  ],
  Rome: [
    'Rome strike', 'Roma sciopero', 'Rome protest', 'Italy rail strike',
  ],
  Barcelona: [
    'Barcelona strike', 'Barcelona huelga', 'Catalonia protest',
  ],
};

// 기본 유럽 도시 (파리 우선)
const DEFAULT_CITIES = ['Paris', 'London', 'Rome', 'Barcelona', 'Amsterdam', 'Berlin'];

/**
 * GDELT API에서 뉴스 기사 수집
 */
async function fetchGdeltNews(city: string): Promise<GdeltArticle[]> {
  try {
    const keywords = CITY_KEYWORDS[city] || [`${city} strike`, `${city} protest`];
    // GDELT API: OR 쿼리는 반드시 괄호()로 감싸야 함
    const query = `(${keywords.join(' OR ')})`;
    
    // 최근 7일 뉴스만 검색
    const url = `${GDELT_API_BASE}?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=100&format=json&timespan=7d`;
    
    console.log(`[CrisisAlert] GDELT 검색: ${city}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NUBI-TravelApp/1.0',
      },
    });
    
    if (!response.ok) {
      console.warn(`[CrisisAlert] GDELT API 오류: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error(`[CrisisAlert] GDELT 수집 실패: ${city}`, error);
    return [];
  }
}

/**
 * Gemini AI로 뉴스 분석 및 구조화
 */
async function analyzeWithGemini(articles: GdeltArticle[], city: string): Promise<CrisisAlert[]> {
  if (articles.length === 0) return [];
  
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[CrisisAlert] Gemini API 키 없음');
      return [];
    }
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    
    // 최근 50개 기사만 분석
    const recentArticles = articles.slice(0, 50);
    
    const prompt = `당신은 여행 안전 분석 전문가입니다.
다음 뉴스 기사들을 분석하여 ${city} 여행자에게 영향을 줄 수 있는 위기 정보만 추출해주세요.

뉴스 기사:
${recentArticles.map((a, i) => `${i + 1}. ${a.title} (${a.seendate})`).join('\n')}

분석 기준:
- 파업 (strike): 교통, 공항, 관광지 파업
- 시위 (protest): 대규모 시위, 도로 통제
- 교통 (traffic): 메트로 폐쇄, 도로 공사
- 날씨 (weather): 기상 경보, 폭우/폭설
- 보안 (security): 테러 위협, 비상 상황

JSON 배열로 답해주세요. 여행에 영향 없는 뉴스는 제외:
[{
  "type": "strike" | "protest" | "traffic" | "weather" | "security",
  "title": "영문 제목",
  "titleKo": "한글 제목",
  "description": "상세 설명 (영문)",
  "date": "YYYY-MM-DD (예상 발생일)",
  "endDate": "YYYY-MM-DD (종료일, 알 수 없으면 null)",
  "affected": ["영향받는 교통수단/지역"],
  "severity": 1-10 (10이 가장 심각),
  "recommendation": "여행자 조언 (영문)",
  "recommendationKo": "여행자 조언 (한글)"
}]

여행에 영향 없으면 빈 배열 []을 반환하세요.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    const text = response.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      let alerts: CrisisAlert[];
      try {
        alerts = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error(`[CrisisAlert] JSON 파싱 실패: ${city}`, parseError);
        return [];
      }
      
      // 도시 및 소스 정보 추가
      return alerts.map(alert => ({
        ...alert,
        city,
        source: 'GDELT + Gemini',
        isActive: true,
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`[CrisisAlert] Gemini 분석 실패: ${city}`, error);
    return [];
  }
}

/**
 * DB에 위기 정보 저장
 */
async function saveAlertsToDB(alerts: CrisisAlert[]): Promise<number> {
  if (alerts.length === 0) return 0;
  
  let savedCount = 0;
  
  for (const alert of alerts) {
    try {
      // 중복 체크 (같은 도시, 같은 날짜, 같은 타입)
      const existing = await db.select().from(crisisAlerts)
        .where(and(
          eq(crisisAlerts.city, alert.city),
          eq(crisisAlerts.type, alert.type),
          eq(crisisAlerts.date, alert.date)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(crisisAlerts).values({
          type: alert.type,
          alertType: alert.type, // 하위호환 (DB NOT NULL 제약 충족)
          title: alert.title,
          titleKo: alert.titleKo,
          description: alert.description,
          date: alert.date,
          endDate: alert.endDate || null,
          city: alert.city,
          affected: alert.affected,
          severity: alert.severity,
          recommendation: alert.recommendation,
          recommendationKo: alert.recommendationKo,
          source: alert.source,
          isActive: true,
        });
        savedCount++;
        console.log(`[CrisisAlert] 저장: ${alert.city} - ${alert.titleKo}`);
      }
    } catch (error) {
      console.error(`[CrisisAlert] DB 저장 실패:`, error);
    }
  }
  
  return savedCount;
}

/**
 * 도시별 위기 정보 수집 (메인 함수)
 */
export async function collectCrisisAlerts(cities: string[] = DEFAULT_CITIES): Promise<{
  totalArticles: number;
  totalAlerts: number;
  savedAlerts: number;
  byCity: Record<string, number>;
}> {
  console.log(`[CrisisAlert] 수집 시작: ${cities.join(', ')}`);
  
  let totalArticles = 0;
  let totalAlerts = 0;
  let savedAlerts = 0;
  const byCity: Record<string, number> = {};
  
  for (const city of cities) {
    // 1. GDELT에서 뉴스 수집
    const articles = await fetchGdeltNews(city);
    totalArticles += articles.length;
    
    // 2. Gemini로 분석
    const alerts = await analyzeWithGemini(articles, city);
    totalAlerts += alerts.length;
    byCity[city] = alerts.length;
    
    // 3. DB 저장
    const saved = await saveAlertsToDB(alerts);
    savedAlerts += saved;
    
    // API 제한 방지 (1초 대기)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`[CrisisAlert] 수집 완료: 기사 ${totalArticles}개 → 알림 ${totalAlerts}개 → 저장 ${savedAlerts}개`);
  
  return { totalArticles, totalAlerts, savedAlerts, byCity };
}

/**
 * 특정 도시의 활성 위기 정보 조회
 */
export async function getActiveAlerts(city: string): Promise<CrisisAlert[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const alerts = await db.select().from(crisisAlerts)
      .where(and(
        eq(crisisAlerts.city, city),
        eq(crisisAlerts.isActive, true),
        gte(crisisAlerts.date, today)
      ))
      .orderBy(desc(crisisAlerts.severity));
    
    return alerts as CrisisAlert[];
  } catch (error) {
    console.error(`[CrisisAlert] 조회 실패: ${city}`, error);
    return [];
  }
}

/**
 * 모든 활성 위기 정보 조회 (대시보드용)
 * 최근 7일 이내 발생한 알림도 포함
 */
export async function getAllActiveAlerts(): Promise<CrisisAlert[]> {
  try {
    // 7일 전 날짜부터 표시 (과거 이벤트도 관제 목적으로 보여줌)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    const alerts = await db.select().from(crisisAlerts)
      .where(and(
        eq(crisisAlerts.isActive, true),
        gte(crisisAlerts.date, weekAgoStr)
      ))
      .orderBy(desc(crisisAlerts.severity), desc(crisisAlerts.createdAt));
    
    return alerts as CrisisAlert[];
  } catch (error) {
    console.error('[CrisisAlert] 전체 조회 실패:', error);
    return [];
  }
}

/**
 * 위기 정보 비활성화
 */
export async function deactivateAlert(alertId: number): Promise<boolean> {
  try {
    await db.update(crisisAlerts)
      .set({ isActive: false })
      .where(eq(crisisAlerts.id, alertId));
    return true;
  } catch (error) {
    console.error(`[CrisisAlert] 비활성화 실패: ${alertId}`, error);
    return false;
  }
}

/**
 * 수집 통계 조회 (대시보드용)
 */
export async function getCollectionStats(): Promise<{
  totalAlerts: number;
  activeAlerts: number;
  byCity: Record<string, number>;
  byType: Record<string, number>;
  lastCollection?: Date;
}> {
  try {
    const allAlerts = await db.select().from(crisisAlerts);
    const activeAlerts = allAlerts.filter(a => a.isActive);
    
    const byCity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    
    for (const alert of activeAlerts) {
      byCity[alert.city] = (byCity[alert.city] || 0) + 1;
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    }
    
    const lastAlert = allAlerts.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )[0];
    
    return {
      totalAlerts: allAlerts.length,
      activeAlerts: activeAlerts.length,
      byCity,
      byType,
      lastCollection: lastAlert?.createdAt,
    };
  } catch (error) {
    console.error('[CrisisAlert] 통계 조회 실패:', error);
    return { totalAlerts: 0, activeAlerts: 0, byCity: {}, byType: {} };
  }
}

/**
 * 만료된 위기 정보 자동 삭제 (DB 정리)
 * - endDate가 지난 알림: 삭제
 * - endDate 없고 date가 7일 이상 지난 알림: 삭제
 * - 30일 이상 된 모든 알림: 삭제
 */
export async function cleanupExpiredAlerts(): Promise<{
  deleted: number;
  remaining: number;
}> {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    // 삭제 전 개수
    const [beforeCount] = await db.select({ count: count() }).from(crisisAlerts);
    
    // 1. endDate가 지난 알림 비활성화
    await db.update(crisisAlerts)
      .set({ isActive: false })
      .where(and(
        eq(crisisAlerts.isActive, true),
        sql`${crisisAlerts.endDate} IS NOT NULL`,
        sql`${crisisAlerts.endDate} < ${todayStr}`
      ));
    
    // 2. endDate 없고 date가 7일 이상 지난 알림 비활성화
    await db.update(crisisAlerts)
      .set({ isActive: false })
      .where(and(
        eq(crisisAlerts.isActive, true),
        sql`${crisisAlerts.endDate} IS NULL`,
        sql`${crisisAlerts.date} < ${sevenDaysAgoStr}`
      ));
    
    // 3. 30일 이상 된 비활성 알림 완전 삭제
    await db.delete(crisisAlerts)
      .where(and(
        eq(crisisAlerts.isActive, false),
        sql`${crisisAlerts.createdAt} < ${thirtyDaysAgo.toISOString()}`
      ));
    
    // 삭제 후 개수
    const [afterCount] = await db.select({ count: count() }).from(crisisAlerts);
    
    const deleted = Number(beforeCount?.count || 0) - Number(afterCount?.count || 0);
    
    console.log(`[CrisisAlert] 🧹 정리 완료: ${deleted}개 삭제, ${afterCount?.count}개 남음`);
    
    return {
      deleted,
      remaining: Number(afterCount?.count || 0)
    };
  } catch (error) {
    console.error('[CrisisAlert] 정리 실패:', error);
    return { deleted: 0, remaining: 0 };
  }
}

/**
 * 사용자 일정에 해당하는 위기 정보 조회 (실시간 매칭)
 * @param city 여행 도시 (Paris, London 등)
 * @param startDate 여행 시작일 (YYYY-MM-DD)
 * @param endDate 여행 종료일 (YYYY-MM-DD)
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
  try {
    // 여행 기간과 겹치는 모든 활성 알림 조회
    const alerts = await db.select().from(crisisAlerts)
      .where(and(
        eq(crisisAlerts.city, city),
        eq(crisisAlerts.isActive, true),
        // 알림 날짜가 여행 기간과 겹치는 경우
        sql`${crisisAlerts.date} <= ${endDate}`,
        sql`COALESCE(${crisisAlerts.endDate}, ${crisisAlerts.date}) >= ${startDate}`
      ))
      .orderBy(desc(crisisAlerts.severity));
    
    const hasAlerts = alerts.length > 0;
    const highSeverity = alerts.some(a => (a.severity || 0) >= 7);
    
    // 요약 메시지 생성
    let summary = '';
    if (!hasAlerts) {
      summary = `${city} 여행 기간 중 특별한 주의사항이 없습니다. 즐거운 여행 되세요! 🎉`;
    } else if (highSeverity) {
      const highAlerts = alerts.filter(a => (a.severity || 0) >= 7);
      summary = `⚠️ ${city}에 ${highAlerts.length}개의 주요 알림이 있습니다. 여행 전 확인하세요!`;
    } else {
      summary = `📢 ${city}에 ${alerts.length}개의 참고 알림이 있습니다.`;
    }
    
    return {
      hasAlerts,
      highSeverity,
      alerts: alerts as CrisisAlert[],
      summary
    };
  } catch (error) {
    console.error(`[CrisisAlert] 여행 매칭 실패: ${city}`, error);
    return {
      hasAlerts: false,
      highSeverity: false,
      alerts: [],
      summary: '위기 정보를 확인할 수 없습니다.'
    };
  }
}

// count import 추가 필요
import { count } from 'drizzle-orm';

// Export
export const crisisAlertService = {
  collectCrisisAlerts,
  getActiveAlerts,
  getAllActiveAlerts,
  deactivateAlert,
  getCollectionStats,
  cleanupExpiredAlerts,
  getAlertsForTrip,
};
