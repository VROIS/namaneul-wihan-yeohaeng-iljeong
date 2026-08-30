const { Client } = require("pg");
const SUPA_URL =
  "postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres";

const events = [
  {
    cityEn: "Goyang",
    dates: ["2026-04-09", "2026-04-11", "2026-04-12"],
    venue: "고양종합운동장 주경기장 (Goyang Stadium)",
    capacity: 41000,
    notes: "투어 개막, 360도 인더라운드 스테이지",
  },
  {
    cityEn: "Tokyo",
    dates: ["2026-04-17", "2026-04-18"],
    venue: "Tokyo Dome",
    capacity: 55000,
    notes: "",
  },
  {
    cityEn: "Busan",
    dates: ["2026-06-12", "2026-06-13"],
    venue: "부산아시아드주경기장 (Busan Asiad Stadium)",
    capacity: 53000,
    notes: "데뷔 기념일 공연",
  },
  {
    cityEn: "Kaohsiung",
    dates: ["2026-11-19", "2026-11-21", "2026-11-22"],
    venue: "Kaohsiung National Stadium",
    capacity: 55000,
    notes: "",
  },
  {
    cityEn: "Bangkok",
    dates: ["2026-12-03", "2026-12-05", "2026-12-06"],
    venue: "Rajamangala Stadium",
    capacity: 49722,
    notes: "",
  },
  {
    cityEn: "Kuala Lumpur",
    dates: ["2026-12-12", "2026-12-13"],
    venue: "Bukit Jalil National Stadium",
    capacity: 87411,
    notes: "",
  },
  {
    cityEn: "Singapore",
    dates: ["2026-12-17", "2026-12-19", "2026-12-20", "2026-12-22"],
    venue: "Singapore National Stadium",
    capacity: 55000,
    notes: "4회 공연",
  },
  {
    cityEn: "Jakarta",
    dates: ["2026-12-26", "2026-12-27"],
    venue: "Gelora Bung Karno Stadium",
    capacity: 77193,
    notes: "",
  },

  {
    cityEn: "Tampa",
    dates: ["2026-04-25", "2026-04-26"],
    venue: "Raymond James Stadium",
    capacity: 65618,
    notes: "미주 투어 개막",
  },
  {
    cityEn: "El Paso",
    dates: ["2026-05-02", "2026-05-03"],
    venue: "Sun Bowl Stadium",
    capacity: 51500,
    notes: "K-pop 최초 공연",
  },
  {
    cityEn: "Mexico City",
    dates: ["2026-05-07", "2026-05-09", "2026-05-10"],
    venue: "Estadio GNP Seguros (Foro Sol)",
    capacity: 65000,
    notes: "",
  },
  {
    cityEn: "Stanford",
    dates: ["2026-05-16", "2026-05-17"],
    venue: "Stanford Stadium",
    capacity: 50000,
    notes: "Coldplay 이후 두 번째",
  },
  {
    cityEn: "Las Vegas",
    dates: ["2026-05-23", "2026-05-24", "2026-05-27", "2026-05-28"],
    venue: "Allegiant Stadium",
    capacity: 65000,
    notes: "4회 공연",
  },
  {
    cityEn: "East Rutherford",
    dates: ["2026-08-01", "2026-08-02"],
    venue: "MetLife Stadium",
    capacity: 82500,
    notes: "뉴저지/뉴욕",
  },
  {
    cityEn: "Foxborough",
    dates: ["2026-08-05", "2026-08-06"],
    venue: "Gillette Stadium",
    capacity: 65878,
    notes: "보스턴",
  },
  {
    cityEn: "Baltimore",
    dates: ["2026-08-10", "2026-08-11"],
    venue: "M&T Bank Stadium",
    capacity: 71008,
    notes: "",
  },
  {
    cityEn: "Arlington",
    dates: ["2026-08-15", "2026-08-16"],
    venue: "AT&T Stadium",
    capacity: 80000,
    notes: "달라스/알링턴",
  },
  {
    cityEn: "Toronto",
    dates: ["2026-08-22", "2026-08-23"],
    venue: "Rogers Centre",
    capacity: 49282,
    notes: "",
  },
  {
    cityEn: "Chicago",
    dates: ["2026-08-27", "2026-08-28"],
    venue: "Soldier Field",
    capacity: 61500,
    notes: "",
  },
  {
    cityEn: "Inglewood",
    dates: ["2026-09-01", "2026-09-02", "2026-09-05", "2026-09-06"],
    venue: "SoFi Stadium",
    capacity: 70240,
    notes: "LA, 4회 공연",
  },

  {
    cityEn: "Madrid",
    dates: ["2026-06-26", "2026-06-27"],
    venue: "Riyadh Air Metropolitano (Atlético)",
    capacity: 70460,
    notes: "스페인 첫 공연",
  },
  {
    cityEn: "Brussels",
    dates: ["2026-07-01", "2026-07-02"],
    venue: "King Baudouin Stadium",
    capacity: 50093,
    notes: "벨기에 첫 공연",
  },
  {
    cityEn: "London",
    dates: ["2026-07-06", "2026-07-07"],
    venue: "Tottenham Hotspur Stadium",
    capacity: 62850,
    notes: "",
  },
  {
    cityEn: "Munich",
    dates: ["2026-07-11", "2026-07-12"],
    venue: "Allianz Arena",
    capacity: 75000,
    notes: "",
  },
  {
    cityEn: "Paris",
    dates: ["2026-07-17", "2026-07-18"],
    venue: "Stade de France",
    capacity: 81338,
    notes: "",
  },

  {
    cityEn: "Bogota",
    dates: ["2026-10-02", "2026-10-03"],
    venue: "Estadio El Campín",
    capacity: 36343,
    notes: "",
  },
  {
    cityEn: "Lima",
    dates: ["2026-10-09", "2026-10-10"],
    venue: "Estadio San Marcos",
    capacity: 32000,
    notes: "",
  },
  {
    cityEn: "Santiago",
    dates: ["2026-10-16", "2026-10-17"],
    venue: "Estadio Nacional Julio Martínez Prádanos",
    capacity: 48665,
    notes: "",
  },
  {
    cityEn: "Buenos Aires",
    dates: ["2026-10-23", "2026-10-24"],
    venue: "Estadio Único Diego Armando Maradona",
    capacity: 53000,
    notes: "",
  },
  {
    cityEn: "Sao Paulo",
    dates: ["2026-10-28", "2026-10-30", "2026-10-31"],
    venue: "Estádio MorumBIS",
    capacity: 66795,
    notes: "3회 공연",
  },

  {
    cityEn: "Melbourne",
    dates: ["2027-02-12", "2027-02-13"],
    venue: "TBA",
    capacity: null,
    notes: "호주",
  },
  {
    cityEn: "Sydney",
    dates: ["2027-02-20", "2027-02-21"],
    venue: "TBA",
    capacity: null,
    notes: "호주",
  },
  {
    cityEn: "Hong Kong",
    dates: ["2027-03-04", "2027-03-05", "2027-03-06", "2027-03-07"],
    venue: "TBA",
    capacity: null,
    notes: "4회 공연",
  },
  {
    cityEn: "Manila",
    dates: ["2027-03-13", "2027-03-14"],
    venue: "TBA",
    capacity: null,
    notes: "필리핀",
  },
];

async function run() {
  const db = new Client({ connectionString: SUPA_URL });
  await db.connect();

  const citiesRes = await db.query("SELECT id, name_en FROM cities");
  const cityMap = {};
  citiesRes.rows.forEach((c) => {
    cityMap[(c.name_en || "").toLowerCase()] = c.id;
  });

  let ok = 0,
    skip = 0,
    fail = 0;

  for (const ev of events) {
    const cityId = cityMap[ev.cityEn.toLowerCase()] || null;
    const concertDate = ev.dates[0]; // 첫 공연일
    const concertEndDate =
      ev.dates.length > 1 ? ev.dates[ev.dates.length - 1] : null;

    try {
      const exists = await db.query(
        "SELECT id FROM bts_event_info WHERE concert_date = $1 AND concert_venue = $2",
        [concertDate, ev.venue],
      );
      if (exists.rows.length > 0) {
        skip++;
        continue;
      }

      await db.query(
        `
        INSERT INTO bts_event_info (city_id, concert_date, concert_end_date, concert_venue, venue_capacity, special_notes, source, verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          cityId,
          concertDate,
          concertEndDate,
          ev.venue,
          ev.capacity,
          ev.notes || null,
          "wikipedia+trip.com+weverse",
          true,
        ],
      );
      ok++;
      console.log(
        "OK: " +
          ev.cityEn +
          " (" +
          ev.dates.length +
          "회) " +
          (cityId ? "cityId:" + cityId : "NO_CITY"),
      );
    } catch (e) {
      fail++;
      console.log("ERR: " + ev.cityEn + " — " + e.message.substring(0, 60));
    }
  }

  console.log(
    "\n=== 결과: " +
      ok +
      "건 삽입, " +
      skip +
      "건 중복, " +
      fail +
      "건 실패 ===",
  );

  const total = await db.query("SELECT count(*) as n FROM bts_event_info");
  const withCity = await db.query(
    "SELECT count(*) as n FROM bts_event_info WHERE city_id IS NOT NULL",
  );
  console.log(
    "bts_event_info 총: " +
      total.rows[0].n +
      "건 (도시매핑: " +
      withCity.rows[0].n +
      "건)",
  );

  const noCity = await db.query(
    "SELECT concert_venue FROM bts_event_info WHERE city_id IS NULL",
  );
  if (noCity.rows.length > 0) {
    console.log("\n미매핑 도시:");
    noCity.rows.forEach((r) => console.log("  " + r.concert_venue));
  }

  await db.end();
}

run().catch((e) => console.error(e));
