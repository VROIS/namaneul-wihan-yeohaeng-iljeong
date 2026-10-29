// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 필시티 판단 AI(Clef) 관문 = 지시문 헌법 1 "이 돈으로 이곳에서 이 체험이 가능한가" + 06 걸림 질문 · 재료 = 일꾼이 읽는 로그 그대로(PSR 행 · 구글 페이지 원문 · 제미니 2차) · 묶음 규칙을 모두 넘은 행만 짝 맞음(한국어 이름 칸 글자 검사 + 이름 짝 질문 포함) · 넘은 행 5개 중 1개는 감사로 일꾼에게도 · 8개 동시 호출 (정본 Clef)
import path from "path";
import postgres from "postgres";
import { ensureKeys } from "../../worker/keys";
import { NOT_KOREAN_NAME, connectDb } from "./common";
import { lastGoogleLogs } from "../../worker/lib/services/shared/local-paths";
import { savedEnrichRaws } from "../../worker/lib/services/shared/gemini-curate";
import {
  clefDecide,
  type ClefAnswer,
  type ClefModel,
  type ClefQuestion,
} from "../../worker/lib/services/shared/clef-client";

const PAGE_CHARS = 5000;
const PASS_EXPERIENCE = 0.9;
const PASS_CATEGORY_CONFIDENCE = 0.8;
const PASS_TEXT = 0.5;
const AUDIT_EVERY = 5;
const PARALLEL = 8;
const HANGUL = /[가-힣]/;

const CATEGORIES: Record<string, string> = {
  heritage:
    "history and culture: monuments, churches, temples, palaces, castles, museums, art galleries",
  photospot:
    "viewpoints, scenic spots, observation decks, landmarks to look at",
  attraction:
    "fun things to do: theme parks, zoos, aquariums, shows, markets as a sight, streets to walk",
  adventure:
    "active outdoor activities: hiking, climbing, water sports, ziplines",
  healing: "rest and nature: parks, gardens, beaches, spas, lakes",
  shopping: "shopping: malls, department stores, shopping streets, boutiques",
  restaurant:
    "eating or drinking: restaurants, cafes, bars, pubs, bakeries, food courts",
};

export const QUESTIONS: Record<string, ClefQuestion> = {
  experience: {
    type: "noul",
    instructions:
      "Our constitution's one question: can a traveler have the experience described in this row's summary and description at this exact place? The existing price and texts come from a trusted source (Gemini) and are correct unless they clearly describe a different place or a different kind of business — do not judge the price amount here. Judge from the Google Maps page text and the Gemini notes: yes only if the row's name, category, summary and description all fit the same real place and what people actually do there.",
  },
  same_place: {
    type: "noul",
    instructions:
      "Do the row's summary, description and the Gemini notes describe the same real place as the Google Maps page (same name or renamed same business, same address area, plausible review count)?",
  },
  category: {
    type: "choice",
    instructions:
      "Judge by what people actually do there (description, reviews, photos captions, 'Located in'), never by a single Google category label. Museums and galleries are heritage; theme parks are attraction; cafes, bars and bakeries are restaurant. Which category fits this place?",
    criteria: CATEGORIES,
  },
  not_a_place: {
    type: "noul",
    instructions:
      "Is this NOT a place a traveler would visit for an experience (golf course, gas station, cinema, hospital, housing, office, government building, parking, lodging only with nothing to do)?",
  },
  status: {
    type: "choice",
    instructions:
      "Business status, only from the Google Maps page header line ('Temporarily closed' / 'Permanently closed'). Visitor comments mentioning 'closed' do not count.",
    criteria: {
      OPERATIONAL: "no closure notice in the page header",
      CLOSED_TEMPORARILY: "header says Temporarily closed",
      CLOSED_PERMANENTLY: "header says Permanently closed",
    },
  },
  text_fits: {
    type: "noul",
    instructions:
      "Are the row's Korean summary and description about this same place (not about a different place or a different kind of business)?",
  },
  name_fits: {
    type: "noul",
    instructions:
      "Is the row's Korean name (name_ko) the Korean spelling or translation of this same place's current name on the Google Maps page — not an old or different business name, not another place, not a generic description of the area?",
  },
  price_fits: {
    type: "noul",
    instructions:
      "Is the row's price a plausible adult per-person price for this experience (entrance ticket, or typical per-person meal for restaurants; 0 is correct for free places)? Child prices, parking, tokens and options are not the price.",
  },
};

type Row = Record<string, any>;

export async function loadClefKeys(): Promise<void> {
  const sql = postgres(
    String(process.env.SUPA_URL || process.env.DATABASE_URL),
    { ssl: { rejectUnauthorized: false }, max: 1 },
  );
  await ensureKeys(sql);
  await sql.end();
}

export function geminiEnrichOf(
  cityId: number,
  before = "9999",
): Map<number, any> {
  const out = new Map<number, any>();
  for (const r of savedEnrichRaws(cityId))
    if (path.basename(r.file).slice(0, 17) <= before)
      for (const p of r.places) out.set(p.id, p);
  return out;
}

export function stateOf(row: Row, page: any, gemini: any): string {
  return JSON.stringify(
    {
      row: {
        name_en: row.name_en,
        name_local: row.name_local,
        name_ko: row.name_ko,
        category: row.seed_category,
        tags: row.category_tags,
        price_eur: row.price_eur,
        summary_ko: row.summary_ko,
        description_ko: row.editorial_summary,
        business_status: row.business_status,
        review_count: row.google_review_count,
        address: row.address,
      },
      google_maps_page: page
        ? {
            name: page.parsed?.name,
            category_label: page.parsed?.category,
            review_count: page.parsed?.reviewCount,
            status: page.parsed?.status,
            price_header: page.parsed?.headerPrice,
            admission: page.parsed?.admission,
            text: String(page.rawText || "").slice(0, PAGE_CHARS),
          }
        : null,
      gemini_notes: gemini ?? null,
    },
    null,
    1,
  );
}

export function passes(
  row: Row,
  hasPage: boolean,
  a: Record<string, ClefAnswer>,
): boolean {
  return (
    hasPage &&
    (a.experience?.noul ?? 0) >= PASS_EXPERIENCE &&
    a.category?.choice === row.seed_category &&
    (a.category?.confidence ?? 0) >= PASS_CATEGORY_CONFIDENCE &&
    (a.text_fits?.noul ?? 0) >= PASS_TEXT &&
    (a.name_fits?.noul ?? 0) >= PASS_TEXT &&
    a.status?.choice === (row.business_status || "OPERATIONAL") &&
    HANGUL.test(row.name_ko || "") &&
    !NOT_KOREAN_NAME.test(row.name_ko || "") &&
    HANGUL.test(row.summary_ko || "") &&
    HANGUL.test(row.editorial_summary || "")
  );
}

export interface GateRow {
  id: number;
  cid: string;
  name: string;
  verdict: "auto" | "audit" | "worker";
  answers: Record<string, ClefAnswer>;
}

/** 최종 점검 행 전부를 Clef 에 묻는다 = auto(짝 맞음 확정) · audit(넘었지만 일꾼에게도) · worker(일꾼에게). */
export async function clefGate(
  cityId: number,
  ids: number[],
  model: ClefModel = "clef",
): Promise<GateRow[]> {
  const c = await connectDb();
  const rows: Row[] = (
    await c.query(
      `SELECT *, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, price_eur::float8 AS price_eur
         FROM place_seed_raw WHERE id = ANY($1)`,
      [ids],
    )
  ).rows;
  await c.end();
  const pages = lastGoogleLogs(cityId);
  const gem = geminiEnrichOf(cityId);
  const answersOf: Record<string, ClefAnswer>[] = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, rows.length) }, async () => {
      while (next < rows.length) {
        const i = next++;
        const r = rows[i];
        answersOf[i] = await clefDecide(
          stateOf(r, pages.get(r.id), gem.get(r.id)),
          QUESTIONS,
          { model, contextId: cityId, rawTag: `clef-gate-${r.id}` },
        );
      }
    }),
  );
  const out: GateRow[] = [];
  let passed = 0;
  for (const [i, r] of rows.entries()) {
    const answers = answersOf[i];
    const ok = passes(r, pages.has(r.id), answers);
    if (ok) passed++;
    out.push({
      id: r.id,
      cid: String(r.cid),
      name: r.name_en,
      verdict: !ok ? "worker" : passed % AUDIT_EVERY === 0 ? "audit" : "auto",
      answers,
    });
  }
  return out;
}

/** 관문을 넘은 행의 판정 = 최종 점검 판정 양식 그대로(검문 checkCheckRow 를 통과하는 모양). */
export const clefVerdict = (g: GateRow) => ({
  cid: g.cid,
  keep: true,
  reason: `Clef 관문 통과 = 체험 ${g.answers.experience.noul} · 분류 ${g.answers.category.choice} ${g.answers.category.confidence} · 글 짝 ${g.answers.text_fits.noul}`,
  source: "google-log",
  단계: {
    로그: `Clef(${QUESTIONS.experience.type}) 가 PSR 행 · 구글 페이지 원문 · 제미니 2차로 판정`,
    로그로_답: true,
    구글검색: null,
    구글맵: null,
  },
});
