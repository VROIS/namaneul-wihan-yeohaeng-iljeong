// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = init 실패 에러문구 다국어(같은 i18n 싱글턴 패턴 §16).
import i18n from "@/lib/i18n";

export type PlaceAutoSelection = {
  placeId: string;
  name: string;
  address: string;
  coords: { lat: number; lng: number };
};

type Opts = {
  apiKey: string;
  includedPrimaryTypes?: string;
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

  var DROPDOWN_SPACE = 300;
  var focused = false;
  function reportHeight() {
    var input = document.getElementById("wrap");
    var base = input ? Math.ceil(input.getBoundingClientRect().height) : 56;
    var h = focused ? Math.max(base, DROPDOWN_SPACE) : base;
    postRN({ type: "resize", height: h });
  }
  document.addEventListener("focusin", function() { focused = true; reportHeight(); });
  document.addEventListener("focusout", function() { setTimeout(function() { focused = false; reportHeight(); }, 200); });

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

      reportHeight();
      try {
        var ro = new ResizeObserver(function() { reportHeight(); });
        ro.observe(document.getElementById("wrap"));
        ro.observe(document.body);
      } catch (e) {}

      postRN({ type: "ready" });
    } catch (e) {
      var err = document.getElementById("err");
      if (err) { err.style.display = "block"; err.textContent = "${i18n.t("place.searchLoadFailed", { lng: language })}"; }
      postRN({ type: "error", message: "init 실패: " + (e && e.message) });
    }
  }

  init();
})();
</script>
</body></html>`;
};
