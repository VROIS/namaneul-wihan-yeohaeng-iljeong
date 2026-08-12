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
  // 🏨 2026-06-29 = 미지정 기본 = 호텔+주소 전부 검색(숙소검색 정답). 특정 타입만 원할 때만 지정.
  includedPrimaryTypes?: string;
  // 🏨 2026-06-29 사용자 SSOT(구글맵 실증 정답) = 위젯 입력칸에 도시명 prefill(예 "Paris ") → 사용자가 뒤에 숙소명 입력 = "Paris 노보텔" = 구글맵에 도시명 치는 것과 동일 = 그 도시만. (좌표·locationRestriction 불필요)
  cityPrefix?: string;
  placeholder?: string;
  language?: string;
};

export const PLACE_AUTOCOMPLETE_HTML = (opts: Opts): string => {
  const {
    apiKey,
    includedPrimaryTypes = "",
    cityPrefix = "",
    placeholder = "",
    language = "ko",
  } = opts;

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

  // 🔎 2026-08-12 사장님 승인 = 웹뷰 안 오류를 밖(RN)으로 전부 올린다 → RN이 서버(/api/app-errors)로 전달.
  //   왜: A36(One UI 8) 키보드·빈화면 증상을 USB 없이 원격으로 확정하기 위해(사장님 = 폰 재현만, 원인 확인 = 서버 로그).
  window.onerror = function(msg, src, line) {
    postRN({ type: "error", message: "js오류: " + msg + " @" + (src || "") + ":" + (line || "") });
  };
  window.addEventListener("unhandledrejection", function(ev) {
    var r = ev && ev.reason;
    postRN({ type: "error", message: "promise오류: " + ((r && (r.message || r)) || "알수없음") });
  });

  // 🏨 2026-06-29 = WebView 동적높이 (= 빈공간 결함 해소): 입력칸일 땐 작게, 드롭다운 펼치면 크게.
  //   입력 포커스 중 = 드롭다운 공간 확보(300px), 비포커스 = 입력칸 높이만큼. RN이 resize 받아 WebView 높이 조절.
  var DROPDOWN_SPACE = 300;
  var focused = false;
  function reportHeight() {
    var input = document.getElementById("wrap");
    var base = input ? Math.ceil(input.getBoundingClientRect().height) : 56;
    var h = focused ? Math.max(base, DROPDOWN_SPACE) : base;
    postRN({ type: "resize", height: h });
  }
  // 포커스 = 드롭다운 뜰 수 있으니 공간 확보 / blur = 입력칸만 (지연 = 항목 탭 먼저 처리)
  document.addEventListener("focusin", function() { focused = true; reportHeight(); });
  document.addEventListener("focusout", function() { setTimeout(function() { focused = false; reportHeight(); }, 200); });

  // 구글 Maps JS SDK 동적 로드 (= places 라이브러리)
  (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src="https://maps.googleapis.com/maps/api/js?"+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:"${apiKey}",v:"weekly",language:"${language}"});

  async function init() {
    try {
      const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
      const ac = new PlaceAutocompleteElement(${
        includedPrimaryTypes
          ? `{ includedPrimaryTypes: ["${includedPrimaryTypes}"] }`
          : "{}"
      });
      ${placeholder ? `try { ac.placeholder = ${JSON.stringify(placeholder)}; } catch(e) {}` : ""}
      ${cityPrefix ? `try { ac.value = ${JSON.stringify(cityPrefix)}; } catch(e) {}` : ""}
      document.getElementById("wrap").insertBefore(ac, document.getElementById("err"));

      // 선택 이벤트 = gmp-select (신규 위젯 표준)
      ac.addEventListener("gmp-select", async function(ev) {
        // 선택 → RN 호출측이 이 WebView(위젯)를 언마운트 = 입력창 사라져 키보드 자동 닫힘. (옛 blur 강제닫기 폐기 = 언마운트가 처리 = §19)
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

      // 위젯 추가 후 초기 높이 보고 + 내부 변화 감시(ResizeObserver = 위젯/드롭다운 레이아웃 변동)
      reportHeight();
      try {
        var ro = new ResizeObserver(function() { reportHeight(); });
        ro.observe(document.getElementById("wrap"));
        ro.observe(document.body);
      } catch (e) {}

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
