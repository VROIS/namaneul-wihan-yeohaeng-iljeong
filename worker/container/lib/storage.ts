// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 컨테이너가 읽는 것 = 여정 1개뿐(회원 = 공용 shared/users.ts) = 안 쓰는 로그인·도시·장소 사본 삭제 (정본 9-27)
import { type Itinerary, itineraries } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export class DatabaseStorage {
  async getItinerary(id: number): Promise<Itinerary | undefined> {
    const [itinerary] = await db!
      .select()
      .from(itineraries)
      .where(eq(itineraries.id, id));
    return itinerary || undefined;
  }
}

export const storage = new DatabaseStorage();
