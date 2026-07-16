// ⚠️ 2026-07-15 = routes.ts(1,049줄) 500줄 가드 초과 슬림화 = 순수 이동(로직 변경 없음) §0
//   담긴 라우트 = 지도 HTML 생성기 + 헬스체크
import type { Express } from "express";

const BRAND_PRIMARY = "#6366F1";

function getEmptyMapHtml(): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,sans-serif;background:#f5f5f5}.msg{color:#666;font-size:14px}</style></head><body><div class="msg">장소 좌표 없음</div></body></html>`;
}

function generateMapHtml(places: any[], apiKey: string): string {
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

export function registerMiscRoutes(app: Express): void {
  // Map HTML generator
  app.post("/api/map/html", (req, res) => {
    const { places } = req.body;
    const apiKey =
      process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || "";

    if (!apiKey) {
      return res
        .status(400)
        .json({ error: "Google Maps API key not configured" });
    }

    if (!places || !Array.isArray(places) || places.length === 0) {
      return res.json({ html: getEmptyMapHtml() });
    }

    const validPlaces = places.filter((p: any) => p.lat && p.lng);
    if (validPlaces.length === 0) {
      return res.json({ html: getEmptyMapHtml() });
    }

    const html = generateMapHtml(validPlaces, apiKey);
    res.json({ html });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      version: `main-${process.env.COMMIT_HASH || "local"}`,
      timestamp: new Date().toISOString(),
      services: {
        googlePlaces: !!(
          process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY
        ),
        weather: !!process.env.OPENWEATHER_API_KEY,
        gemini: !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      },
    });
  });
}
