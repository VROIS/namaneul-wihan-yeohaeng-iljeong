const { Client } = require("pg");
const db = new Client({
  connectionString:
    "postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres",
});

async function run() {
  await db.connect();
  const missing = [
    {
      name: "LA/잉글우드",
      nameEn: "Los Angeles",
      country: "미국",
      code: "US",
      lat: 33.9534,
      lng: -118.339,
      btsRank: 20,
      venue: "SoFi Stadium",
    },
    {
      name: "보고타",
      nameEn: "Bogota",
      country: "콜롬비아",
      code: "CO",
      lat: 4.711,
      lng: -74.072,
      btsRank: 26,
      venue: "Estadio El Campín",
    },
    {
      name: "상파울루",
      nameEn: "Sao Paulo",
      country: "브라질",
      code: "BR",
      lat: -23.5505,
      lng: -46.6333,
      btsRank: 30,
      venue: "Estádio MorumBIS",
    },
  ];

  for (const c of missing) {
    const res = await db.query(
      `INSERT INTO cities (name, name_en, country, country_code, latitude, longitude, bts_rank, mcp_phases, tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING id`,
      [
        c.name,
        c.nameEn,
        c.country,
        c.code,
        c.lat,
        c.lng,
        c.btsRank,
        JSON.stringify(["bts2026"]),
      ],
    );
    const cityId = res.rows[0].id;
    await db.query(
      "UPDATE bts_event_info SET city_id = $1 WHERE concert_venue = $2",
      [cityId, c.venue],
    );
    console.log("OK:", c.nameEn, "cityId:", cityId);
  }

  const noCity = await db.query(
    "SELECT count(*) as n FROM bts_event_info WHERE city_id IS NULL",
  );
  console.log("미매핑:", noCity.rows[0].n + "건");
  await db.end();
}

run().catch((e) => console.error(e));
