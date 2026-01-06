import { db } from "../db";
import { youtubeChannels, youtubeVideos, apiServiceStatus } from "@shared/schema";
import { eq } from "drizzle-orm";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeVideoResult {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelId: string;
    channelTitle: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items: YouTubeVideoResult[];
  nextPageToken?: string;
  pageInfo: { totalResults: number; resultsPerPage: number };
}

interface YouTubeChannelResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      thumbnails: { default?: { url: string }; medium?: { url: string } };
    };
    statistics: {
      subscriberCount: string;
      videoCount: string;
      viewCount: string;
    };
  }>;
}

export class YouTubeFetcher {
  private apiKey: string;

  constructor() {
    this.apiKey = YOUTUBE_API_KEY || "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
      throw new Error("YouTube API key is not configured");
    }

    const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
    url.searchParams.set("key", this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.text();
      await this.updateApiStatus(false, `API Error: ${response.status}`);
      throw new Error(`YouTube API error: ${response.status} - ${error}`);
    }

    await this.updateApiStatus(true);
    return response.json();
  }

  private async updateApiStatus(success: boolean, errorMessage?: string) {
    try {
      await db
        .update(apiServiceStatus)
        .set({
          lastCallAt: new Date(),
          lastSuccessAt: success ? new Date() : undefined,
          lastErrorAt: success ? undefined : new Date(),
          lastErrorMessage: errorMessage || null,
          dailyCallCount: 1,
        })
        .where(eq(apiServiceStatus.serviceName, "youtube_data"));
    } catch (e) {
      console.error("Failed to update API status:", e);
    }
  }

  async getChannelDetails(channelId: string): Promise<{
    title: string;
    thumbnailUrl: string;
    subscriberCount: number;
    videoCount: number;
  } | null> {
    try {
      const response = await this.makeRequest<YouTubeChannelResponse>("channels", {
        part: "snippet,statistics",
        id: channelId,
      });

      if (!response.items || response.items.length === 0) {
        return null;
      }

      const channel = response.items[0];
      return {
        title: channel.snippet.title,
        thumbnailUrl: channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url || "",
        subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
        videoCount: parseInt(channel.statistics.videoCount) || 0,
      };
    } catch (error) {
      console.error(`Failed to get channel details for ${channelId}:`, error);
      return null;
    }
  }

  async searchChannelVideos(
    channelId: string,
    query?: string,
    maxResults: number = 10
  ): Promise<YouTubeVideoResult[]> {
    try {
      const params: Record<string, string> = {
        part: "snippet",
        channelId,
        type: "video",
        order: "date",
        maxResults: maxResults.toString(),
      };

      if (query) {
        params.q = query;
      }

      const response = await this.makeRequest<YouTubeSearchResponse>("search", params);
      return response.items || [];
    } catch (error) {
      console.error(`Failed to search videos for channel ${channelId}:`, error);
      return [];
    }
  }

  async syncChannelVideos(channelDbId: number): Promise<{ synced: number; failed: number }> {
    const [channel] = await db
      .select()
      .from(youtubeChannels)
      .where(eq(youtubeChannels.id, channelDbId));

    if (!channel) {
      throw new Error("Channel not found");
    }

    const channelDetails = await this.getChannelDetails(channel.channelId);
    if (channelDetails) {
      await db
        .update(youtubeChannels)
        .set({
          channelName: channelDetails.title,
          thumbnailUrl: channelDetails.thumbnailUrl,
          subscriberCount: channelDetails.subscriberCount,
          videoCount: channelDetails.videoCount,
          updatedAt: new Date(),
        })
        .where(eq(youtubeChannels.id, channelDbId));
    }

    const videos = await this.searchChannelVideos(channel.channelId, undefined, 20);
    
    let synced = 0;
    let failed = 0;

    for (const video of videos) {
      try {
        const existingVideo = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, video.id.videoId))
          .limit(1);

        if (existingVideo.length === 0) {
          await db.insert(youtubeVideos).values({
            channelId: channelDbId,
            videoId: video.id.videoId,
            title: video.snippet.title,
            description: video.snippet.description.substring(0, 2000),
            thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url || "",
            publishedAt: new Date(video.snippet.publishedAt),
          });
        }
        synced++;
      } catch (error) {
        console.error(`Failed to sync video ${video.id.videoId}:`, error);
        failed++;
      }
    }

    await db
      .update(youtubeChannels)
      .set({
        lastVideoSyncAt: new Date(),
        totalVideosSynced: synced,
        updatedAt: new Date(),
      })
      .where(eq(youtubeChannels.id, channelDbId));

    return { synced, failed };
  }

  async syncAllChannels(): Promise<{ totalSynced: number; totalFailed: number; channelsSynced: number }> {
    const channels = await db
      .select()
      .from(youtubeChannels)
      .where(eq(youtubeChannels.isActive, true));

    let totalSynced = 0;
    let totalFailed = 0;
    let channelsSynced = 0;

    for (const channel of channels) {
      try {
        const result = await this.syncChannelVideos(channel.id);
        totalSynced += result.synced;
        totalFailed += result.failed;
        channelsSynced++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to sync channel ${channel.channelName}:`, error);
        totalFailed++;
      }
    }

    return { totalSynced, totalFailed, channelsSynced };
  }
}

export const youtubeFetcher = new YouTubeFetcher();
