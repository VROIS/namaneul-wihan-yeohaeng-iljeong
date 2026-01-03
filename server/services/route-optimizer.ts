import { storage } from "../storage";
import type { Place, RouteCache } from "@shared/schema";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface RouteStep {
  distance: number;
  duration: number;
  instruction: string;
  travelMode: string;
}

interface RouteResult {
  originPlaceId: number;
  destinationPlaceId: number;
  travelMode: string;
  distanceMeters: number;
  durationSeconds: number;
  durationInTraffic?: number;
  estimatedCost: number;
  polyline?: string;
  steps?: RouteStep[];
}

interface OptimizedItinerary {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalCost: number;
  routes: RouteResult[];
  orderedPlaceIds: number[];
}

const COST_PER_KM: Record<string, number> = {
  DRIVE: 0.5,
  TAXI: 1.5,
  TRANSIT: 0.1,
  WALK: 0,
  BICYCLE: 0,
};

const AVERAGE_SPEED_KMH: Record<string, number> = {
  DRIVE: 30,
  TAXI: 25,
  TRANSIT: 20,
  WALK: 5,
  BICYCLE: 15,
};

export class RouteOptimizer {
  private apiKey: string;

  constructor() {
    this.apiKey = GOOGLE_MAPS_API_KEY || "";
    if (!this.apiKey) {
      console.warn("GOOGLE_MAPS_API_KEY is not set. Route optimization will use estimated calculations.");
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private estimateDuration(distanceMeters: number, travelMode: string): number {
    const speedKmh = AVERAGE_SPEED_KMH[travelMode] || 20;
    const speedMs = speedKmh * 1000 / 3600;
    return Math.round(distanceMeters / speedMs);
  }

  private estimateCost(distanceMeters: number, travelMode: string): number {
    const distanceKm = distanceMeters / 1000;
    const costPerKm = COST_PER_KM[travelMode] || 0;
    
    if (travelMode === "TAXI") {
      const baseFare = 4.0;
      return baseFare + (distanceKm * costPerKm);
    }
    
    return distanceKm * costPerKm;
  }

  async getRoute(
    originPlace: Place,
    destinationPlace: Place,
    travelMode: "DRIVE" | "TRANSIT" | "WALK" | "BICYCLE" | "TAXI" = "TRANSIT"
  ): Promise<RouteResult> {
    const actualMode = travelMode === "TAXI" ? "DRIVE" : travelMode;

    const cached = await storage.getRouteCache(originPlace.id, destinationPlace.id, travelMode);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.fetchedAt).getTime();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      
      if (cacheAge < ONE_DAY) {
        return {
          originPlaceId: originPlace.id,
          destinationPlaceId: destinationPlace.id,
          travelMode,
          distanceMeters: cached.distanceMeters || 0,
          durationSeconds: cached.durationSeconds || 0,
          durationInTraffic: cached.durationInTraffic || undefined,
          estimatedCost: cached.estimatedCost || 0,
          polyline: cached.polyline || undefined,
          steps: cached.steps as RouteStep[] || undefined,
        };
      }
    }

    if (this.apiKey) {
      try {
        const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps",
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: { latitude: originPlace.latitude, longitude: originPlace.longitude },
              },
            },
            destination: {
              location: {
                latLng: { latitude: destinationPlace.latitude, longitude: destinationPlace.longitude },
              },
            },
            travelMode: actualMode,
            computeAlternativeRoutes: false,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const route = data.routes?.[0];
          
          if (route) {
            const distanceMeters = route.distanceMeters || 0;
            const durationSeconds = parseInt(route.duration?.replace("s", "") || "0");
            const estimatedCost = this.estimateCost(distanceMeters, travelMode);

            const result: RouteResult = {
              originPlaceId: originPlace.id,
              destinationPlaceId: destinationPlace.id,
              travelMode,
              distanceMeters,
              durationSeconds,
              estimatedCost,
              polyline: route.polyline?.encodedPolyline,
            };

            await storage.upsertRouteCache({
              originPlaceId: originPlace.id,
              destinationPlaceId: destinationPlace.id,
              travelMode,
              distanceMeters,
              durationSeconds,
              durationInTraffic: null,
              estimatedCost,
              polyline: route.polyline?.encodedPolyline,
              steps: null,
            });

            return result;
          }
        }
      } catch (error) {
        console.error("Google Routes API error:", error);
      }
    }

    const distanceMeters = this.calculateDistance(
      originPlace.latitude, originPlace.longitude,
      destinationPlace.latitude, destinationPlace.longitude
    );
    const durationSeconds = this.estimateDuration(distanceMeters, travelMode);
    const estimatedCost = this.estimateCost(distanceMeters, travelMode);

    const result: RouteResult = {
      originPlaceId: originPlace.id,
      destinationPlaceId: destinationPlace.id,
      travelMode,
      distanceMeters: Math.round(distanceMeters),
      durationSeconds,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
    };

    await storage.upsertRouteCache({
      originPlaceId: originPlace.id,
      destinationPlaceId: destinationPlace.id,
      travelMode,
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      durationInTraffic: null,
      estimatedCost: result.estimatedCost,
      polyline: null,
      steps: null,
    });

    return result;
  }

  async optimizeRoute(
    places: Place[],
    travelMode: "DRIVE" | "TRANSIT" | "WALK" | "BICYCLE" | "TAXI" = "TRANSIT",
    startPlaceId?: number
  ): Promise<OptimizedItinerary> {
    if (places.length === 0) {
      return {
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalCost: 0,
        routes: [],
        orderedPlaceIds: [],
      };
    }

    if (places.length === 1) {
      return {
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalCost: 0,
        routes: [],
        orderedPlaceIds: [places[0].id],
      };
    }

    const orderedPlaces = [...places];
    if (startPlaceId) {
      const startIndex = orderedPlaces.findIndex(p => p.id === startPlaceId);
      if (startIndex > 0) {
        const [startPlace] = orderedPlaces.splice(startIndex, 1);
        orderedPlaces.unshift(startPlace);
      }
    }

    const visited = new Set<number>([orderedPlaces[0].id]);
    const optimizedOrder: Place[] = [orderedPlaces[0]];
    const remaining = orderedPlaces.slice(1);

    while (remaining.length > 0) {
      const current = optimizedOrder[optimizedOrder.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const distance = this.calculateDistance(
          current.latitude, current.longitude,
          remaining[i].latitude, remaining[i].longitude
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      optimizedOrder.push(remaining[nearestIndex]);
      visited.add(remaining[nearestIndex].id);
      remaining.splice(nearestIndex, 1);
    }

    const routes: RouteResult[] = [];
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    let totalCost = 0;

    for (let i = 0; i < optimizedOrder.length - 1; i++) {
      const route = await this.getRoute(optimizedOrder[i], optimizedOrder[i + 1], travelMode);
      routes.push(route);
      totalDistanceMeters += route.distanceMeters;
      totalDurationSeconds += route.durationSeconds;
      totalCost += route.estimatedCost;
    }

    return {
      totalDistanceMeters,
      totalDurationSeconds,
      totalCost: Math.round(totalCost * 100) / 100,
      routes,
      orderedPlaceIds: optimizedOrder.map(p => p.id),
    };
  }

  async compareTransportModes(
    places: Place[]
  ): Promise<Record<string, OptimizedItinerary>> {
    const modes: ("TRANSIT" | "TAXI" | "WALK")[] = ["TRANSIT", "TAXI", "WALK"];
    const results: Record<string, OptimizedItinerary> = {};

    for (const mode of modes) {
      results[mode] = await this.optimizeRoute(places, mode);
    }

    return results;
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  }

  formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${meters}m`;
  }
}

export const routeOptimizer = new RouteOptimizer();
