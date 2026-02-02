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
    const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanHashtag)}/`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (!response.ok) {
        console.error(`Instagram hashtag fetch failed: ${response.status}`);
        return null;
      }

      const html = await response.text();
      
      const postCountMatch = html.match(/"edge_hashtag_to_media":{"count":(\d+)/);
      const postCount = postCountMatch ? parseInt(postCountMatch[1]) : 0;

      if (postCount === 0) {
        const altMatch = html.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?[KMB]?)\s*(?:posts|게시물)/i);
        if (altMatch) {
          const countStr = altMatch[1].replace(/,/g, "");
          let count = parseFloat(countStr);
          if (countStr.includes("K")) count *= 1000;
          if (countStr.includes("M")) count *= 1000000;
          if (countStr.includes("B")) count *= 1000000000;
          return { postCount: Math.floor(count) };
        }
      }

      return { postCount };
    } catch (error) {
      console.error(`Failed to fetch hashtag ${hashtag}:`, error);
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

  async syncHashtag(hashtagDbId: number): Promise<{ success: boolean; postCount?: number }> {
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

      await this.updateApiStatus("instagram_crawler", true);
      
      return { success: true, postCount: data.postCount };
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
