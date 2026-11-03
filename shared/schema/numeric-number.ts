import { customType } from "drizzle-orm/pg-core";

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = DB 형이 numeric(p,s) 인 칸 = 저장소 정의도 numeric(p,s) 그대로 · 코드에는 숫자로 받는다(드라이버가 주는 글자를 숫자로) (정본 2026-11-03)
export const numericNumber = customType<{
  data: number;
  driverData: string;
  config: { precision: number; scale: number };
}>({
  dataType: (c) => (c ? `numeric(${c.precision}, ${c.scale})` : "numeric"),
  fromDriver: (v) => Number.parseFloat(v),
});
