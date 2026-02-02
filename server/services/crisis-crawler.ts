import { db } from "../db";
import { crisisAlerts, cities } from "../../shared/schema";
import { eq, and, gte } from "drizzle-orm";

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const GDELT_BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: { name: string };
  publishedAt: string;
}

interface GDELTArticle {
  title: string;
  url: string;
  domain: string;
  seendate: string;
  socialimage?: string;
}

const CRISIS_KEYWORDS = {
  natural_disaster: ["earthquake", "typhoon", "flood", "tsunami", "volcano", "hurricane", "cyclone", "지진", "태풍", "홍수", "쓰나미", "화산"],
  terrorism: ["terror", "attack", "bombing", "explosion", "테러", "폭발", "공격"],
  civil_unrest: ["protest", "riot", "demonstration", "strike", "coup", "시위", "폭동", "쿠데타", "파업"],
  health: ["outbreak", "epidemic", "pandemic", "virus", "disease", "전염병", "바이러스", "감염병"],
  travel_advisory: ["travel warning", "travel advisory", "border closure", "visa", "여행경보", "입국금지", "국경폐쇄"]
};

async function analyzeWithGemini(articles: { title: string; description?: string; source: string }[], cityName: string): Promise<{
  severity: number;
  analysis: string;
  impactScore: number;
  alertType: string;
}> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    
    const articlesText = articles.map(a => `- ${a.title} (${a.source})`).join("\n");
    
    const response = await ai.models.generateContent({
      model: "gemini-3.0-flash-preview",
      contents: `You are a travel safety analyst. Analyze these news articles about ${cityName} and assess the travel risk.

Articles:
${articlesText}

Respond in JSON format:
{
  "alertType": "natural_disaster|terrorism|civil_unrest|health|travel_advisory|none",
  "severity": 1-5 (1=minor, 5=critical),
  "impactScore": 0-10 (impact on travel plans),
  "analysis": "Brief analysis in Korean explaining the situation and travel recommendations"
}

If no significant travel risk, set alertType to "none" and severity to 1.`
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("[CrisisCrawler] Gemini analysis error:", error);
  }
  
  return { severity: 1, analysis: "", impactScore: 0, alertType: "none" };
}

async function fetchFromNewsAPI(query: string): Promise<NewsArticle[]> {
  if (!NEWSAPI_KEY) {
    console.log("[CrisisCrawler] NewsAPI key not configured, skipping");
    return [];
  }
  
  try {
    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", query);
    url.searchParams.set("language", "en");
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", "10");
    url.searchParams.set("apiKey", NEWSAPI_KEY);
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error("[CrisisCrawler] NewsAPI error:", response.status);
      return [];
    }
    
    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error("[CrisisCrawler] NewsAPI fetch error:", error);
    return [];
  }
}

async function fetchFromGDELT(query: string): Promise<GDELTArticle[]> {
  try {
    const url = new URL(GDELT_BASE_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("maxrecords", "10");
    url.searchParams.set("format", "json");
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error("[CrisisCrawler] GDELT error:", response.status);
      return [];
    }
    
    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error("[CrisisCrawler] GDELT fetch error:", error);
    return [];
  }
}

export async function crawlCrisisAlerts(cityId?: number): Promise<{ success: boolean; alertsCreated: number }> {
  console.log("[CrisisCrawler] Starting crisis alerts crawl...");
  
  let targetCities;
  if (cityId) {
    targetCities = await db.select().from(cities).where(eq(cities.id, cityId));
  } else {
    targetCities = await db.select().from(cities);
  }
  
  let alertsCreated = 0;
  
  for (const city of targetCities) {
    console.log(`[CrisisCrawler] Checking ${city.name}, ${city.country}...`);
    
    const allCrisisKeywords = Object.values(CRISIS_KEYWORDS).flat().slice(0, 5).join(" OR ");
    const searchQuery = `${city.name} ${city.country} (${allCrisisKeywords})`;
    
    const newsArticles = await fetchFromNewsAPI(searchQuery);
    const gdeltArticles = await fetchFromGDELT(`${city.name} ${city.country}`);
    
    const combinedArticles = [
      ...newsArticles.map(a => ({
        title: a.title,
        description: a.description,
        source: a.source.name,
        url: a.url,
        publishedAt: a.publishedAt
      })),
      ...gdeltArticles.map(a => ({
        title: a.title,
        description: "",
        source: a.domain,
        url: a.url,
        publishedAt: a.seendate
      }))
    ];
    
    if (combinedArticles.length === 0) {
      console.log(`[CrisisCrawler] No news found for ${city.name}`);
      continue;
    }
    
    const analysis = await analyzeWithGemini(combinedArticles, city.name);
    
    if (analysis.alertType !== "none" && analysis.severity >= 2) {
      const existingAlert = await db.select()
        .from(crisisAlerts)
        .where(and(
          eq(crisisAlerts.cityId, city.id),
          eq(crisisAlerts.alertType, analysis.alertType),
          eq(crisisAlerts.isActive, true),
          gte(crisisAlerts.fetchedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        ))
        .limit(1);
      
      if (existingAlert.length === 0) {
        await db.insert(crisisAlerts).values({
          cityId: city.id,
          countryCode: city.countryCode,
          alertType: analysis.alertType,
          severity: analysis.severity,
          title: combinedArticles[0].title,
          description: combinedArticles.slice(0, 3).map(a => a.title).join(" | "),
          sourceUrl: combinedArticles[0].url,
          sourceName: combinedArticles[0].source,
          affectedAreas: [city.name],
          geminiAnalysis: analysis.analysis,
          impactScore: analysis.impactScore,
          isActive: true
        });
        
        alertsCreated++;
        console.log(`[CrisisCrawler] Created alert for ${city.name}: ${analysis.alertType} (severity: ${analysis.severity})`);
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`[CrisisCrawler] Crawl complete. Created ${alertsCreated} alerts.`);
  return { success: true, alertsCreated };
}

export async function getActiveCrisisAlerts(cityId?: number) {
  if (cityId) {
    return db.select()
      .from(crisisAlerts)
      .where(and(
        eq(crisisAlerts.cityId, cityId),
        eq(crisisAlerts.isActive, true)
      ))
      .orderBy(crisisAlerts.severity);
  }
  
  return db.select()
    .from(crisisAlerts)
    .where(eq(crisisAlerts.isActive, true))
    .orderBy(crisisAlerts.severity);
}

export async function getCrisisStats() {
  const [total] = await db.select({ count: db.$count(crisisAlerts) }).from(crisisAlerts);
  const [active] = await db.select({ count: db.$count(crisisAlerts) })
    .from(crisisAlerts)
    .where(eq(crisisAlerts.isActive, true));
  
  const bySeverity = await db.select({
    severity: crisisAlerts.severity,
  }).from(crisisAlerts).where(eq(crisisAlerts.isActive, true));
  
  const criticalCount = bySeverity.filter(a => a.severity >= 4).length;
  
  return {
    total: total.count,
    active: active.count,
    critical: criticalCount
  };
}
