import { storage } from "../storage";
import type { WeatherCache } from "@shared/schema";

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";

interface OpenWeatherResponse {
  coord: { lon: number; lat: number };
  weather: Array<{
    id: number;
    main: string;
    description: string;
    icon: string;
  }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
  };
  wind: { speed: number };
  rain?: { "1h"?: number; "3h"?: number };
  snow?: { "1h"?: number; "3h"?: number };
  clouds: { all: number };
  dt: number;
}

interface ForecastResponse {
  list: Array<{
    dt: number;
    main: {
      temp: number;
      feels_like: number;
      humidity: number;
    };
    weather: Array<{
      id: number;
      main: string;
      description: string;
      icon: string;
    }>;
    wind: { speed: number };
    pop: number;
    rain?: { "3h"?: number };
    snow?: { "3h"?: number };
  }>;
  city: {
    name: string;
    country: string;
    timezone: number;
  };
}

export class WeatherFetcher {
  private apiKey: string;

  constructor() {
    this.apiKey = OPENWEATHER_API_KEY || "";
    if (!this.apiKey) {
      console.warn("OPENWEATHER_API_KEY is not set. Weather API will not work.");
    }
  }

  private calculateWeatherPenalty(weather: OpenWeatherResponse): number {
    const weatherId = weather.weather[0]?.id || 800;
    const temp = weather.main.temp;
    
    let penalty = 0;

    if (weatherId >= 200 && weatherId < 300) {
      penalty += 3;
    } else if (weatherId >= 300 && weatherId < 400) {
      penalty += 1;
    } else if (weatherId >= 500 && weatherId < 600) {
      if (weatherId >= 502) {
        penalty += 2.5;
      } else {
        penalty += 1.5;
      }
    } else if (weatherId >= 600 && weatherId < 700) {
      penalty += 2;
    } else if (weatherId >= 700 && weatherId < 800) {
      penalty += 1;
    }

    if (temp > 35) penalty += 1.5;
    else if (temp > 32) penalty += 1;
    else if (temp < 0) penalty += 1.5;
    else if (temp < 5) penalty += 0.5;

    if (weather.wind.speed > 15) penalty += 1;
    else if (weather.wind.speed > 10) penalty += 0.5;

    return Math.min(penalty, 5);
  }

  async getCurrentWeather(latitude: number, longitude: number): Promise<OpenWeatherResponse> {
    if (!this.apiKey) {
      throw new Error("OpenWeather API key is not configured");
    }

    const url = `${OPENWEATHER_BASE_URL}/weather?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=metric`;
    
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenWeather API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getForecast(latitude: number, longitude: number): Promise<ForecastResponse> {
    if (!this.apiKey) {
      throw new Error("OpenWeather API key is not configured");
    }

    const url = `${OPENWEATHER_BASE_URL}/forecast?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=metric`;
    
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenWeather API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async fetchAndCacheWeather(cityId: number, latitude: number, longitude: number): Promise<WeatherCache> {
    const weather = await this.getCurrentWeather(latitude, longitude);
    const penalty = this.calculateWeatherPenalty(weather);

    const precipitation = (weather.rain?.["1h"] || 0) + (weather.snow?.["1h"] || 0);

    const cached = await storage.upsertWeatherCache({
      cityId,
      date: new Date(),
      temperature: weather.main.temp,
      feelsLike: weather.main.feels_like,
      humidity: weather.main.humidity,
      weatherCondition: weather.weather[0]?.main || "Unknown",
      weatherIcon: weather.weather[0]?.icon || "01d",
      precipitation,
      windSpeed: weather.wind.speed,
      uvIndex: null,
      penalty,
      rawData: weather as any,
    });

    return cached;
  }

  async getWeatherForCity(cityId: number): Promise<WeatherCache | null> {
    const cached = await storage.getWeatherCache(cityId, new Date());
    
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.fetchedAt).getTime();
      const ONE_HOUR = 60 * 60 * 1000;
      
      if (cacheAge < ONE_HOUR) {
        return cached;
      }
    }

    const city = await storage.getCity(cityId);
    if (!city) {
      return null;
    }

    try {
      return await this.fetchAndCacheWeather(cityId, city.latitude, city.longitude);
    } catch (error) {
      console.error(`Failed to fetch weather for city ${cityId}:`, error);
      return cached || null;
    }
  }

  getWeatherDescription(condition: string): string {
    const descriptions: Record<string, string> = {
      Clear: "맑음",
      Clouds: "흐림",
      Rain: "비",
      Drizzle: "이슬비",
      Thunderstorm: "뇌우",
      Snow: "눈",
      Mist: "안개",
      Fog: "짙은 안개",
      Haze: "연무",
      Dust: "먼지",
      Sand: "모래바람",
    };
    return descriptions[condition] || condition;
  }

  getPenaltySeverity(penalty: number): "low" | "medium" | "high" {
    if (penalty >= 2.5) return "high";
    if (penalty >= 1) return "medium";
    return "low";
  }
}

export const weatherFetcher = new WeatherFetcher();
