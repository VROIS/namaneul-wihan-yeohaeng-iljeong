// ⚠️ 수정금지(승인필요) 2026-11-07 사장님 결정 = 공개 글 페이지(검색·AI 검색·LLM 노출) 7개 언어 문구 1벌 (정본 2026-11-07)
export const PAGE_LANGS = ["en", "ko", "ja", "fr", "zh", "es", "de"] as const;
export type PageLang = (typeof PAGE_LANGS)[number];

export function isPageLang(v: string): v is PageLang {
  return (PAGE_LANGS as readonly string[]).includes(v);
}

type Who =
  | "Single"
  | "Couple"
  | "Family"
  | "ExtendedFamily"
  | "Group"
  | "Kids"
  | "Parents";
type Pace = "Packed" | "Normal" | "Relaxed";

interface PageText {
  htmlLang: string;
  brand: string;
  who: Record<Who, string>;
  pace: Record<Pace, string>;
  tripTitle: (city: string, days: number, who: string) => string;
  tripIntro: (
    city: string,
    days: number,
    stops: number,
    pace: string,
  ) => string;
  day: (n: number) => string;
  meal: string;
  travel: (min: number) => string;
  price: (eur: number) => string;
  guideLink: string;
  dayFilm: string;
  ctaPlan: string;
  ctaGuide: string;
  ctaExpert: string;
  updated: string;
  indexTitle: string;
  indexIntro: string;
  otherCities: string;
  guideTitle: (place: string) => string;
  guideFrom: (city: string) => string;
  languages: string;
}

const T: Record<PageLang, PageText> = {
  en: {
    htmlLang: "en",
    brand:
      "TRIPIS (tripis.app) — your travel assistant. Plans your days and routes before you go, tells you the story of every stop on site, and a real local expert does the final check.",
    who: {
      Single: "Solo Travelers",
      Couple: "Couples",
      Family: "Families",
      ExtendedFamily: "Families with Parents",
      Group: "Groups of Friends",
      Kids: "Families with Kids",
      Parents: "Traveling with Parents",
    },
    pace: { Packed: "packed", Normal: "balanced", Relaxed: "relaxed" },
    tripTitle: (c, d, w) =>
      `${c} ${d}-Day Itinerary for ${w}: Day-by-Day Plan with Times and Routes`,
    tripIntro: (c, d, s, p) =>
      `A ${d}-day plan for ${c} with ${s} stops, start times, travel time between stops and estimated prices (${p} pace). Every stop comes from the TRIPIS place database: open places with real review counts and prices.`,
    day: (n) => `Day ${n}`,
    meal: "Meal",
    travel: (m) => `${m} min from previous stop`,
    price: (e) => `about €${e}`,
    guideLink: "On-site guide",
    dayFilm: "Watch this day as a short preview film",
    ctaPlan: "Make this plan for your own dates and family on TRIPIS",
    ctaGuide: "Hear the story of each stop on site in the TRIPIS app",
    ctaExpert: "Ask a local expert to check your plan",
    updated: "Updated",
    indexTitle: "Day-by-Day City Itineraries with Times, Routes and Costs",
    indexIntro:
      "Ready-made day-by-day plans for cities TRIPIS has fully mapped. Each plan lists stops in order with times, travel between stops and estimated prices.",
    otherCities: "More city itineraries",
    guideTitle: (p) => `${p}: What to Know Before You Go`,
    guideFrom: (c) => `From the ${c} itinerary`,
    languages: "Languages",
  },
  ko: {
    htmlLang: "ko",
    brand:
      "TRIPIS(tripis.app) — 나의 여행 비서. 떠나기 전 하루하루 여정과 동선을 짜 주고, 현장에서는 장소마다 해설을 들려주고, 마지막 검증은 현지 전문가(사람)가 직접 합니다.",
    who: {
      Single: "혼자 여행",
      Couple: "커플 여행",
      Family: "가족 여행",
      ExtendedFamily: "부모님과 함께하는 대가족 여행",
      Group: "친구들과 여행",
      Kids: "아이와 함께하는 가족 여행",
      Parents: "부모님과 함께하는 여행",
    },
    pace: { Packed: "빡빡하게", Normal: "보통", Relaxed: "여유롭게" },
    tripTitle: (c, d, w) => `${c} ${d}일 여정 · ${w} — 하루하루 시간·동선·비용`,
    tripIntro: (c, d, s, p) =>
      `${c} ${d}일, 장소 ${s}곳을 시간 순서대로 담은 여정입니다(일정 밀도 ${p}). 장소마다 시작 시간, 다음 장소까지 이동 시간, 예상 비용이 있습니다. 모든 장소는 TRIPIS 장소 데이터(영업 중·실제 리뷰 수·가격 확인)에서 골랐습니다.`,
    day: (n) => `${n}일차`,
    meal: "식사",
    travel: (m) => `앞 장소에서 ${m}분`,
    price: (e) => `약 €${e}`,
    guideLink: "현장 해설",
    dayFilm: "이 하루를 짧은 영상으로 미리 보기",
    ctaPlan: "내 날짜·내 가족으로 이 여정 만들기 (TRIPIS)",
    ctaGuide: "현장에서 장소마다 해설 듣기 (TRIPIS 앱)",
    ctaExpert: "현지 전문가에게 내 여정 검증받기",
    updated: "갱신",
    indexTitle: "도시별 하루하루 여정 — 시간·동선·비용까지",
    indexIntro:
      "TRIPIS 가 장소 데이터를 다 채운 도시의 하루하루 여정입니다. 장소를 순서대로, 시간·이동·예상 비용과 함께 담았습니다.",
    otherCities: "다른 도시 여정",
    guideTitle: (p) => `${p} — 가기 전에 알아 둘 이야기`,
    guideFrom: (c) => `${c} 여정에 들어 있는 장소`,
    languages: "언어",
  },
  ja: {
    htmlLang: "ja",
    brand:
      "TRIPIS(tripis.app)— あなたの旅の秘書。出発前に毎日の旅程とルートを組み、現地では各スポットの解説を聞かせ、最後の確認は現地の専門家(人)が行います。",
    who: {
      Single: "一人旅",
      Couple: "カップル",
      Family: "家族旅行",
      ExtendedFamily: "両親と一緒の三世代旅行",
      Group: "友達グループ",
      Kids: "子連れ家族",
      Parents: "両親との旅行",
    },
    pace: { Packed: "ぎっしり", Normal: "ふつう", Relaxed: "ゆったり" },
    tripTitle: (c, d, w) =>
      `${c} ${d}日間モデルコース(${w})— 1日ごとの時間・ルート・費用`,
    tripIntro: (c, d, s, p) =>
      `${c}の${d}日間、${s}か所を時間順にまとめた旅程です(ペース：${p})。各スポットに開始時刻、前のスポットからの移動時間、目安の費用があります。スポットはすべてTRIPISの場所データ(営業中・実際のレビュー数・料金を確認)から選んでいます。`,
    day: (n) => `${n}日目`,
    meal: "食事",
    travel: (m) => `前のスポットから${m}分`,
    price: (e) => `約€${e}`,
    guideLink: "現地解説",
    dayFilm: "この1日を短い映像でプレビュー",
    ctaPlan: "自分の日程・家族でこの旅程を作る(TRIPIS)",
    ctaGuide: "現地で各スポットの解説を聞く(TRIPISアプリ)",
    ctaExpert: "現地の専門家に旅程を確認してもらう",
    updated: "更新",
    indexTitle: "都市別 1日ごとのモデルコース — 時間・ルート・費用つき",
    indexIntro:
      "TRIPISが場所データをそろえた都市の、1日ごとの旅程です。スポットを順番に、時間・移動・目安の費用とともに載せています。",
    otherCities: "ほかの都市の旅程",
    guideTitle: (p) => `${p} — 行く前に知っておきたい話`,
    guideFrom: (c) => `${c}の旅程に含まれるスポット`,
    languages: "言語",
  },
  fr: {
    htmlLang: "fr",
    brand:
      "TRIPIS (tripis.app) — votre assistant de voyage. Il planifie vos journées et vos trajets avant le départ, vous raconte chaque étape sur place, et un vrai expert local fait la vérification finale.",
    who: {
      Single: "voyageurs solo",
      Couple: "couples",
      Family: "familles",
      ExtendedFamily: "familles avec les parents",
      Group: "groupes d'amis",
      Kids: "familles avec enfants",
      Parents: "voyager avec ses parents",
    },
    pace: { Packed: "soutenu", Normal: "équilibré", Relaxed: "tranquille" },
    tripTitle: (c, d, w) =>
      `Itinéraire ${c} en ${d} jours pour ${w} : programme jour par jour, horaires et trajets`,
    tripIntro: (c, d, s, p) =>
      `Un programme de ${d} jours à ${c} avec ${s} étapes, horaires, temps de trajet entre les étapes et prix estimés (rythme ${p}). Chaque étape vient de la base de lieux TRIPIS : lieux ouverts, vrais nombres d'avis et prix.`,
    day: (n) => `Jour ${n}`,
    meal: "Repas",
    travel: (m) => `${m} min depuis l'étape précédente`,
    price: (e) => `environ ${e} €`,
    guideLink: "Guide sur place",
    dayFilm: "Voir cette journée en court film d'aperçu",
    ctaPlan: "Créer ce programme pour vos dates et votre famille sur TRIPIS",
    ctaGuide: "Écouter l'histoire de chaque étape sur place dans l'app TRIPIS",
    ctaExpert: "Faire vérifier votre programme par un expert local",
    updated: "Mis à jour",
    indexTitle:
      "Itinéraires jour par jour par ville, avec horaires, trajets et coûts",
    indexIntro:
      "Des programmes jour par jour pour les villes que TRIPIS a entièrement cartographiées. Chaque programme liste les étapes dans l'ordre avec horaires, trajets et prix estimés.",
    otherCities: "Autres itinéraires",
    guideTitle: (p) => `${p} : ce qu'il faut savoir avant d'y aller`,
    guideFrom: (c) => `Dans l'itinéraire de ${c}`,
    languages: "Langues",
  },
  zh: {
    htmlLang: "zh-Hans",
    brand:
      "TRIPIS(tripis.app)— 你的旅行助理。出发前帮你规划每天的行程和路线，到了现场为每个景点讲解，最后由真人当地专家亲自把关。",
    who: {
      Single: "独自旅行",
      Couple: "情侣",
      Family: "家庭",
      ExtendedFamily: "带父母的大家庭",
      Group: "朋友结伴",
      Kids: "带孩子的家庭",
      Parents: "和父母一起",
    },
    pace: { Packed: "紧凑", Normal: "适中", Relaxed: "悠闲" },
    tripTitle: (c, d, w) => `${c}${d}日行程(${w})— 每天的时间、路线与花费`,
    tripIntro: (c, d, s, p) =>
      `${c}${d}天、按时间顺序安排的${s}个地点(节奏：${p})。每个地点都有开始时间、从上一站过去的时间和预估花费。所有地点都来自 TRIPIS 地点数据(营业中、真实评论数、价格已核实)。`,
    day: (n) => `第${n}天`,
    meal: "用餐",
    travel: (m) => `距上一站${m}分钟`,
    price: (e) => `约€${e}`,
    guideLink: "现场讲解",
    dayFilm: "用短片预览这一天",
    ctaPlan: "用自己的日期和家人生成这份行程(TRIPIS)",
    ctaGuide: "在现场收听每个景点的讲解(TRIPIS 应用)",
    ctaExpert: "请当地专家检查你的行程",
    updated: "更新",
    indexTitle: "城市每日行程 — 含时间、路线和花费",
    indexIntro:
      "TRIPIS 已完整收录地点数据的城市每日行程。每份行程按顺序列出地点，并附上时间、交通和预估花费。",
    otherCities: "更多城市行程",
    guideTitle: (p) => `${p} — 出发前要知道的故事`,
    guideFrom: (c) => `收录于${c}行程`,
    languages: "语言",
  },
  es: {
    htmlLang: "es",
    brand:
      "TRIPIS (tripis.app) — tu asistente de viaje. Planifica tus días y recorridos antes de salir, te cuenta la historia de cada parada en el lugar y un experto local de verdad hace la revisión final.",
    who: {
      Single: "viajeros solos",
      Couple: "parejas",
      Family: "familias",
      ExtendedFamily: "familias con los padres",
      Group: "grupos de amigos",
      Kids: "familias con niños",
      Parents: "viajar con los padres",
    },
    pace: { Packed: "intenso", Normal: "equilibrado", Relaxed: "tranquilo" },
    tripTitle: (c, d, w) =>
      `Itinerario de ${d} días en ${c} para ${w}: plan día a día con horarios y recorridos`,
    tripIntro: (c, d, s, p) =>
      `Un plan de ${d} días en ${c} con ${s} paradas, horarios, tiempo de traslado entre paradas y precios estimados (ritmo ${p}). Cada parada viene de la base de lugares de TRIPIS: lugares abiertos, número real de reseñas y precios.`,
    day: (n) => `Día ${n}`,
    meal: "Comida",
    travel: (m) => `${m} min desde la parada anterior`,
    price: (e) => `unos ${e} €`,
    guideLink: "Guía en el lugar",
    dayFilm: "Ver este día en un corto de vista previa",
    ctaPlan: "Crea este plan con tus fechas y tu familia en TRIPIS",
    ctaGuide:
      "Escucha la historia de cada parada en el lugar con la app TRIPIS",
    ctaExpert: "Pide a un experto local que revise tu plan",
    updated: "Actualizado",
    indexTitle:
      "Itinerarios día a día por ciudad, con horarios, recorridos y costos",
    indexIntro:
      "Planes día a día para las ciudades que TRIPIS tiene completamente mapeadas. Cada plan enumera las paradas en orden con horarios, traslados y precios estimados.",
    otherCities: "Más itinerarios",
    guideTitle: (p) => `${p}: lo que hay que saber antes de ir`,
    guideFrom: (c) => `Del itinerario de ${c}`,
    languages: "Idiomas",
  },
  de: {
    htmlLang: "de",
    brand:
      "TRIPIS (tripis.app) – Ihr Reiseassistent. Plant Ihre Tage und Wege vor der Abreise, erzählt Ihnen vor Ort die Geschichte jeder Station, und ein echter Experte vor Ort prüft zum Schluss.",
    who: {
      Single: "Alleinreisende",
      Couple: "Paare",
      Family: "Familien",
      ExtendedFamily: "Familien mit Eltern",
      Group: "Freundesgruppen",
      Kids: "Familien mit Kindern",
      Parents: "Reisen mit den Eltern",
    },
    pace: { Packed: "dicht", Normal: "ausgewogen", Relaxed: "entspannt" },
    tripTitle: (c, d, w) =>
      `${c} in ${d} Tagen für ${w}: Tagesplan mit Zeiten und Wegen`,
    tripIntro: (c, d, s, p) =>
      `Ein ${d}-Tage-Plan für ${c} mit ${s} Stationen, Startzeiten, Wegzeit zwischen den Stationen und geschätzten Preisen (Tempo: ${p}). Jede Station stammt aus der TRIPIS-Ortsdatenbank: geöffnete Orte mit echten Bewertungszahlen und Preisen.`,
    day: (n) => `Tag ${n}`,
    meal: "Essen",
    travel: (m) => `${m} Min. von der vorigen Station`,
    price: (e) => `ca. ${e} €`,
    guideLink: "Vor-Ort-Guide",
    dayFilm: "Diesen Tag als kurzen Vorschaufilm ansehen",
    ctaPlan: "Diesen Plan für Ihre Daten und Ihre Familie bei TRIPIS erstellen",
    ctaGuide: "Vor Ort die Geschichte jeder Station in der TRIPIS-App hören",
    ctaExpert: "Plan von einem Experten vor Ort prüfen lassen",
    updated: "Aktualisiert",
    indexTitle: "Tagespläne nach Stadt – mit Zeiten, Wegen und Kosten",
    indexIntro:
      "Fertige Tagespläne für Städte, die TRIPIS vollständig erfasst hat. Jeder Plan listet die Stationen der Reihe nach mit Zeiten, Wegen und geschätzten Preisen.",
    otherCities: "Weitere Städte",
    guideTitle: (p) => `${p}: Was man vor dem Besuch wissen sollte`,
    guideFrom: (c) => `Aus dem Plan für ${c}`,
    languages: "Sprachen",
  },
};

export function pageText(lang: PageLang): PageText {
  return T[lang];
}

export function whoKey(companion: string | null, focus: string | null): Who {
  if (focus === "Kids" || focus === "Parents") return focus;
  if (
    companion === "Single" ||
    companion === "Couple" ||
    companion === "Family" ||
    companion === "ExtendedFamily" ||
    companion === "Group"
  )
    return companion;
  return "Family";
}

export function paceKey(p: string | null): Pace {
  return p === "Packed" || p === "Relaxed" ? p : "Normal";
}
