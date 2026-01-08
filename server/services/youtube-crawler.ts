import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import {
  youtubeChannels,
  youtubeVideos,
  youtubePlaceMentions,
  type YoutubeChannel,
  type YoutubeVideo,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

interface YouTubeVideoItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: { high?: { url: string } };
  };
}

interface YouTubeVideoDetails {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: { high?: { url: string } };
  };
  contentDetails: {
    duration: string;
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

interface ExtractedPlace {
  placeName: string;
  cityName?: string;
  timestampStart?: number;
  timestampEnd?: number;
  sentiment?: string;
  summary?: string;
  confidence: number;
}

export class YouTubeCrawler {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || "";
    if (!this.apiKey) {
      console.warn("YOUTUBE_API_KEY not configured");
    }
  }

  async syncChannelVideos(channelId: number, maxVideos: number = 10): Promise<{
    videosAdded: number;
    placesExtracted: number;
    errors: string[];
  }> {
    const result = { videosAdded: 0, placesExtracted: 0, errors: [] as string[] };

    try {
      const channel = await db.query.youtubeChannels.findFirst({
        where: eq(youtubeChannels.id, channelId),
      });

      if (!channel) {
        result.errors.push(`Channel ${channelId} not found`);
        return result;
      }

      if (!channel.youtubeChannelId) {
        result.errors.push(`Channel ${channel.channelName} has no YouTube channel ID`);
        return result;
      }

      console.log(`[YouTube] Syncing channel: ${channel.channelName}`);

      const videos = await this.fetchChannelVideos(channel.youtubeChannelId, maxVideos);
      console.log(`[YouTube] Found ${videos.length} videos`);

      for (const video of videos) {
        try {
          const existingVideo = await db.query.youtubeVideos.findFirst({
            where: eq(youtubeVideos.videoId, video.id),
          });

          if (existingVideo) {
            continue;
          }

          const [insertedVideo] = await db
            .insert(youtubeVideos)
            .values({
              channelId: channel.id,
              videoId: video.id,
              title: video.snippet.title,
              description: video.snippet.description,
              publishedAt: new Date(video.snippet.publishedAt),
              duration: this.parseDuration(video.contentDetails.duration),
              viewCount: parseInt(video.statistics.viewCount) || 0,
              likeCount: parseInt(video.statistics.likeCount) || 0,
              commentCount: parseInt(video.statistics.commentCount) || 0,
              thumbnailUrl: video.snippet.thumbnails.high?.url,
              isProcessed: false,
            })
            .returning();

          result.videosAdded++;
          console.log(`[YouTube] Added video: ${video.snippet.title}`);

          const places = await this.extractPlacesWithGemini(
            video.snippet.title,
            video.snippet.description
          );

          for (const place of places) {
            await db.insert(youtubePlaceMentions).values({
              videoId: insertedVideo.id,
              placeName: place.placeName,
              cityName: place.cityName,
              timestampStart: place.timestampStart,
              timestampEnd: place.timestampEnd,
              sentiment: place.sentiment,
              summary: place.summary,
              confidence: place.confidence,
            });
            result.placesExtracted++;
          }

          if (places.length > 0) {
            await db
              .update(youtubeVideos)
              .set({
                isProcessed: true,
                extractedPlaces: places.map((p) => p.placeName),
              })
              .where(eq(youtubeVideos.id, insertedVideo.id));
          }

          await this.delay(1000);
        } catch (videoError: any) {
          result.errors.push(`Error processing video ${video.id}: ${videoError.message}`);
        }
      }

      await db
        .update(youtubeChannels)
        .set({
          lastVideoSyncAt: new Date(),
          totalVideosSynced: sql`${youtubeChannels.totalVideosSynced} + ${result.videosAdded}`,
          totalPlacesMentioned: sql`${youtubeChannels.totalPlacesMentioned} + ${result.placesExtracted}`,
          updatedAt: new Date(),
        })
        .where(eq(youtubeChannels.id, channelId));

      console.log(`[YouTube] Channel sync complete: ${result.videosAdded} videos, ${result.placesExtracted} places`);
    } catch (error: any) {
      result.errors.push(`Channel sync failed: ${error.message}`);
    }

    return result;
  }

  async syncAllChannels(): Promise<{
    totalVideos: number;
    totalPlaces: number;
    errors: string[];
  }> {
    const result = { totalVideos: 0, totalPlaces: 0, errors: [] as string[] };

    const channels = await db.query.youtubeChannels.findMany({
      where: eq(youtubeChannels.isActive, true),
    });

    console.log(`[YouTube] Syncing ${channels.length} active channels`);

    for (const channel of channels) {
      const channelResult = await this.syncChannelVideos(channel.id, 5);
      result.totalVideos += channelResult.videosAdded;
      result.totalPlaces += channelResult.placesExtracted;
      result.errors.push(...channelResult.errors);

      await this.delay(2000);
    }

    return result;
  }

  private async fetchChannelVideos(
    youtubeChannelId: string,
    maxResults: number
  ): Promise<YouTubeVideoDetails[]> {
    if (!this.apiKey) {
      console.warn("[YouTube] API key not configured, returning empty");
      return [];
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${this.apiKey}&channelId=${youtubeChannelId}&part=snippet&type=video&order=date&maxResults=${maxResults}`;

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error(`YouTube search API failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const videoIds = searchData.items?.map((item: YouTubeVideoItem) => item.id.videoId).join(",");

    if (!videoIds) {
      return [];
    }

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${this.apiKey}&id=${videoIds}&part=snippet,contentDetails,statistics`;
    const detailsResponse = await fetch(detailsUrl);

    if (!detailsResponse.ok) {
      throw new Error(`YouTube videos API failed: ${detailsResponse.statusText}`);
    }

    const detailsData = await detailsResponse.json();
    return detailsData.items || [];
  }

  private async extractPlacesWithGemini(
    title: string,
    description: string
  ): Promise<ExtractedPlace[]> {
    const prompt = `당신은 여행 유튜브 영상에서 장소 정보를 추출하는 전문가입니다.

다음 영상 제목과 설명에서 언급된 여행 장소(음식점, 카페, 관광지, 호텔 등)를 추출해주세요.

제목: ${title}
설명: ${description?.substring(0, 2000) || "설명 없음"}

각 장소에 대해 다음 정보를 추출해주세요:
- placeName: 장소 이름 (정확한 상호명)
- cityName: 도시 또는 지역 이름
- sentiment: 긍정적(positive), 부정적(negative), 중립(neutral)
- summary: 영상에서 이 장소에 대해 언급한 내용 요약 (한 문장)
- confidence: 추출 신뢰도 0.0-1.0

JSON 배열 형식으로만 응답해주세요:
[
  {
    "placeName": "장소명",
    "cityName": "도시명",
    "sentiment": "positive",
    "summary": "요약 내용",
    "confidence": 0.9
  }
]

장소가 없으면 빈 배열 []을 반환하세요.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const places: ExtractedPlace[] = JSON.parse(jsonMatch[0]);
      return places.filter((p) => p.placeName && p.confidence > 0.5);
    } catch (error) {
      console.error("[YouTube] Gemini place extraction failed:", error);
      return [];
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || "0");
    const minutes = parseInt(match[2] || "0");
    const seconds = parseInt(match[3] || "0");

    return hours * 3600 + minutes * 60 + seconds;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getStats(): Promise<{
    totalChannels: number;
    activeChannels: number;
    totalVideos: number;
    totalPlaceMentions: number;
    lastSync: Date | null;
  }> {
    const channelStats = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${youtubeChannels.isActive} = true)`,
      })
      .from(youtubeChannels);

    const videoCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(youtubeVideos);

    const mentionCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(youtubePlaceMentions);

    const lastSyncChannel = await db.query.youtubeChannels.findFirst({
      where: sql`${youtubeChannels.lastVideoSyncAt} is not null`,
      orderBy: desc(youtubeChannels.lastVideoSyncAt),
    });

    return {
      totalChannels: Number(channelStats[0]?.total) || 0,
      activeChannels: Number(channelStats[0]?.active) || 0,
      totalVideos: Number(videoCount[0]?.count) || 0,
      totalPlaceMentions: Number(mentionCount[0]?.count) || 0,
      lastSync: lastSyncChannel?.lastVideoSyncAt || null,
    };
  }
}

export const youtubeCrawler = new YouTubeCrawler();
