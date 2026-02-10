import { storage } from "../storage";
import type { InsertPlace, PlaceDataSource } from "@shared/schema";

// 🎯 동적으로 API 키 가져오기 (DB에서 로드 후 process.env에 설정됨)
function getGoogleMapsApiKey(): string {
  return process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || "";
}

const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1/places";

// 💰 일일 API 호출 제한 안전장치 (요금 폭탄 방지)
// ⚠️ 모든 Google Places API 호출은 반드시 이 tracker를 거쳐야 함!
// ag3-data-matcher.ts, route-optimizer.ts 등에서도 import하여 사용
export const DAILY_API_LIMIT = 500; // 무료 티어 범위 내 (Pro: 5,000/월 → ~166/일)
export const apiCallTracker = {
  date: new Date().toDateString(),
  count: 0,
  blocked: 0,
  
  canMakeRequest(): boolean {
    const today = new Date().toDateString();
    if (this.date !== today) {
      // 날짜가 바뀌면 카운터 리셋
      console.log(`[Places API] 일일 카운터 리셋: 어제 ${this.count}건 사용, ${this.blocked}건 차단`);
      this.date = today;
      this.count = 0;
      this.blocked = 0;
    }
    return this.count < DAILY_API_LIMIT;
  },
  
  recordCall(): void {
    this.count++;
    if (this.count % 50 === 0) {
      console.log(`[Places API] 일일 사용량: ${this.count}/${DAILY_API_LIMIT} (${Math.round(this.count / DAILY_API_LIMIT * 100)}%)`);
    }
  },
  
  recordBlocked(): void {
    this.blocked++;
    if (this.blocked === 1 || this.blocked % 10 === 0) {
      console.warn(`⚠️ [Places API] 일일 한도 초과! ${this.count}/${DAILY_API_LIMIT} 도달. ${this.blocked}건 차단됨.`);
    }
  },
  
  getStatus() {
    return {
      date: this.date,
      used: this.count,
      limit: DAILY_API_LIMIT,
      blocked: this.blocked,
      remaining: Math.max(0, DAILY_API_LIMIT - this.count),
    };
  }
};

interface GooglePlaceResult {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string; languageCode: string };
  
  photos?: Array<{ 
    name: string; 
    widthPx: number; 
    heightPx: number;
    authorAttributions?: Array<{ displayName: string; uri: string }>;
  }>;
  
  regularOpeningHours?: { 
    weekdayDescriptions: string[];
    openNow?: boolean;
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  
  reviews?: Array<{
    name: string;
    rating: number;
    text?: { text: string; languageCode: string };
    originalText?: { text: string; languageCode: string };
    authorAttribution?: { displayName: string; uri?: string; photoUri?: string };
    publishTime?: string;
    relativePublishTimeDescription?: string;
  }>;
  
  websiteUri?: string;
  googleMapsUri?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  
  editorialSummary?: { text: string; languageCode: string };
  
  businessStatus?: string;
  utcOffsetMinutes?: number;
  
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  curbsidePickup?: boolean;
  reservable?: boolean;
  
  servesBeer?: boolean;
  servesWine?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesVegetarianFood?: boolean;
  servesCoffee?: boolean;
  servesDessert?: boolean;
  
  goodForChildren?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  
  liveMusic?: boolean;
  outdoorSeating?: boolean;
  restroom?: boolean;
  menuForChildren?: boolean;
  allowsDogs?: boolean;
  
  accessibilityOptions?: {
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  
  parkingOptions?: {
    freeParkingLot?: boolean;
    paidParkingLot?: boolean;
    freeStreetParking?: boolean;
    paidStreetParking?: boolean;
    valetParking?: boolean;
    freeGarageParking?: boolean;
    paidGarageParking?: boolean;
  };
  
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
  
  priceRange?: {
    startPrice?: { currencyCode: string; units: string };
    endPrice?: { currencyCode: string; units: string };
  };
  
  attributions?: Array<{ provider: string; providerUri: string }>;
}

interface SearchNearbyResponse {
  places: GooglePlaceResult[];
  nextPageToken?: string;
}

interface PlaceDetailsResponse extends GooglePlaceResult {}

export class GooglePlacesFetcher {
  // 🎯 API 키를 동적으로 가져옴 (DB에서 로드 후 사용 가능)
  private getApiKey(): string {
    return getGoogleMapsApiKey();
  }

  constructor() {
    // 초기화 시점에 경고만 출력 (실제 사용 시 다시 확인)
    if (!this.getApiKey()) {
      console.warn("GOOGLE_MAPS_API_KEY is not set. Google Places API will not work.");
    }
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Google Maps API key is not configured");
    }

    // 💰 일일 한도 체크 (요금 폭탄 방지)
    if (!apiCallTracker.canMakeRequest()) {
      apiCallTracker.recordBlocked();
      throw new Error(
        `[BILLING PROTECTION] 일일 Places API 한도 초과 (${DAILY_API_LIMIT}건). ` +
        `오늘 ${apiCallTracker.getStatus().blocked}건 차단됨. 내일 자동 리셋됩니다.`
      );
    }

    apiCallTracker.recordCall();

    const response = await fetch(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Places API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // 외부에서 API 사용 현황 조회 가능
  getApiUsageStatus() {
    return apiCallTracker.getStatus();
  }

  async searchNearby(
    latitude: number,
    longitude: number,
    type: "restaurant" | "attraction" | "cafe" | "hotel",
    radiusMeters: number = 5000
  ): Promise<GooglePlaceResult[]> {
    const typeMap: Record<string, string[]> = {
      restaurant: ["restaurant"],  // "food"는 Places API(New)에서 미지원
      attraction: ["tourist_attraction", "museum", "art_gallery", "park", "church", "historical_landmark"],
      cafe: ["cafe", "coffee_shop"],
      hotel: ["hotel", "lodging"],
    };

    const includedTypes = typeMap[type] || [type];

    const requestBody = {
      includedTypes,
      maxResultCount: 20,
      rankPreference: "POPULARITY",  // 🔥 구글 리뷰 많은 순 (인기순) 정렬
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      },
    };

    // 💰 비용 최적화: Enterprise 등급 필드만 유지 (Atmosphere 필드 26개 제거)
    // Before: 45개 필드 → Enterprise+Atmosphere ($40/1K) = €1,001 폭탄 원인
    // After:  13개 필드 → Enterprise ($35/1K), 실제로는 DB 우선 매칭으로 거의 호출 안 함
    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.shortFormattedAddress",
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.types",
      "places.primaryType",
      "places.primaryTypeDisplayName",
      "places.photos",
      "places.googleMapsUri",
      "places.businessStatus",
    ].join(",");

    const response = await this.makeRequest<SearchNearbyResponse>(
      `${GOOGLE_PLACES_BASE_URL}:searchNearby`,
      {
        method: "POST",
        headers: {
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(requestBody),
      }
    );

    return response.places || [];
  }

  async getPlaceDetails(placeId: string): Promise<GooglePlaceResult> {
    // 💰 비용 최적화: Enterprise 등급 필드만 유지 (Atmosphere 필드 26개 제거)
    // Before: 48개 필드 → Enterprise+Atmosphere ($40/1K)
    // After:  15개 필드 → Enterprise ($35/1K), reviews는 한국어 리뷰 분석에 필요하므로 유지
    const fieldMask = [
      "id",
      "displayName",
      "formattedAddress",
      "shortFormattedAddress",
      "location",
      "rating",
      "userRatingCount",
      "priceLevel",
      "types",
      "primaryType",
      "primaryTypeDisplayName",
      "photos",
      "regularOpeningHours",
      "reviews",
      "googleMapsUri",
      "businessStatus",
      "editorialSummary",    // 장소 설명 (Basic 등급, 추가 비용 없음)
      "websiteUri",          // 웹사이트 (Basic 등급, 추가 비용 없음)
      "internationalPhoneNumber", // 전화번호 (Basic 등급, 추가 비용 없음)
    ].join(",");

    return this.makeRequest<PlaceDetailsResponse>(
      `${GOOGLE_PLACES_BASE_URL}/${placeId}`,
      {
        method: "GET",
        headers: {
          "X-Goog-FieldMask": fieldMask,
        },
      }
    );
  }

  async getPhotoUrl(photoName: string, maxWidth: number = 400): Promise<string> {
    return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${this.getApiKey()}`;
  }

  async fetchAndStorePlace(
    googlePlace: GooglePlaceResult,
    cityId: number,
    placeType: "restaurant" | "attraction" | "cafe" | "hotel" | "landmark"
  ): Promise<number> {
    const existingPlace = await storage.getPlaceByGoogleId(googlePlace.id);
    
    const priceLevelMap: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };

    const photoUrls = googlePlace.photos?.slice(0, 10).map(p => 
      `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=1200&key=${this.getApiKey()}`
    ) || [];

    const openingHours: Record<string, string> = {};
    googlePlace.regularOpeningHours?.weekdayDescriptions?.forEach((desc, i) => {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      openingHours[days[i]] = desc;
    });

    // 🔗 규약: 한국어 표시명 생성 (Google displayName이 영어면 그대로, 한국어면 displayNameKo로)
    const rawName = googlePlace.displayName.text;
    const langCode = googlePlace.displayName.languageCode || "";
    const isKorean = langCode === "ko" || /[가-힣]/.test(rawName);
    const displayNameKo = isKorean ? rawName : undefined;
    // aliases: 원본명을 별칭으로 저장 (추후 AG3 자동 학습으로 확장됨)
    const aliases: string[] = [];
    if (displayNameKo && displayNameKo !== rawName) aliases.push(displayNameKo);

    const placeData: InsertPlace = {
      cityId,
      googlePlaceId: googlePlace.id,
      name: rawName,
      displayNameKo,                   // 🔗 한국어 표시명 (규약)
      aliases,                          // 🔗 별칭 배열 (규약)
      type: placeType,
      address: googlePlace.formattedAddress,
      shortAddress: googlePlace.shortFormattedAddress,
      latitude: googlePlace.location.latitude,
      longitude: googlePlace.location.longitude,
      priceLevel: googlePlace.priceLevel ? priceLevelMap[googlePlace.priceLevel] : undefined,
      photoUrls,
      openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      
      // ✅ 이전에 누락되었던 필수 필드들 (Basic 등급, 추가 비용 없음)
      // rating 컬럼은 실제 DB에서 삭제됨 → buzzScore로 대체
      websiteUri: googlePlace.websiteUri ?? undefined,
      googleMapsUri: googlePlace.googleMapsUri,
      phoneNumber: (googlePlace as any).internationalPhoneNumber ?? undefined,
      editorialSummary: (googlePlace as any).editorialSummary?.text ?? undefined,
      businessStatus: googlePlace.businessStatus,
      
      userRatingCount: googlePlace.userRatingCount,
      buzzScore: googlePlace.rating ? Math.min(10, googlePlace.rating * 2) : undefined,
      
      // 💰 Atmosphere 필드는 비용 최적화로 더 이상 요청하지 않음 (€1,001 폭탄 방지)
      // DB에 이미 있는 기존 데이터는 보존됨, 새 장소에는 null로 저장
      
      lastDataSync: new Date(),
    };

    let placeId: number;
    if (existingPlace) {
      placeId = existingPlace.id;
      // ✅ 기존 장소도 최신 데이터로 업데이트 (이전에는 건너뛰었음)
      try {
        await storage.updatePlaceData(placeId, {
          userRatingCount: placeData.userRatingCount,
          googleMapsUri: placeData.googleMapsUri,
          editorialSummary: placeData.editorialSummary,
          websiteUri: placeData.websiteUri,
          phoneNumber: placeData.phoneNumber,
          photoUrls: placeData.photoUrls,
          openingHours: placeData.openingHours,
          priceLevel: placeData.priceLevel,
          businessStatus: placeData.businessStatus,
          buzzScore: placeData.buzzScore,
          lastDataSync: placeData.lastDataSync,
        });
        console.log(`[Places] 기존 장소 업데이트: ${placeData.name} (id: ${placeId})`);
      } catch (e) {
        console.error(`[Places] 기존 장소 업데이트 실패: ${placeData.name}`, e);
      }
    } else {
      const newPlace = await storage.createPlace(placeData);
      placeId = newPlace.id;
    }

    await storage.upsertPlaceDataSource({
      placeId,
      source: "google",
      sourceId: googlePlace.id,
      sourceUrl: googlePlace.googleMapsUri ?? null,
      rating: googlePlace.rating ?? null,
      reviewCount: googlePlace.userRatingCount ?? null,
      priceLevel: googlePlace.priceLevel ? priceLevelMap[googlePlace.priceLevel] : null,
      rankingInCategory: null,
      isMichelinStar: false,
      michelinType: null,
      rawData: googlePlace as any,
    });

    if (googlePlace.reviews) {
      for (const review of googlePlace.reviews.slice(0, 10)) {
        if (review.text) {
          await storage.createReview({
            placeId,
            source: "google",
            sourceReviewId: review.name,
            language: review.text.languageCode,
            rating: review.rating,
            text: review.text.text,
            reviewDate: review.publishTime ? new Date(review.publishTime) : null,
            isOriginatorLanguage: false,
            sentimentScore: null,
            authenticityKeywords: null,
            authorCountry: null,
          });
        }
      }
    }

    this.scheduleInstagramCollection(placeId);

    return placeId;
  }

  private async scheduleInstagramCollection(placeId: number): Promise<void> {
    try {
      const { instagramAutoCollector } = await import("./instagram-auto-collector");
      setTimeout(async () => {
        try {
          await instagramAutoCollector.collectForPlace(placeId);
        } catch (error) {
          console.error(`[Instagram Auto] Failed to collect for place ${placeId}:`, error);
        }
      }, 100);
    } catch (error) {
      console.error(`[Instagram Auto] Failed to import collector:`, error);
    }
  }

  async syncCityPlaces(
    cityId: number,
    latitude: number,
    longitude: number,
    types: ("restaurant" | "attraction" | "cafe" | "hotel")[] = ["restaurant", "attraction"]
  ): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    for (const type of types) {
      try {
        const places = await this.searchNearby(latitude, longitude, type);
        
        for (const place of places) {
          try {
            const details = await this.getPlaceDetails(place.id);
            await this.fetchAndStorePlace(details, cityId, type);
            synced++;
          } catch (error) {
            console.error(`Failed to fetch place ${place.id}:`, error);
            failed++;
          }
        }
      } catch (error) {
        console.error(`Failed to search ${type} places:`, error);
      }
    }

    await storage.logDataSync({
      entityType: "city_places",
      entityId: cityId,
      source: "google",
      status: failed === 0 ? "success" : "partial",
      itemsProcessed: synced,
      itemsFailed: failed,
      completedAt: new Date(),
      errorMessage: null,
    });

    return { synced, failed };
  }
}

export const googlePlacesFetcher = new GooglePlacesFetcher();
