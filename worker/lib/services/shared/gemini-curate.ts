// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 제미니 보강(#07 prompt.txt) 1벌 복원 = 가격 없는 식당을 우리 번호로 120곳씩 몰아 묻는 ⑤ 후처리가 쓴다 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { geminiJson } from "./geminiClient";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const PROMPT_PATH = path.join(
  ROOT,
  "fillcity/prompts/03-enrich-after-google/prompt.txt",
);
const FALLBACK = [120, 60, 40, 20, 10];

export interface GeminiCurateInput {
  id: number;
  nameEn: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleCid?: string | null;
}
export interface GeminiCurateOutput {
  id: number;
  nameLocal: string | null;
  nameEn: string | null;
  nameKo: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  summaryKo: string | null;
  editorialSummary: string | null;
  priceEur: number | null;
  distanceKmFromCenter: number | null;
}

function parsePlaces(t: string): any[] {
  const start = t.indexOf("{");
  if (start < 0) return [];
  try {
    const j = JSON.parse(t.slice(start, t.lastIndexOf("}") + 1));
    if (j?.places) return j.places;
  } catch {}
  for (let e = t.length - 1; e > start; e--) {
    if (t[e] !== "}") continue;
    for (const suf of ["]}}", "]}", "}"]) {
      try {
        const j = JSON.parse(t.slice(start, e + 1) + suf);
        if (j?.places) return j.places;
      } catch {}
    }
  }
  return [];
}

export async function geminiCurate(
  cityName: string,
  cityId: number,
  rows: GeminiCurateInput[],
  opts?: { year?: string; apiKey?: string; rawTag?: string },
): Promise<GeminiCurateOutput[]> {
  const valid = rows.filter((r) => r.id && r.nameEn);
  if (!valid.length) return [];
  const body = fs.readFileSync(PROMPT_PATH, "utf-8").split(/═{30,}/)[2] || "";
  const year = opts?.year || String(new Date().getFullYear());
  const month = String(new Date().getMonth() + 1);
  const out: GeminiCurateOutput[] = [];

  let i = 0;
  let size = FALLBACK[0];
  while (i < valid.length) {
    const batch = valid.slice(i, i + size);
    const input = batch.map((r) => ({
      id: r.id,
      name_en: r.nameEn,
      address: r.address ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      google_cid: r.googleCid ?? null,
    }));
    const apiPass = `[API-PASS] 도시=${cityName}(${cityId}) / 행=있음(채움) / 날짜=${new Date().toISOString().slice(0, 10)}`;
    const prompt = body
      .replace(/\$\{CITY_NAME\}/g, cityName)
      .replace(/\[CITY_NAME\]/g, cityName)
      .replace(/\$\{CITY_ID\}/g, String(cityId))
      .replace(/\$\{YEAR\}/g, year)
      .replace(/\$\{MONTH\}/g, month)
      .replace(/\$\{API_PASS\}/g, apiPass)
      .replace(/\$\{BATCH_LEN\}/g, String(batch.length))
      .replace(/\$\{JSON_INPUT\}/g, JSON.stringify(input));

    const r = await geminiJson(prompt, {
      googleSearch: true,
      contextId: cityId,
      rawTag: opts?.rawTag ?? "enrich-curate",
      apiKey: opts?.apiKey,
    });
    const places =
      r.data?.places && Array.isArray(r.data.places)
        ? r.data.places
        : parsePlaces(r.raw);
    const missing = batch.filter(
      (b) => !places.find((p: any) => p.id === b.id),
    ).length;

    if (
      (places.length === 0 || missing > 5) &&
      FALLBACK.indexOf(size) < FALLBACK.length - 1
    ) {
      size = FALLBACK[FALLBACK.indexOf(size) + 1];
      continue;
    }
    for (const p of places) {
      out.push({
        id: p.id,
        nameLocal: p.name_local || null,
        nameEn: p.name_en || null,
        nameKo: p.name_ko || null,
        address: p.address || null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        summaryKo: p.summary_ko || null,
        editorialSummary: p.editorial_summary || null,
        priceEur: p.price_eur ?? null,
        distanceKmFromCenter: p.distance_km_from_center ?? null,
      });
    }
    i += batch.length;
  }
  return out;
}
