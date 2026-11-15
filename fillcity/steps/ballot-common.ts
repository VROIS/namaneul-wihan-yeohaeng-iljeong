// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 필시티 v4 = 투표 용지 읽기·가까운 거점 판정·용지 표시·같은 종류로 알아보기 1벌(용지 만들기·발굴·선처리가 같이 쓴다) (정본 2026-11-14)
import fs from "fs";
import { latestReport } from "./common";
import { distanceKmFromCoords as km } from "../../worker/lib/services/shared/geo-distance";
import {
  recognizePlace,
  type RecognizeRow,
} from "../../worker/lib/services/shared/recognize-place";

export type BallotFile = {
  cityId: number;
  generatedAt: string;
  radiusKm: number;
  hubs: { id: number; name: string; lat: number; lng: number }[];
  dropped: {
    otherHub: number;
    noProduct: number;
    overMax: number;
    cityItself?: number;
  };
  localities?: string[]; // 반경 안 비아토르 도시 이름(알아보는 문이 이름 비교에서 빼는 동네 이름)
  ballot: {
    no: number;
    id: number;
    name: string;
    lat: number;
    lng: number;
    km: number;
    products: number;
    reviews: number;
  }[];
};

/** 그 도시 최신 용지(없으면 null) = 발굴·선처리가 같은 이 함수로 읽는다. */
export function readBallot(cityId: number, since?: string): BallotFile | null {
  const p = latestReport(
    cityId,
    "ballot",
    (f) => !since || f.slice(0, 17) >= since,
  );
  return p ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
}

/** 좌표에서 가장 가까운 거점 번호. */
export const nearestHub = (
  hubs: BallotFile["hubs"],
  lat: number,
  lng: number,
): number =>
  hubs
    .map((h) => ({ id: h.id, d: km(h.lat, h.lng, lat, lng) }))
    .sort((a, b) => a.d - b.d)[0].id;

// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 응답 한 건의 용지 표시 = 용지에 있는 볼거리면 상품 수와 번호 · 용지 밖인데 다른 거점이 더 가까우면 버림(null) = 한 장소는 가까운 거점 하나 (정본 2026-11-14)
export function ballotMark(
  ballot: BallotFile | null,
  cityId: number,
  type: string,
  p: any,
): { products?: number; ballotNo?: number } | null {
  const on =
    type === "landmarks"
      ? ballot?.ballot.find((b) => b.no === (Number(p.ballot_no) || 0))
      : undefined;
  if (
    ballot &&
    !on &&
    Number(p.lat) &&
    Number(p.lng) &&
    nearestHub(ballot.hubs, Number(p.lat), Number(p.lng)) !== cityId
  )
    return null;
  return on ? { products: on.products, ballotNo: on.no } : {};
}

export const sameKindRow = (cat: string | undefined, r: RecognizeRow) =>
  (r.seed_category === "restaurant") === (cat === "restaurant");

// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 알아보는 문이 식당↔볼거리 엇갈린 행을 주면 같은 종류 행만으로 한 번 더 찾는다(못 찾으면 신규 = 버리지 않는다) · 반경 안 도시 이름은 이름 비교에서 뺀다 (정본 2026-11-14)
export function doorSameKind(
  p: {
    name_en?: string;
    name_local?: string;
    name_ko?: string;
    address?: string;
    lat?: number;
    lng?: number;
    c?: string;
  },
  rows: RecognizeRow[],
  ballot: BallotFile | null,
) {
  const g = {
    cityNames: [
      ...(rows.find((r) => r.city_names)?.city_names ?? []),
      ...(ballot?.localities ?? []),
    ],
    name: p.name_en,
    nameLocal: p.name_local,
    nameKo: p.name_ko,
    address: p.address ?? null,
    lat: p.lat,
    lng: p.lng,
    isRestaurant: p.c === "restaurant",
  };
  const first = recognizePlace(g, rows);
  return first && !sameKindRow(p.c, first.row)
    ? recognizePlace(
        g,
        rows.filter((r) => sameKindRow(p.c, r)),
      )
    : first;
}

export interface RawPlace {
  type: "landmarks" | "restaurants";
  lang: string;
  name_en?: string;
  name_local?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  c?: string;
  price_eur?: number;
  distance_km_from_center?: number;
  address?: string;
  products?: number; // 투표 용지의 비아토르 상품 수(용지에 있는 볼거리만)
  ballotNo?: number; // 투표 용지 번호(같은 번호 = 같은 장소 = 한 묶음)
  rank?: number; // 그 언어 응답 안에서의 순위(1-20) = 리포트 참고값(best_rank 원천 아님 — 2026-08-27 사장님 확정 = best_rank 는 언어코드)
  summary?: string; // 원어 요약(그 언어) = B2 place_translations 선충전 원천
  editorial?: string; // 원어 후킹카피(그 언어)
}

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 그룹 감사 = 병합된 raw 항목 1건의 원본 필드(raw 필드명 그대로) + 문지기 판정 tier.
export interface GroupMember {
  lang: string;
  type: "landmarks" | "restaurants";
  name_en?: string;
  name_local?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  address?: string;
  price_eur?: number;
  distance_km_from_center?: number;
  products?: number;
  raw?: RawPlace;
  tier: string; // 불변3 | 불변5 | 불변6 | 의심(영어명/한국어명) | 의심(영어명·유니크색인) | new
}
