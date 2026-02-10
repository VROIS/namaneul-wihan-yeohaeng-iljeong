import { storage } from "../storage";
import type { Place, RouteCache } from "@shared/schema";

// 🎯 동적으로 API 키 가져오기 (DB에서 로드 후 process.env에 설정됨)
function getGoogleMapsApiKey(): string {
  return process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || "";
}

// 💰 Routes API 일일 호출 제한 (요금 폭탄 방지)
// Routes API: $5/1,000건 (Basic) ~ $10/1,000건 (Advanced)
// 하루 1,000건 = 최대 $10/일 → 월 $300 → 안전 범위 내
const ROUTES_DAILY_LIMIT = 1000;
const routeCallTracker = {
  date: new Date().toDateString(),
  count: 0,
  blocked: 0,

  canMakeRequest(): boolean {
    const today = new Date().toDateString();
    if (this.date !== today) {
      console.log(`[Routes API] 일일 카운터 리셋: 어제 ${this.count}건 사용, ${this.blocked}건 차단`);
      this.date = today;
      this.count = 0;
      this.blocked = 0;
    }
    return this.count < ROUTES_DAILY_LIMIT;
  },

  recordCall(): void {
    this.count++;
    if (this.count % 100 === 0) {
      console.log(`[Routes API] 일일 사용량: ${this.count}/${ROUTES_DAILY_LIMIT}`);
    }
  },

  recordBlocked(): void {
    this.blocked++;
    if (this.blocked === 1 || this.blocked % 20 === 0) {
      console.warn(`⚠️ [Routes API] 일일 한도 초과! ${this.count}/${ROUTES_DAILY_LIMIT} 도달. ${this.blocked}건 차단됨.`);
    }
  },

  getStatus() {
    return { date: this.date, used: this.count, limit: ROUTES_DAILY_LIMIT, blocked: this.blocked };
  }
};

interface RouteStep {
  distance: number;
  duration: number;
  instruction: string;
  travelMode: string;
}

interface TransitFare {
  currencyCode: string;
  units: string;
  nanos?: number;
}

interface RouteResult {
  originPlaceId: number;
  destinationPlaceId: number;
  travelMode: string;
  distanceMeters: number;
  durationSeconds: number;
  durationInTraffic?: number;
  estimatedCost: number;
  transitFare?: TransitFare;  // Google API 실시간 요금
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

// 유럽 기준 교통비 (EUR)
const COST_PER_KM: Record<string, number> = {
  DRIVE: 0.5,
  TAXI: 2.0,        // 유럽 택시 기본 km당
  TRANSIT: 0.15,    // 지하철/버스 평균
  WALK: 0,
  BICYCLE: 0,
};

// 교통 기본요금 (EUR)
const BASE_FARE: Record<string, number> = {
  DRIVE: 0,
  TAXI: 4.0,        // 유럽 택시 기본료
  TRANSIT: 2.0,     // 1회권 평균
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

// 도시별 교통비 조정 계수
const CITY_COST_MULTIPLIER: Record<string, number> = {
  paris: 1.2,
  london: 1.5,
  tokyo: 1.0,
  seoul: 0.8,
  rome: 1.0,
  barcelona: 0.9,
  default: 1.0,
};

export class RouteOptimizer {
  // 🎯 API 키를 동적으로 가져옴 (DB에서 로드 후 사용 가능)
  private getApiKey(): string {
    return getGoogleMapsApiKey();
  }

  constructor() {
    // 초기화 시점에 경고만 출력 (실제 사용 시 다시 확인)
    if (!this.getApiKey()) {
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

  private estimateCost(distanceMeters: number, travelMode: string, cityName?: string): number {
    const distanceKm = distanceMeters / 1000;
    const costPerKm = COST_PER_KM[travelMode] || 0;
    const baseFare = BASE_FARE[travelMode] || 0;
    const multiplier = CITY_COST_MULTIPLIER[cityName?.toLowerCase() || "default"] || 1.0;
    
    let cost = baseFare + (distanceKm * costPerKm);
    
    // 택시 야간 할증 (20% 추가, 실제로는 시간 기반 계산 필요)
    // if (travelMode === "TAXI" && isNightTime) cost *= 1.2;
    
    return cost * multiplier;
  }

  /**
   * 실시간 교통 상황을 고려한 소요시간 계산
   */
  async getRouteWithTraffic(
    originPlace: Place,
    destinationPlace: Place,
    travelMode: "DRIVE" | "TRANSIT" | "WALK" | "BICYCLE" | "TAXI" = "TRANSIT",
    departureTime?: Date
  ): Promise<RouteResult & { durationWithTraffic?: number; trafficCondition?: string }> {
    const baseRoute = await this.getRoute(originPlace, destinationPlace, travelMode);
    
    const apiKey = this.getApiKey();
    if (!apiKey || travelMode === "WALK" || travelMode === "BICYCLE") {
      return baseRoute;
    }

    // 💰 일일 호출 제한 체크
    if (!routeCallTracker.canMakeRequest()) {
      routeCallTracker.recordBlocked();
      return baseRoute;
    }
    routeCallTracker.recordCall();

    try {
      const actualMode = travelMode === "TAXI" ? "DRIVE" : travelMode;
      const departure = departureTime || new Date();
      
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters,routes.travelAdvisory",
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
          routingPreference: actualMode === "DRIVE" ? "TRAFFIC_AWARE" : undefined,
          departureTime: departure.toISOString(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const route = data.routes?.[0];
        
        if (route) {
          const staticDuration = parseInt(route.staticDuration?.replace("s", "") || "0");
          const durationWithTraffic = parseInt(route.duration?.replace("s", "") || "0");
          
          // 교통 상황 분석
          let trafficCondition = "normal";
          if (durationWithTraffic > staticDuration * 1.5) {
            trafficCondition = "heavy";
          } else if (durationWithTraffic > staticDuration * 1.2) {
            trafficCondition = "moderate";
          } else if (durationWithTraffic < staticDuration * 0.9) {
            trafficCondition = "light";
          }

          return {
            ...baseRoute,
            durationInTraffic: durationWithTraffic,
            durationWithTraffic,
            trafficCondition,
          };
        }
      }
    } catch (error) {
      console.error("Traffic-aware routing error:", error);
    }

    return baseRoute;
  }

  async getRoute(
    originPlace: Place,
    destinationPlace: Place,
    travelMode: "DRIVE" | "TRANSIT" | "WALK" | "BICYCLE" | "TAXI" = "TRANSIT"
  ): Promise<RouteResult> {
    const actualMode = travelMode === "TAXI" ? "DRIVE" : travelMode;
    const fromName = originPlace.name || 'unknown';
    const toName = destinationPlace.name || 'unknown';

    // ===== 좌표 유효성 검증 (0,0 좌표 방지) =====
    const isValidCoord = (lat: number, lng: number) => 
      lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    if (!isValidCoord(originPlace.latitude, originPlace.longitude) || 
        !isValidCoord(destinationPlace.latitude, destinationPlace.longitude)) {
      console.warn(`[Route] ⚠️ 무효 좌표 감지: ${fromName}(${originPlace.latitude},${originPlace.longitude}) → ${toName}(${destinationPlace.latitude},${destinationPlace.longitude})`);
      // 무효 좌표: 도보 10분/0.5km 기본값 반환 (10,875분 버그 방지)
      return {
        originPlaceId: originPlace.id,
        destinationPlaceId: destinationPlace.id,
        travelMode,
        distanceMeters: 500,
        durationSeconds: 600,
        estimatedCost: 0,
      };
    }

    // ===== 캐시 확인 =====
    try {
      const cached = await storage.getRouteCache(originPlace.id, destinationPlace.id, travelMode);
      if (cached) {
        const cacheAge = Date.now() - new Date(cached.fetchedAt).getTime();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        if (cacheAge < ONE_DAY && cached.durationSeconds > 0) {
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
    } catch (cacheErr) {
      // 캐시 실패는 무시하고 API 호출로 진행
    }

    // ===== Google Routes API 호출 (핵심 동선 최적화) =====
    const apiKey = this.getApiKey();
    if (apiKey) {
      // 💰 일일 호출 제한 체크
      if (!routeCallTracker.canMakeRequest()) {
        routeCallTracker.recordBlocked();
        // 한도 초과 시 추정값 반환 (API 호출 없이)
        return this.estimateRoute(originPlace, destinationPlace, travelMode);
      }
      routeCallTracker.recordCall();

      try {
        const fieldMask = actualMode === "TRANSIT"
          ? "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps,routes.travelAdvisory.transitFare"
          : "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps";

        const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask,
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
            
            const transitFare = route.travelAdvisory?.transitFare as TransitFare | undefined;
            
            let estimatedCost: number;
            if (transitFare && transitFare.units) {
              estimatedCost = parseFloat(transitFare.units) + (transitFare.nanos ? transitFare.nanos / 1e9 : 0);
            } else {
              estimatedCost = this.estimateCost(distanceMeters, travelMode);
            }

            console.log(`[Route] ✅ Google API: ${fromName} → ${toName} | ${Math.round(durationSeconds/60)}분 ${Math.round(distanceMeters/1000*10)/10}km €${estimatedCost.toFixed(2)} (${actualMode})`);

            const result: RouteResult = {
              originPlaceId: originPlace.id,
              destinationPlaceId: destinationPlace.id,
              travelMode,
              distanceMeters,
              durationSeconds,
              estimatedCost,
              transitFare,
              polyline: route.polyline?.encodedPolyline,
            };

            try {
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
            } catch {}

            return result;
          } else {
            console.warn(`[Route] ⚠️ Google API 응답에 routes 없음: ${fromName} → ${toName}`);
          }
        } else {
          const errText = await response.text().catch(() => '');
          console.error(`[Route] ❌ Google Routes API ${response.status}: ${fromName} → ${toName} | ${errText.slice(0, 200)}`);
        }
      } catch (error: any) {
        console.error(`[Route] ❌ Google Routes API 네트워크 오류: ${fromName} → ${toName} | ${error?.message}`);
      }
    } else {
      console.warn(`[Route] ⚠️ API 키 없음 - 추정 계산 사용: ${fromName} → ${toName}`);
    }

    // ===== Fallback: Haversine 추정 (API 실패 시) =====
    const distanceMeters = this.calculateDistance(
      originPlace.latitude, originPlace.longitude,
      destinationPlace.latitude, destinationPlace.longitude
    );
    const durationSeconds = this.estimateDuration(distanceMeters, travelMode);
    const estimatedCost = this.estimateCost(distanceMeters, travelMode);

    // 최대 이동시간 제한 (120분 = 7200초, 도시 내 이동 현실 반영)
    const cappedDuration = Math.min(durationSeconds, 7200);
    
    console.log(`[Route] 📐 추정: ${fromName} → ${toName} | ${Math.round(cappedDuration/60)}분 ${Math.round(distanceMeters/1000*10)/10}km €${estimatedCost.toFixed(2)} (${actualMode})`);

    const result: RouteResult = {
      originPlaceId: originPlace.id,
      destinationPlaceId: destinationPlace.id,
      travelMode,
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: cappedDuration,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
    };

    try {
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
    } catch {}

    return result;
  }

  /** 💰 API 한도 초과 시 Haversine 추정값 반환 (과금 없음) */
  private estimateRoute(origin: Place, dest: Place, mode: string): RouteResult {
    const distanceMeters = this.calculateDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
    const durationSeconds = Math.min(this.estimateDuration(distanceMeters, mode), 7200);
    const estimatedCost = this.estimateCost(distanceMeters, mode);
    return {
      originPlaceId: origin.id, destinationPlaceId: dest.id, travelMode: mode,
      distanceMeters: Math.round(distanceMeters), durationSeconds, estimatedCost: Math.round(estimatedCost * 100) / 100,
    };
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
