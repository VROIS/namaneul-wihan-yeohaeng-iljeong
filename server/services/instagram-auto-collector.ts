import { db } from "../db";
import { instagramHashtags, instagramPhotos, places } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { InstagramCrawler } from "./instagram-crawler";

interface PlaceInfo {
  id: number;
  name: string;
  cityName: string;
  type: string;
}

const CITY_KOREAN_NAMES: Record<string, string> = {
  "Paris": "파리",
  "Tokyo": "도쿄",
  "Osaka": "오사카",
  "Seoul": "서울",
  "Rome": "로마",
  "Barcelona": "바르셀로나",
  "Bangkok": "방콕",
  "New York": "뉴욕",
  "London": "런던",
  "Sydney": "시드니",
  "Singapore": "싱가포르",
  "Hong Kong": "홍콩",
  "Dubai": "두바이",
  "Amsterdam": "암스테르담",
  "Prague": "프라하",
  "Vienna": "비엔나",
  "Berlin": "베를린",
  "Istanbul": "이스탄불",
  "Bali": "발리",
  "Kyoto": "교토",
  "Florence": "피렌체",
  "Venice": "베니스",
  "Milan": "밀라노",
  "Nice": "니스",
  "Lyon": "리옹",
};

const PLACE_TYPE_KOREAN: Record<string, string[]> = {
  "restaurant": ["맛집", "맛있는곳", "레스토랑"],
  "attraction": ["여행", "관광", "명소"],
  "cafe": ["카페", "커피"],
  "hotel": ["호텔", "숙소"],
  "landmark": ["명소", "관광지"],
};

export class InstagramAutoCollector {
  private crawler: InstagramCrawler;

  constructor() {
    this.crawler = new InstagramCrawler();
  }

  generateHashtags(place: PlaceInfo): string[] {
    const hashtags: string[] = [];
    const koreanCityName = CITY_KOREAN_NAMES[place.cityName] || place.cityName;
    const typeKeywords = PLACE_TYPE_KOREAN[place.type] || ["여행"];

    hashtags.push(`#${place.name.replace(/\s+/g, "")}`);
    
    const englishName = place.name.replace(/\s+/g, "").toLowerCase();
    if (englishName !== place.name.replace(/\s+/g, "")) {
      hashtags.push(`#${englishName}`);
    }

    for (const typeKw of typeKeywords.slice(0, 2)) {
      hashtags.push(`#${koreanCityName}${typeKw}`);
    }

    hashtags.push(`#${koreanCityName}여행`);

    if (place.type === "restaurant" || place.type === "cafe") {
      hashtags.push(`#${koreanCityName}추천맛집`);
    }

    return [...new Set(hashtags)].slice(0, 8);
  }

  async collectForPlace(placeId: number): Promise<{
    hashtags: string[];
    totalPostCount: number;
    photoUrls: string[];
  }> {
    const placeData = await db.query.places.findFirst({
      where: eq(places.id, placeId),
      with: {
        city: true,
      },
    });

    if (!placeData || !placeData.city) {
      console.error(`Place ${placeId} not found or has no city`);
      return { hashtags: [], totalPostCount: 0, photoUrls: [] };
    }

    const placeInfo: PlaceInfo = {
      id: placeData.id,
      name: placeData.name,
      cityName: placeData.city.name,
      type: placeData.type,
    };

    const generatedHashtags = this.generateHashtags(placeInfo);
    let totalPostCount = 0;
    const collectedPhotoUrls: string[] = [];

    console.log(`[Instagram Auto] Collecting for ${placeInfo.name}: ${generatedHashtags.join(", ")}`);

    for (const hashtag of generatedHashtags) {
      try {
        const cleanHashtag = hashtag.replace(/^#/, "");
        
        const existing = await db.query.instagramHashtags.findFirst({
          where: eq(instagramHashtags.hashtag, cleanHashtag),
        });

        if (!existing) {
          await db.insert(instagramHashtags).values({
            hashtag: cleanHashtag,
            linkedPlaceId: placeId,
            linkedCityId: placeData.cityId,
            category: placeInfo.type,
            isActive: true,
          });
        }

        const hashtagData = await this.crawler.fetchHashtagData(cleanHashtag);
        
        if (hashtagData) {
          totalPostCount += hashtagData.postCount;

          await db
            .update(instagramHashtags)
            .set({
              postCount: hashtagData.postCount,
              lastSyncAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(instagramHashtags.hashtag, cleanHashtag));

          if (hashtagData.topPosts) {
            for (const post of hashtagData.topPosts.slice(0, 3)) {
              if (post.imageUrl) {
                collectedPhotoUrls.push(post.imageUrl);
                
                await db.insert(instagramPhotos).values({
                  hashtagId: existing?.id,
                  imageUrl: post.imageUrl,
                  postUrl: post.url,
                  likeCount: post.likeCount,
                  caption: post.caption?.slice(0, 500),
                  isAnalyzed: false,
                }).onConflictDoNothing();
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Instagram Auto] Error fetching hashtag ${hashtag}:`, error);
      }
    }

    if (totalPostCount > 0 || collectedPhotoUrls.length > 0) {
      await db
        .update(places)
        .set({
          instagramHashtags: generatedHashtags,
          instagramPostCount: totalPostCount,
          instagramPhotoUrls: collectedPhotoUrls.slice(0, 10),
          updatedAt: new Date(),
        })
        .where(eq(places.id, placeId));
    }

    console.log(`[Instagram Auto] Collected for ${placeInfo.name}: ${totalPostCount} posts, ${collectedPhotoUrls.length} photos`);

    return {
      hashtags: generatedHashtags,
      totalPostCount,
      photoUrls: collectedPhotoUrls,
    };
  }

  async collectForCity(cityId: number): Promise<{
    placesProcessed: number;
    totalPostCount: number;
    totalPhotos: number;
  }> {
    const cityPlaces = await db.query.places.findMany({
      where: eq(places.cityId, cityId),
    });

    let totalPostCount = 0;
    let totalPhotos = 0;

    for (const place of cityPlaces) {
      try {
        const result = await this.collectForPlace(place.id);
        totalPostCount += result.totalPostCount;
        totalPhotos += result.photoUrls.length;
      } catch (error) {
        console.error(`[Instagram Auto] Error collecting for place ${place.id}:`, error);
      }
    }

    return {
      placesProcessed: cityPlaces.length,
      totalPostCount,
      totalPhotos,
    };
  }
}

export const instagramAutoCollector = new InstagramAutoCollector();
