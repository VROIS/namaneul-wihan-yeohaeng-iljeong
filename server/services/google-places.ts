import { storage } from "../storage";
import type { InsertPlace, PlaceDataSource } from "@shared/schema";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1/places";

interface GooglePlaceResult {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress?: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  photos?: Array<{ name: string; widthPx: number; heightPx: number }>;
  regularOpeningHours?: { weekdayDescriptions: string[] };
  reviews?: Array<{
    name: string;
    rating: number;
    text?: { text: string; languageCode: string };
    authorAttribution?: { displayName: string };
    publishTime?: string;
  }>;
  primaryType?: string;
}

interface SearchNearbyResponse {
  places: GooglePlaceResult[];
  nextPageToken?: string;
}

interface PlaceDetailsResponse extends GooglePlaceResult {}

export class GooglePlacesFetcher {
  private apiKey: string;

  constructor() {
    this.apiKey = GOOGLE_MAPS_API_KEY || "";
    if (!this.apiKey) {
      console.warn("GOOGLE_MAPS_API_KEY is not set. Google Places API will not work.");
    }
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error("Google Maps API key is not configured");
    }

    const response = await fetch(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
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
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.priceLevel",
      "places.types",
      "places.photos",
      "places.regularOpeningHours",
      "places.primaryType",
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
      "location",
      "rating",
      "userRatingCount",
      "priceLevel",
      "types",
      "photos",
      "regularOpeningHours",
      "reviews",
      "primaryType",
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
    return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${this.apiKey}`;
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

    const photoUrls = googlePlace.photos?.slice(0, 5).map(p => 
      `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${this.apiKey}`
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
      latitude: googlePlace.location.latitude,
      longitude: googlePlace.location.longitude,
      priceLevel: googlePlace.priceLevel ? priceLevelMap[googlePlace.priceLevel] : undefined,
      photoUrls,
      openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
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
      rating: googlePlace.rating,
      reviewCount: googlePlace.userRatingCount,
      priceLevel: googlePlace.priceLevel ? priceLevelMap[googlePlace.priceLevel] : undefined,
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

    return placeId;
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
