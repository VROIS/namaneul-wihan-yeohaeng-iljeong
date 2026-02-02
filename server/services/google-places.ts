import { storage } from "../storage";
import type { InsertPlace, PlaceDataSource } from "@shared/schema";

// 🎯 동적으로 API 키 가져오기 (DB에서 로드 후 process.env에 설정됨)
function getGoogleMapsApiKey(): string {
  return process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || "";
}

const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1/places";

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

  async searchNearby(
    latitude: number,
    longitude: number,
    type: "restaurant" | "attraction" | "cafe" | "hotel",
    radiusMeters: number = 5000
  ): Promise<GooglePlaceResult[]> {
    const typeMap: Record<string, string[]> = {
      restaurant: ["restaurant", "food"],
      attraction: ["tourist_attraction", "museum", "art_gallery", "park", "church", "historical_landmark"],
      cafe: ["cafe", "coffee_shop"],
      hotel: ["hotel", "lodging"],
    };

    const includedTypes = typeMap[type] || [type];

    const requestBody = {
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      },
    };

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.shortFormattedAddress",
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.priceLevel",
      "places.types",
      "places.primaryType",
      "places.primaryTypeDisplayName",
      "places.photos",
      "places.regularOpeningHours",
      "places.currentOpeningHours",
      "places.websiteUri",
      "places.googleMapsUri",
      "places.internationalPhoneNumber",
      "places.nationalPhoneNumber",
      "places.editorialSummary",
      "places.businessStatus",
      "places.utcOffsetMinutes",
      "places.delivery",
      "places.dineIn",
      "places.takeout",
      "places.curbsidePickup",
      "places.reservable",
      "places.servesBeer",
      "places.servesWine",
      "places.servesBreakfast",
      "places.servesBrunch",
      "places.servesLunch",
      "places.servesDinner",
      "places.servesVegetarianFood",
      "places.servesCoffee",
      "places.servesDessert",
      "places.goodForChildren",
      "places.goodForGroups",
      "places.goodForWatchingSports",
      "places.liveMusic",
      "places.outdoorSeating",
      "places.restroom",
      "places.menuForChildren",
      "places.allowsDogs",
      "places.accessibilityOptions",
      "places.parkingOptions",
      "places.paymentOptions",
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
      "currentOpeningHours",
      "reviews",
      "websiteUri",
      "googleMapsUri",
      "internationalPhoneNumber",
      "nationalPhoneNumber",
      "editorialSummary",
      "businessStatus",
      "utcOffsetMinutes",
      "delivery",
      "dineIn",
      "takeout",
      "curbsidePickup",
      "reservable",
      "servesBeer",
      "servesWine",
      "servesBreakfast",
      "servesBrunch",
      "servesLunch",
      "servesDinner",
      "servesVegetarianFood",
      "servesCoffee",
      "servesDessert",
      "goodForChildren",
      "goodForGroups",
      "goodForWatchingSports",
      "liveMusic",
      "outdoorSeating",
      "restroom",
      "menuForChildren",
      "allowsDogs",
      "accessibilityOptions",
      "parkingOptions",
      "paymentOptions",
      "priceRange",
      "attributions",
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

    const placeData: InsertPlace = {
      cityId,
      googlePlaceId: googlePlace.id,
      name: googlePlace.displayName.text,
      type: placeType,
      address: googlePlace.formattedAddress,
      shortAddress: googlePlace.shortFormattedAddress,
      latitude: googlePlace.location.latitude,
      longitude: googlePlace.location.longitude,
      priceLevel: googlePlace.priceLevel ? priceLevelMap[googlePlace.priceLevel] : undefined,
      photoUrls,
      openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      
      websiteUri: googlePlace.websiteUri,
      googleMapsUri: googlePlace.googleMapsUri,
      phoneNumber: googlePlace.internationalPhoneNumber || googlePlace.nationalPhoneNumber,
      editorialSummary: googlePlace.editorialSummary?.text,
      businessStatus: googlePlace.businessStatus,
      
      userRatingCount: googlePlace.userRatingCount,
      
      delivery: googlePlace.delivery,
      dineIn: googlePlace.dineIn,
      takeout: googlePlace.takeout,
      curbsidePickup: googlePlace.curbsidePickup,
      reservable: googlePlace.reservable,
      
      servesBeer: googlePlace.servesBeer,
      servesWine: googlePlace.servesWine,
      servesBreakfast: googlePlace.servesBreakfast,
      servesBrunch: googlePlace.servesBrunch,
      servesLunch: googlePlace.servesLunch,
      servesDinner: googlePlace.servesDinner,
      servesVegetarianFood: googlePlace.servesVegetarianFood,
      servesCoffee: googlePlace.servesCoffee,
      servesDessert: googlePlace.servesDessert,
      
      goodForChildren: googlePlace.goodForChildren,
      goodForGroups: googlePlace.goodForGroups,
      goodForWatchingSports: googlePlace.goodForWatchingSports,
      
      liveMusic: googlePlace.liveMusic,
      outdoorSeating: googlePlace.outdoorSeating,
      restroom: googlePlace.restroom,
      menuForChildren: googlePlace.menuForChildren,
      allowsDogs: googlePlace.allowsDogs,
      
      accessibilityOptions: googlePlace.accessibilityOptions,
      parkingOptions: googlePlace.parkingOptions,
      paymentOptions: googlePlace.paymentOptions,
      
      lastDataSync: new Date(),
    };

    let placeId: number;
    if (existingPlace) {
      placeId = existingPlace.id;
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
