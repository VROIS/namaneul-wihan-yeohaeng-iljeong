// 2026-06-29 = 구글 공식 장소 자동완성 위젯(PlaceAutocompleteElement) WebView HTML 템플릿
// = 자체 입력창+드롭다운 재발명 폐기(§16·§19) → 구글 공식 위젯 100% 활용 (사장님 SSOT)
// = 입력창+드롭다운+검색+선택+세션토큰 = 구글이 통째 제공. 선택 시 fetchFields → postMessage(name·address·coords)
// = 웹 = parent.postMessage / 네이티브 = ReactNativeWebView.postMessage (ItineraryMap 패턴 동일)

export type PlaceAutoSelection = {
  placeId: string;
  name: string;
  address: string;
  coords: { lat: number; lng: number };
};

type Opts = {
  apiKey: string;
  // 숙소검색 = 'lodging' (호텔만). 도시검색 = '(cities)' 대신 신규는 includedPrimaryTypes 미지정 + region.
  includedPrimaryTypes?: string;
  // 도시 근처 우선 (= "lat,lng")
  locationBias?: string;
  placeholder?: string;
  language?: string;
};

export const PLACE_AUTOCOMPLETE_HTML = (opts: Opts): string => {
  const {
    apiKey,
    includedPrimaryTypes = "lodging",
    locationBias = "",
    placeholder = "",
    language = "ko",
  } = opts;
  // locationBias "lat,lng" 파싱 (= 빈값이면 미적용)
  const biasParts = locationBias.split(",").map((s) => s.trim());
  const biasLat = biasParts.length === 2 ? Number(biasParts[0]) : null;
  const biasLng = biasParts.length === 2 ? Number(biasParts[1]) : null;
  const hasBias = biasLat != null && !Number.isNaN(biasLat) && biasLng != null && !Number.isNaN(biasLng);

  return `<!DOCTYPE html>
<html lang="${language}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Place Autocomplete</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; background: transparent; font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
#wrap { width: 100%; padding: 0; }
/* 구글 위젯(gmp-place-autocomplete) = 자체 입력창+드롭다운 제공. 폭 100% 강제 + 우리 카드 톤 맞춤. */
gmp-place-autocomplete { width: 100%; display: block; }
#err { color: #c00; font-size: 12px; padding: 6px 2px; display: none; }
</style>
</head><body>
<div id="wrap">
  <div id="err"></div>
</div>
<script>
(function() {
  function postRN(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      return;
    }
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage(JSON.stringify(payload), '*'); } catch (e) {}
    }
  }

  // 구글 Maps JS SDK 동적 로드 (= places 라이브러리)
  (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src="https://maps.googleapis.com/maps/api/js?"+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:"${apiKey}",v:"weekly",language:"${language}"});

  async function init() {
    try {
      const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
      const ac = new PlaceAutocompleteElement(${
        includedPrimaryTypes ? `{ includedPrimaryTypes: ["${includedPrimaryTypes}"] }` : "{}"
      });
      ${placeholder ? `try { ac.placeholder = ${JSON.stringify(placeholder)}; } catch(e) {}` : ""}
      ${hasBias ? `ac.locationBias = { radius: 30000, center: { lat: ${biasLat}, lng: ${biasLng} } };` : ""}
      document.getElementById("wrap").insertBefore(ac, document.getElementById("err"));

      // 선택 이벤트 = gmp-select (신규 위젯 표준)
      ac.addEventListener("gmp-select", async function(ev) {
        try {
          const pred = ev.placePrediction;
          const place = pred.toPlace();
          await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
          const loc = place.location;
          postRN({
            type: "select",
            placeId: place.id || (pred.placeId || ""),
            name: place.displayName || "",
            address: place.formattedAddress || "",
            coords: { lat: typeof loc.lat === "function" ? loc.lat() : loc.lat, lng: typeof loc.lng === "function" ? loc.lng() : loc.lng },
          });
        } catch (e) {
          postRN({ type: "error", message: "fetchFields 실패: " + (e && e.message) });
        }
      });

      postRN({ type: "ready" });
    } catch (e) {
      var err = document.getElementById("err");
      if (err) { err.style.display = "block"; err.textContent = "장소 검색 로드 실패"; }
      postRN({ type: "error", message: "init 실패: " + (e && e.message) });
    }
  }

  // init() = 내부에서 importLibrary('places') 직접 await (= 중복 호출 제거, simplify). init try/catch가 로드실패도 처리.
  init();
})();
</script>
</body></html>`;
};
