// ⚠️ 수정금지(승인필요) 2026-10-03 사장님 결정 = 관리자 화면 숫자는 백엔드가 30초마다 미리 계산해 R2 에 저장 = 화면은 저장본 하나만 읽는다(DB 직접 호출 0) (정본 §)
import type { Express } from "express";
import { adminSnapshotKey } from "../shared/r2-paths";
import {
  activitySummaryData,
  apiKeysMasked,
  dashboardData,
  externalCallsSummaryData,
  type Db,
} from "./admin-data";
import { recentItinerariesSummary } from "./routes-admin-itineraries";
import {
  getFromR2,
  isR2Configured,
  uploadToR2,
} from "./lib/services/shared/r2-client";

type OpenDb = () => { db: Db; close: () => void };

type Snapshot = {
  savedAt: string;
  errors: string[];
  sections: Record<string, unknown>;
};

// 등록 때 받은 openDb 를 크론도 쓴다(같은 isolate 모듈 1벌, DB 연결 여는 코드를 또 만들지 않는다)
let openDbRef: OpenDb | null = null;

const SECTIONS: [string, (db: Db) => Promise<unknown>][] = [
  ["activity", activitySummaryData],
  ["dashboard", dashboardData],
  ["external", externalCallsSummaryData],
  ["apiKeys", apiKeysMasked],
  [
    "itineraries",
    async (db) => ({ items: await recentItinerariesSummary(db) }),
  ],
];

async function readSnapshot(): Promise<Snapshot | null> {
  const buf = await getFromR2(adminSnapshotKey);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as Snapshot;
  } catch {
    return null;
  }
}

/** 한 번 계산해 저장 = 칸마다 1회 재시도, 끝내 실패한 칸은 직전 저장본 값을 그대로 둔다. */
export async function runSnapshotTick(): Promise<void> {
  if (!openDbRef || !isR2Configured()) return;
  const prev = await readSnapshot().catch(() => null);
  const sections: Record<string, unknown> = { ...(prev?.sections ?? {}) };
  const errors: string[] = [];
  const { db, close } = openDbRef();
  try {
    for (const [name, build] of SECTIONS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          sections[name] = await build(db);
          break;
        } catch (e) {
          if (attempt === 1) {
            errors.push(name);
            console.warn(
              `[snapshot] ${name} 계산 실패:`,
              (e as Error)?.message,
            );
          }
        }
      }
    }
  } finally {
    close();
  }
  const snap: Snapshot = {
    savedAt: new Date().toISOString(),
    errors,
    sections,
  };
  await uploadToR2(
    adminSnapshotKey,
    Buffer.from(JSON.stringify(snap)),
    "application/json",
  );
}

export function registerAdminSnapshot(app: Express, openDb: OpenDb): void {
  openDbRef = openDb;
  app.get("/api/admin/snapshot", async (_req, res) => {
    try {
      const snap = await readSnapshot();
      if (!snap) return res.status(503).json({ error: "no_snapshot" });
      res.json({
        ...snap,
        ageSec: Math.round((Date.now() - Date.parse(snap.savedAt)) / 1000),
      });
    } catch (e) {
      console.error("[snapshot] 읽기 실패:", (e as Error)?.message);
      res.status(500).json({ error: "snapshot_read_failed" });
    }
  });
}
