/**
 * guide_prices 테이블 마이그레이션 스크립트
 *
 * 새로 추가된 필드:
 * - base_price_4h: 기본요금 (4시간 최소)
 * - price_per_hour: 시간당 추가 요금
 * - min_hours, max_hours: 최소/최대 시간
 * - min_passengers, max_passengers: 인원 범위
 * - uber_black_estimate, uber_x_estimate, taxi_estimate: 비교 가격
 * - comparison_note: 마케팅 메시지
 */

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log("🔄 guide_prices 테이블 마이그레이션 시작...");

    // 새 컬럼 추가 (이미 존재하면 무시)
    const alterStatements = [
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS base_price_4h REAL`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS price_per_hour REAL`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS min_hours REAL DEFAULT 4`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS max_hours REAL DEFAULT 10`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS min_passengers INTEGER DEFAULT 1`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS max_passengers INTEGER DEFAULT 4`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS uber_black_estimate JSONB`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS uber_x_estimate JSONB`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS taxi_estimate JSONB`,
      `ALTER TABLE guide_prices ADD COLUMN IF NOT EXISTS comparison_note TEXT`,
    ];

    for (const stmt of alterStatements) {
      try {
        await client.query(stmt);
        console.log(`✅ ${stmt.substring(0, 60)}...`);
      } catch (err) {
        // 컬럼이 이미 존재하면 무시
        if (!err.message.includes("already exists")) {
          console.error(`⚠️ ${err.message}`);
        }
      }
    }

    // 기본 시간당 가격 데이터 삽입 (없으면)
    const defaultPrices = [
      {
        serviceType: "sedan",
        serviceName: "세단 (1-4인)",
        basePrice4h: 240,
        pricePerHour: 60,
        minPassengers: 1,
        maxPassengers: 4,
        features: ["전일 대기", "가이드 포함", "주차비 포함"],
        uberBlackEstimate: { low: 450, high: 550 },
        uberXEstimate: { low: 280, high: 350 },
        taxiEstimate: { low: 320, high: 400 },
      },
      {
        serviceType: "van",
        serviceName: "밴 (5-7인)",
        basePrice4h: 320,
        pricePerHour: 80,
        minPassengers: 5,
        maxPassengers: 7,
        features: ["전일 대기", "가이드 포함", "주차비 포함"],
        uberBlackEstimate: { low: 600, high: 750 },
        taxiEstimate: { low: 450, high: 550 },
      },
      {
        serviceType: "minibus",
        serviceName: "미니버스 (8인+)",
        basePrice4h: 400,
        pricePerHour: 100,
        minPassengers: 8,
        maxPassengers: 20,
        features: ["전일 대기", "가이드 포함", "주차비 포함"],
      },
      {
        serviceType: "guide_only",
        serviceName: "가이드 온리",
        basePrice4h: 0,
        pricePerHour: 50,
        minPassengers: 1,
        maxPassengers: 20,
        features: ["차량 없음", "가이드만 동행"],
      },
    ];

    for (const price of defaultPrices) {
      // 이미 존재하는지 확인
      const existing = await client.query(
        "SELECT id FROM guide_prices WHERE service_type = $1",
        [price.serviceType],
      );

      if (existing.rows.length === 0) {
        // 새로 삽입
        await client.query(
          `
          INSERT INTO guide_prices (
            service_type, service_name, base_price_4h, price_per_hour,
            min_passengers, max_passengers, features, 
            uber_black_estimate, uber_x_estimate, taxi_estimate,
            price_per_day, price_low, price_high, unit, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `,
          [
            price.serviceType,
            price.serviceName,
            price.basePrice4h,
            price.pricePerHour,
            price.minPassengers,
            price.maxPassengers,
            JSON.stringify(price.features),
            price.uberBlackEstimate
              ? JSON.stringify(price.uberBlackEstimate)
              : null,
            price.uberXEstimate ? JSON.stringify(price.uberXEstimate) : null,
            price.taxiEstimate ? JSON.stringify(price.taxiEstimate) : null,
            price.basePrice4h + 4 * price.pricePerHour, // 8시간 전일 가격
            price.basePrice4h,
            price.basePrice4h + 4 * price.pricePerHour,
            "hour",
            "guide_verified",
          ],
        );
        console.log(`✅ ${price.serviceName} 데이터 삽입 완료`);
      } else {
        // 기존 데이터 업데이트 (시간당 가격 필드만)
        await client.query(
          `
          UPDATE guide_prices SET
            base_price_4h = $1,
            price_per_hour = $2,
            min_passengers = $3,
            max_passengers = $4,
            uber_black_estimate = COALESCE(uber_black_estimate, $5),
            uber_x_estimate = COALESCE(uber_x_estimate, $6),
            taxi_estimate = COALESCE(taxi_estimate, $7),
            last_updated = NOW()
          WHERE service_type = $8
        `,
          [
            price.basePrice4h,
            price.pricePerHour,
            price.minPassengers,
            price.maxPassengers,
            price.uberBlackEstimate
              ? JSON.stringify(price.uberBlackEstimate)
              : null,
            price.uberXEstimate ? JSON.stringify(price.uberXEstimate) : null,
            price.taxiEstimate ? JSON.stringify(price.taxiEstimate) : null,
            price.serviceType,
          ],
        );
        console.log(`✅ ${price.serviceName} 데이터 업데이트 완료`);
      }
    }

    // 최종 확인
    const result = await client.query("SELECT * FROM guide_prices ORDER BY id");
    console.log("\n📊 현재 guide_prices 테이블:");
    console.table(
      result.rows.map((r) => ({
        type: r.service_type,
        name: r.service_name,
        base4h: r.base_price_4h,
        perHour: r.price_per_hour,
        passengers: `${r.min_passengers}-${r.max_passengers}`,
      })),
    );

    console.log("\n✅ 마이그레이션 완료!");
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
