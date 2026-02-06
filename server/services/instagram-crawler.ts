import { db } from "../db";
import { instagramHashtags, instagramLocations, instagramPhotos, apiServiceStatus } from "@shared/schema";
import { eq } from "drizzle-orm";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface HashtagData {
  postCount: number;
  topPosts?: Array<{
    url: string;
    imageUrl?: string;
    likeCount?: number;
    caption?: string;
  }>;
}

interface LocationData {
  locationId: string;
  name: string;
  postCount: number;
  latitude?: number;
  longitude?: number;
  topPosts?: Array<{
    url: string;
    imageUrl?: string;
    likeCount?: number;
  }>;
}

export class InstagramCrawler {
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 3000;

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await this.delay(this.minRequestInterval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  async fetchHashtagData(hashtag: string): Promise<HashtagData | null> {
    await this.rateLimit();
    
    const cleanHashtag = hashtag.replace(/^#/, "");
    
    // Gemini 웹검색을 기본 수집 방법으로 사용 (인스타그램 직접 스크랩은 차단됨)
    try {
      const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.error(`[Instagram] Gemini API 키 없음 - #${cleanHashtag} 건너뜀`);
        return null;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      
      const searchResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `인스타그램에서 해시태그 #${cleanHashtag} 에 대한 정보를 검색해주세요.

다음 형식의 JSON으로 응답해주세요:
{
  "postCount": 예상 게시물 수 (숫자),
  "topPosts": [
    {
      "url": "https://www.instagram.com/p/게시물ID/",
      "caption": "게시물 설명 (한국어 여행 관련)",
      "likeCount": 좋아요 수,
      "imageUrl": "이미지 URL (있으면)"
    }
  ]
}

요구사항:
- 한국인 여행자들이 많이 사용하는 해시태그 기준으로 검색
- 인기 게시물 최대 5개 정보 포함
- postCount는 실제 검색 결과 기반 추정치
- 결과를 찾을 수 없으면 {"postCount": 0, "topPosts": []} 반환
- 반드시 유효한 JSON만 반환하세요`,
        config: { tools: [{ googleSearch: {} }] },
      });

      const searchText = searchResponse.text || '';
      console.log(`[Instagram] #${cleanHashtag} Gemini 응답 길이: ${searchText.length}`);
      
      // JSON 파싱 시도
      const jsonMatch = searchText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const postCount = parsed.postCount || 0;
          const topPosts = parsed.topPosts || [];
          
          console.log(`[Instagram] #${cleanHashtag}: postCount=${postCount}, topPosts=${topPosts.length}개`);
          return { postCount, topPosts };
        } catch (parseErr) {
          console.warn(`[Instagram] JSON 파싱 실패 (${cleanHashtag}):`, parseErr);
        }
      }

      // JSON 파싱 실패시 배열만이라도 시도
      const arrayMatch = searchText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const topPosts = JSON.parse(arrayMatch[0]);
          console.log(`[Instagram] #${cleanHashtag}: 배열 파싱 성공, ${topPosts.length}개 게시물`);
          return { postCount: topPosts.length * 1000, topPosts };
        } catch (arrErr) {
          console.warn(`[Instagram] 배열 파싱도 실패 (${cleanHashtag})`);
        }
      }

      // 최소한 postCount라도 추정
      const numberMatch = searchText.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:만|천|백만|K|M|개|posts|게시물)/);
      if (numberMatch) {
        let count = parseFloat(numberMatch[1].replace(/,/g, ""));
        if (searchText.includes("만")) count *= 10000;
        if (searchText.includes("천")) count *= 1000;
        if (searchText.includes("백만") || searchText.includes("M")) count *= 1000000;
        if (searchText.includes("K")) count *= 1000;
        console.log(`[Instagram] #${cleanHashtag}: 텍스트에서 postCount 추정 = ${count}`);
        return { postCount: Math.floor(count) };
      }

      console.log(`[Instagram] #${cleanHashtag}: 유효한 데이터 없음`);
      return { postCount: 0 };
    } catch (error) {
      console.error(`[Instagram] #${cleanHashtag} 수집 실패:`, error);
      return null;
    }
  }

  async fetchLocationData(locationId: string): Promise<LocationData | null> {
    await this.rateLimit();
    
    const url = `https://www.instagram.com/explore/locations/${locationId}/`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        console.error(`Instagram location fetch failed: ${response.status}`);
        return null;
      }

      const html = await response.text();
      
      const nameMatch = html.match(/<title>([^<]+)<\/title>/);
      const name = nameMatch ? nameMatch[1].split(" • ")[0].trim() : "Unknown";
      
      const postCountMatch = html.match(/"edge_location_to_media":{"count":(\d+)/);
      const postCount = postCountMatch ? parseInt(postCountMatch[1]) : 0;

      const latMatch = html.match(/"lat":([\d.-]+)/);
      const lngMatch = html.match(/"lng":([\d.-]+)/);

      return {
        locationId,
        name,
        postCount,
        latitude: latMatch ? parseFloat(latMatch[1]) : undefined,
        longitude: lngMatch ? parseFloat(lngMatch[1]) : undefined,
      };
    } catch (error) {
      console.error(`Failed to fetch location ${locationId}:`, error);
      return null;
    }
  }

  async syncHashtag(hashtagDbId: number): Promise<{ success: boolean; postCount?: number; photosSaved?: number }> {
    const [hashtag] = await db
      .select()
      .from(instagramHashtags)
      .where(eq(instagramHashtags.id, hashtagDbId));

    if (!hashtag) {
      throw new Error("Hashtag not found");
    }

    const data = await this.fetchHashtagData(hashtag.hashtag);
    
    if (data) {
      await db
        .update(instagramHashtags)
        .set({
          postCount: data.postCount,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(instagramHashtags.id, hashtagDbId));

      // topPosts가 있으면 instagramPhotos 테이블에 저장
      let photosSaved = 0;
      if (data.topPosts && data.topPosts.length > 0) {
        for (const post of data.topPosts) {
          try {
            if (!post.url) continue;
            
            // 중복 체크
            const existing = await db
              .select()
              .from(instagramPhotos)
              .where(eq(instagramPhotos.postUrl, post.url))
              .limit(1);
            
            if (existing.length > 0) continue;
            
            await db.insert(instagramPhotos).values({
              hashtagId: hashtagDbId,
              postUrl: post.url,
              imageUrl: post.imageUrl || null,
              likeCount: post.likeCount || 0,
              caption: post.caption || null,
            });
            photosSaved++;
          } catch (photoErr) {
            console.warn(`[Instagram] 사진 저장 실패 (${post.url}):`, photoErr);
          }
        }
        console.log(`[Instagram] #${hashtag.hashtag}: ${photosSaved}개 사진 저장됨`);
      }

      await this.updateApiStatus("instagram_crawler", true);
      
      return { success: true, postCount: data.postCount, photosSaved };
    }

    await this.updateApiStatus("instagram_crawler", false, "Failed to fetch hashtag data");
    return { success: false };
  }

  async syncLocation(locationDbId: number): Promise<{ success: boolean; postCount?: number }> {
    const [location] = await db
      .select()
      .from(instagramLocations)
      .where(eq(instagramLocations.id, locationDbId));

    if (!location) {
      throw new Error("Location not found");
    }

    const data = await this.fetchLocationData(location.locationId);
    
    if (data) {
      await db
        .update(instagramLocations)
        .set({
          locationName: data.name,
          postCount: data.postCount,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(instagramLocations.id, locationDbId));

      return { success: true, postCount: data.postCount };
    }

    return { success: false };
  }

  async syncAllHashtags(): Promise<{ synced: number; failed: number }> {
    const hashtags = await db
      .select()
      .from(instagramHashtags)
      .where(eq(instagramHashtags.isActive, true));

    let synced = 0;
    let failed = 0;

    for (const hashtag of hashtags) {
      try {
        const result = await this.syncHashtag(hashtag.id);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to sync hashtag ${hashtag.hashtag}:`, error);
        failed++;
      }
    }

    return { synced, failed };
  }

  async syncAllLocations(): Promise<{ synced: number; failed: number }> {
    const locations = await db
      .select()
      .from(instagramLocations)
      .where(eq(instagramLocations.isActive, true));

    let synced = 0;
    let failed = 0;

    for (const location of locations) {
      try {
        const result = await this.syncLocation(location.id);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to sync location ${location.locationName}:`, error);
        failed++;
      }
    }

    return { synced, failed };
  }

  private async updateApiStatus(serviceName: string, success: boolean, errorMessage?: string): Promise<void> {
    try {
      const existing = await db
        .select()
        .from(apiServiceStatus)
        .where(eq(apiServiceStatus.serviceName, serviceName))
        .limit(1);

      const now = new Date();

      if (existing.length === 0) {
        await db.insert(apiServiceStatus).values({
          serviceName,
          displayName: "Instagram Crawler",
          isConfigured: true,
          isActive: true,
          lastCallAt: now,
          lastSuccessAt: success ? now : undefined,
          lastErrorAt: success ? undefined : now,
          lastErrorMessage: errorMessage,
          dailyCallCount: 1,
        });
      } else {
        await db
          .update(apiServiceStatus)
          .set({
            lastCallAt: now,
            lastSuccessAt: success ? now : existing[0].lastSuccessAt,
            lastErrorAt: success ? existing[0].lastErrorAt : now,
            lastErrorMessage: success ? existing[0].lastErrorMessage : errorMessage,
            dailyCallCount: (existing[0].dailyCallCount || 0) + 1,
            updatedAt: now,
          })
          .where(eq(apiServiceStatus.serviceName, serviceName));
      }
    } catch (error) {
      console.error("Failed to update API status:", error);
    }
  }

  async getStats(): Promise<{
    totalHashtags: number;
    totalLocations: number;
    totalPhotos: number;
    lastSyncAt: Date | null;
  }> {
    const hashtags = await db.select().from(instagramHashtags);
    const locations = await db.select().from(instagramLocations);
    const photos = await db.select().from(instagramPhotos);

    const allSyncs = [
      ...hashtags.map(h => h.lastSyncAt),
      ...locations.map(l => l.lastSyncAt),
    ].filter(Boolean) as Date[];

    const lastSyncAt = allSyncs.length > 0 
      ? new Date(Math.max(...allSyncs.map(d => d.getTime())))
      : null;

    return {
      totalHashtags: hashtags.length,
      totalLocations: locations.length,
      totalPhotos: photos.length,
      lastSyncAt,
    };
  }
}

export const instagramCrawler = new InstagramCrawler();
