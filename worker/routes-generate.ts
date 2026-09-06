// Cloudflare Worker 이관 = 지도 HTML 1벌. 원본 = server/misc-routes.ts:64 (2026-09-06)

// 옮기지 않은 2벌 = 외부 유료호출이 있어 이 관문 대상이 아니다.
//   POST /api/routes/generate = server/services/agents/pipeline-v3-step1-gemini.ts:161 제미니 호출
//   POST /api/routes/day-live = server/services/shared/routes-client.ts:5 구글 Routes 호출

import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";

// worker/src.ts 가 넘겨주는 연결 1벌 = 반드시 close.
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// 원본 server/misc-routes.ts:3
const BRAND_PRIMARY = "#6366F1";

interface MapPlace {
  lat?: number;
  lng?: number;
  name?: string;
  rank?: number | null;
}

/** 원본 server/misc-routes.ts:5 getEmptyMapHtml — 문자열 그대로. */
function getEmptyMapHtml(): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,sans-serif;background:#f5f5f5}.msg{color:#666;font-size:14px}</style></head><body><div class="msg">장소 좌표 없음</div></body></html>`;
}

/** 원본 server/misc-routes.ts:9 generateMapHtml — 문자열 그대로(키는 응답 HTML 안에만 들어간다). */
function generateMapHtml(places: MapPlace[], apiKey: string): string {
  const center = {
    lat: places.reduce((sum, p) => sum + (p.lat || 0), 0) / places.length,
    lng: places.reduce((sum, p) => sum + (p.lng || 0), 0) / places.length,
  };

  const markersJson = JSON.stringify(
    places.map((p, i) => ({
      position: { lat: p.lat, lng: p.lng },
      label: String(i + 1),
      title: p.name || `장소 ${i + 1}`,
      rank: p.rank ?? null,
    })),
  );

  const pathJson = JSON.stringify(
    places.map((p) => ({ lat: p.lat, lng: p.lng })),
  );
  const centerJson = JSON.stringify(center);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}#map{width:100%;height:100%}.iw{padding:8px;max-width:180px}.iw-t{font-weight:700;font-size:13px;margin-bottom:4px}.iw-s{background:${BRAND_PRIMARY}20;color:${BRAND_PRIMARY};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}</style>
<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry"></script>
</head>
<body>
<div id="map"></div>
<script>
const places=${markersJson};
const path=${pathJson};
const center=${centerJson};
function init(){
const map=new google.maps.Map(document.getElementById('map'),{center,zoom:13,disableDefaultUI:true,zoomControl:true,gestureHandling:'greedy',styles:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]}]});
const bounds=new google.maps.LatLngBounds();
places.forEach((p,i)=>{
const pos=new google.maps.LatLng(p.position.lat,p.position.lng);
bounds.extend(pos);
const m=new google.maps.Marker({position:pos,map,label:{text:p.label,color:'white',fontWeight:'bold',fontSize:'12px'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:'${BRAND_PRIMARY}',fillOpacity:1,strokeColor:'white',strokeWeight:3},title:p.title});
const iw=new google.maps.InfoWindow({content:'<div class="iw"><div class="iw-t">'+p.title+'</div>'+(p.rank!=null?'<span class="iw-s">rank '+p.rank+'</span>':'')+'</div>'});
m.addListener('click',()=>iw.open(map,m));
});
if(path.length>1){
new google.maps.Polyline({path,geodesic:true,strokeColor:'${BRAND_PRIMARY}',strokeOpacity:0.8,strokeWeight:4,icons:[{icon:{path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:3},offset:'50%'}]}).setMap(map);
}
if(places.length>1)map.fitBounds(bounds,{top:20,right:20,bottom:20,left:20});
}
init();
</script>
</body>
</html>`;
}

export function registerGenerateRoutes(app: Express, openDb: OpenDb): void {
  // 원본 server/misc-routes.ts:64 POST /api/map/html — 키를 응답 HTML 에 넣기만 한다(서버 외부호출 없음).
  // 열쇠 = worker/routes-expert-bts.ts 의 /api/bts/map-config 와 같은 방식으로 DB 에서 채운다.
  app.post("/api/map/html", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const rows = await db
        .select({ v: schema.apiKeys.keyValue })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyName, "GOOGLE_MAPS_API_KEY"));
      const v = rows[0]?.v?.trim();
      if (v) {
        process.env.GOOGLE_MAPS_API_KEY = v;
        process.env.Google_maps_api_key = v;
      }
    } catch (e) {
      console.error("[map/html] 열쇠 조회 실패:", e);
    } finally {
      close();
    }

    // 원본과 같은 순서(Google_maps_api_key 우선).
    const apiKey =
      process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || "";

    if (!apiKey) {
      return res
        .status(400)
        .json({ error: "Google Maps API key not configured" });
    }

    const places = (req.body as { places?: unknown })?.places;
    if (!places || !Array.isArray(places) || places.length === 0) {
      return res.json({ html: getEmptyMapHtml() });
    }

    const validPlaces = (places as MapPlace[]).filter((p) => p.lat && p.lng);
    if (validPlaces.length === 0) {
      return res.json({ html: getEmptyMapHtml() });
    }

    const html = generateMapHtml(validPlaces, apiKey);
    res.json({ html });
  });
}
