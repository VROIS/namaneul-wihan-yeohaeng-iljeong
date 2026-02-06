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

interface CaptionTrack {
  baseUrl: string;
  language: string;
  languageCode: string;
}

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
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

      if (!channel.channelId) {
        result.errors.push(`Channel ${channel.channelName} has no YouTube channel ID`);
        return result;
      }

      console.log(`[YouTube] Syncing channel: ${channel.channelName}`);

      const videos = await this.fetchChannelVideos(channel.channelId, maxVideos);
      console.log(`[YouTube] Found ${videos.length} videos`);

      for (const video of videos) {
        try {
          const existingVideo = await db.query.youtubeVideos.findFirst({
            where: eq(youtubeVideos.videoId, video.id),
          });

          // 이미 처리 완료된 영상은 건너뛰기
          if (existingVideo && existingVideo.isProcessed) {
            continue;
          }
          
          // 미처리 영상이면 장소 추출 재시도
          if (existingVideo && !existingVideo.isProcessed) {
            console.log(`[YouTube] 미처리 영상 재시도: ${existingVideo.title}`);
            try {
              const transcript = await this.fetchTranscript(video.id);
              const places = await this.extractPlacesWithGemini(
                existingVideo.title,
                existingVideo.description || '',
                transcript
              );
              
              console.log(`[YouTube] 재처리 결과: ${places.length}개 장소 추출`);
              
              for (const place of places) {
                await db.insert(youtubePlaceMentions).values({
                  videoId: existingVideo.id,
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
              
              // 장소 추출 성공 또는 자막 없는 경우 처리 완료 표시
              await db
                .update(youtubeVideos)
                .set({
                  isProcessed: true,
                  extractedPlaces: places.map((p) => p.placeName),
                })
                .where(eq(youtubeVideos.id, existingVideo.id));
              
              await this.delay(1000);
            } catch (retryError: any) {
              console.error(`[YouTube] 재처리 실패 (${video.id}):`, retryError.message);
            }
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

          // 자막 가져오기
          const transcript = await this.fetchTranscript(video.id);
          console.log(`[YouTube] Transcript segments: ${transcript.length}`);

          // 자막 + 제목 + 설명으로 장소 추출
          const places = await this.extractPlacesWithGemini(
            video.snippet.title,
            video.snippet.description,
            transcript
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

  /**
   * YouTube 영상의 자막(Captions)을 가져옵니다.
   * YouTube Data API의 captions.list는 OAuth가 필요하므로,
   * 공개 자막은 youtube-transcript 방식으로 가져옵니다.
   */
  private async fetchTranscript(videoId: string): Promise<TranscriptSegment[]> {
    try {
      // YouTube 페이지에서 자막 데이터 추출 (innertube API 방식)
      const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await fetch(videoPageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (!response.ok) {
        console.log(`[YouTube] Failed to fetch video page: ${response.status}`);
        return [];
      }

      const html = await response.text();
      
      // timedtext URL 추출
      const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (!captionMatch) {
        console.log(`[YouTube] No captions found for video ${videoId}`);
        return [];
      }

      const captionTracks = JSON.parse(captionMatch[1]) as CaptionTrack[];
      
      // 한국어 자막 우선, 없으면 첫 번째 자막
      const koTrack = captionTracks.find(t => t.languageCode === "ko" || t.languageCode === "ko-KR");
      const track = koTrack || captionTracks[0];
      
      if (!track?.baseUrl) {
        console.log(`[YouTube] No valid caption track for video ${videoId}`);
        return [];
      }

      // 자막 XML 가져오기
      const captionUrl = track.baseUrl.replace(/\\u0026/g, "&");
      const captionResponse = await fetch(captionUrl);
      
      if (!captionResponse.ok) {
        console.log(`[YouTube] Failed to fetch captions: ${captionResponse.status}`);
        return [];
      }

      const captionXml = await captionResponse.text();
      
      // XML 파싱하여 세그먼트 추출
      const segments: TranscriptSegment[] = [];
      const textMatches = captionXml.matchAll(/<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g);
      
      for (const match of textMatches) {
        segments.push({
          start: parseFloat(match[1]),
          duration: parseFloat(match[2]),
          text: this.decodeHtmlEntities(match[3]),
        });
      }

      console.log(`[YouTube] Extracted ${segments.length} transcript segments for video ${videoId}`);
      return segments;
    } catch (error) {
      console.error(`[YouTube] Transcript fetch error for ${videoId}:`, error);
      return [];
    }
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\\n/g, " ");
  }

  /**
   * 자막 텍스트를 시간대별로 그룹핑합니다 (30초 단위).
   */
  private groupTranscriptByTime(segments: TranscriptSegment[], groupSeconds: number = 30): { startTime: number; endTime: number; text: string }[] {
    if (segments.length === 0) return [];

    const groups: { startTime: number; endTime: number; text: string }[] = [];
    let currentGroup = {
      startTime: segments[0].start,
      endTime: segments[0].start + segments[0].duration,
      text: segments[0].text,
    };

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      const segmentEnd = segment.start + segment.duration;

      // 같은 그룹에 포함 (30초 이내)
      if (segment.start - currentGroup.startTime < groupSeconds) {
        currentGroup.text += " " + segment.text;
        currentGroup.endTime = segmentEnd;
      } else {
        // 새 그룹 시작
        groups.push({ ...currentGroup });
        currentGroup = {
          startTime: segment.start,
          endTime: segmentEnd,
          text: segment.text,
        };
      }
    }
    
    // 마지막 그룹 추가
    groups.push(currentGroup);
    
    return groups;
  }

  /**
   * 자막 + 제목 + 설명에서 장소와 타임스탬프를 추출합니다.
   */
  private async extractPlacesWithGemini(
    title: string,
    description: string,
    transcript?: TranscriptSegment[]
  ): Promise<ExtractedPlace[]> {
    // 자막이 있으면 시간대별로 그룹핑
    let transcriptContext = "";
    if (transcript && transcript.length > 0) {
      const groups = this.groupTranscriptByTime(transcript, 60); // 60초 단위
      transcriptContext = groups
        .slice(0, 30) // 최대 30개 그룹 (약 30분)
        .map(g => `[${this.formatTime(g.startTime)}~${this.formatTime(g.endTime)}] ${g.text}`)
        .join("\n");
    }

    const prompt = `당신은 여행 유튜브 영상에서 장소 정보를 추출하는 전문가입니다.

다음 영상 제목, 설명${transcriptContext ? ", 그리고 자막" : ""}에서 언급된 여행 장소(음식점, 카페, 관광지, 호텔 등)를 추출해주세요.

제목: ${title}
설명: ${description?.substring(0, 1500) || "설명 없음"}
${transcriptContext ? `\n자막 (시간대별):\n${transcriptContext.substring(0, 4000)}` : ""}

각 장소에 대해 다음 정보를 추출해주세요:
- placeName: 장소 이름 (정확한 상호명, 원어로)
- cityName: 도시 또는 지역 이름
- timestampStart: 해당 장소가 언급되기 시작하는 시간 (초 단위, 자막 기준)
- timestampEnd: 해당 장소 언급이 끝나는 시간 (초 단위)
- sentiment: 긍정적(positive), 부정적(negative), 중립(neutral)
- summary: 영상에서 이 장소에 대해 언급한 핵심 내용 요약 (한 문장, 한국어)
- confidence: 추출 신뢰도 0.0-1.0

JSON 배열 형식으로만 응답해주세요:
[
  {
    "placeName": "장소명",
    "cityName": "도시명",
    "timestampStart": 345,
    "timestampEnd": 480,
    "sentiment": "positive",
    "summary": "성시경이 '인생 국물'이라고 극찬한 순간",
    "confidence": 0.9
  }
]

중요:
- 실제 존재하는 장소만 추출하세요 (일반 명사 제외)
- 자막에서 장소가 언급된 정확한 시간대를 찾아주세요
- 장소가 없으면 빈 배열 []을 반환하세요`;

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

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
