// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **지구본 인트로 = 웹·앱 1벌.**
//   사장님 SSOT = "앱 버전 최우선". 옛것(앱은 SVG 평면지도 / 웹은 cobe 지구본 = 2벌 공존)은
//   기기마다 다른 화면이 나오는 원인이었다 = 삭제 §19.
//
//   왜 HTML 인가 = cobe 는 브라우저 기술(WebGL 캔버스 + CSS 앵커)이라 iOS/안드로이드 화면에
//   그대로 못 올린다. 그래서 **앱에서는 WebView 안에서** 이 HTML 을 띄운다.
//   (이 앱은 이미 같은 방식을 쓴다 = 여정 지도 itinerary-map-html.ts · 장소검색 place-autocomplete-html.ts §16)
//
//   ⚠️ cobe 본체(16KB)를 이 파일에 **끼워 넣는다**(빌드 때 자동). 인터넷 없이도 뜨고,
//     외부 주소를 안 불러 앱 심사·차단 위험이 없다.
import COBE_SRC from "./cobe-inline";

export type GlobeMarker = {
  lat: number;
  lng: number;
  /** 피켓 윗줄 = 도시 이름 */
  title: string;
  /** 피켓 아랫줄 = D-Day 글자(예 "D-2"). 빈 값이면 줄이 안 생긴다 */
  subtitle: string;
};

export type GlobeOptions = {
  /** 정면으로 세울 대상(= 피켓이 붙는 곳) */
  target: GlobeMarker;
  /** 반 바퀴 도는 데 걸리는 시간(밀리초) */
  rotateMs: number;
  /** 도착 후 지구본 확대 배율 */
  globeZoom: number;
  /** 피켓 확대 배율(눈에 보이는 그대로) */
  picketZoom: number;
};

// 색 = BTS 톤(보라해). 웹 화면과 같은 값을 쓴다.
const BG = "#070514";

// ⚠️ 수정금지(승인필요) 2026-07-30 = 도시 이름·D-Day 를 화면 코드 안에 넣을 때의 **안전 처리.**
//   JSON.stringify 만으로는 부족하다 = 글자 안에 `</script>` 가 들어오면 코드 블록이 그 자리에서 끊겨
//   **지구본이 안 뜨고 코드 글자가 화면에 그대로 노출**된다. `<` 를 안전한 표기로 바꿔 막는다.
function jsSafe(v: string): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

export function buildGlobeHtml(o: GlobeOptions): string {
  const t = o.target;
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:${BG};overflow:hidden;
    -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
  #wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
  #globe{position:relative;width:100%;max-width:560px;aspect-ratio:1/1;
    transition:transform 1.4s cubic-bezier(.33,0,.2,1);will-change:transform;}
  canvas{width:100%;height:100%;opacity:0;transition:opacity 1.2s ease;border-radius:50%;touch-action:none;}
  /* ⚠️ 수정금지(승인필요) 2026-07-30 = 피켓 위치는 **자바스크립트가 직접 계산**한다.
     옛 방식(CSS 앵커 = position-anchor·anchor())은 **아이폰 Safari 26 이전과 구형 안드로이드에서
     통째로 무시**되어, 피켓이 화면 밖(실측 x=-356, y=1026)으로 튕겨 **도시 이름이 아예 안 보였다** = 삭제 §19.
     지금은 매 프레임 지구본이 알려주는 점 위치(백분율)를 그대로 써서 어느 기기에서도 같게 보인다. */
  /* 바깥칸 = 위치만 담당(매 프레임 바뀜 = 전환효과 없음) */
  #picket{position:absolute;left:0;top:0;transform:translate(-50%,-100%);
    pointer-events:none;opacity:0;transition:opacity .3s,filter .3s;}
  /* 안칸 = 확대만 담당(도착 순간 1.2초에 걸쳐 커짐)
     ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **회전 삼각뿔 장식 삭제** §19.
        사유: 보여주는 도시가 하나뿐이라 표식이 필요 없고, 확대되면 피켓과 뒤엉켜 지저분했다. */
  #picketIn{display:flex;flex-direction:column;align-items:center;
    transform-origin:center bottom;
    transition:transform 1.2s cubic-bezier(.33,0,.2,1);}
  /* 피켓 글상자 = 도시명(위) / D-Day(아래) 두 줄. 아미봉 인증화면과 같은 짜임 */
  #label{display:flex;flex-direction:column;align-items:center;font-family:monospace;color:#fff;
    background:rgba(168,85,247,.92);border:2px solid #E9D5FF;border-radius:10px;
    box-shadow:0 6px 24px rgba(168,85,247,.55);text-align:center;}
  #l1{font-weight:700;letter-spacing:.18em;line-height:1.2;opacity:.85;text-indent:.18em;}
  #l2{font-weight:700;letter-spacing:-.02em;line-height:1.1;}
</style></head>
<body>
<div id="wrap"><div id="globe">
  <canvas id="c"></canvas>
  <div id="picket"><div id="picketIn">
    <div id="label"><span id="l1"></span><span id="l2"></span></div>
  </div></div>
</div></div>
<script>${COBE_SRC}</script>
<script>
(function(){
  var GZ=${o.globeZoom}, PZ=${o.picketZoom}, ROT=${o.rotateMs};
  var T={lat:${Number(t.lat) || 0},lng:${Number(t.lng) || 0},title:${jsSafe(t.title)},sub:${jsSafe(t.subtitle)}};

  // 피켓 크기 = 지구본 확대가 곱해지므로 **역수로 상쇄**한다.
  // (2026-07-30 아이폰12 에서 이걸 안 해 피켓이 화면의 2.8배로 터져 잘렸다)
  var el=function(id){return document.getElementById(id)};
  el('l1').textContent=T.title;
  el('l2').textContent=T.sub;
  if(!T.sub) el('l2').style.display='none';
  el('l1').style.fontSize=(0.82/PZ)+'rem';
  el('l2').style.fontSize=(1.6/PZ)+'rem';
  el('label').style.padding=(9/PZ)+'px '+(16/PZ)+'px '+(7/PZ)+'px';
  el('label').style.maxWidth='calc((100vw - 24px) / '+PZ+')';

  var canvas=el('c'), globe=null, raf=0, ro=null, disposed=false;
  // 대상 도시가 정면으로 오는 각도. 위아래는 거의 옆에서 보는 각도로 고정(사장님 지시).
  var targetPhi=-((T.lng*Math.PI)/180)-Math.PI/2, theta=0.18;

  function init(){
    if(disposed||globe) return;
    var w=canvas.offsetWidth; if(!w) return;
    var startPhi=targetPhi-Math.PI;      // 반 바퀴만 돈다
    var startedAt=Date.now(), phi=startPhi, arrived=false;

    globe=createGlobe(canvas,{
      devicePixelRatio:Math.min(window.devicePixelRatio||1,2),
      width:w,height:w,phi:0,theta:theta,dark:1,diffuse:1.4,
      mapSamples:16000,mapBrightness:6,
      baseColor:[0.42,0.28,0.72],glowColor:[0.16,0.1,0.32],
      // ⚠️ 점 색(markerColor)은 점을 지우면서 함께 삭제했다 = 칠할 대상이 없어 아무 일도 안 함 §19.
      //   ⚠️ 아래 markerElevation 은 **남긴다** = project() 의 r=0.8+0.02 와 짝을 이루는 숫자다.
      markerElevation:0.02,opacity:0.95,
      // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **도시 점 삭제** §19.
      //   사유: 보여주는 도시가 하나뿐이라 어디인지 구분할 필요가 없고, 피켓이 이미 그 자리를 가리킨다.
      //   게다가 확대 배율이 달라(점 2.6배 / 피켓 1.25배) 점만 부풀어 피켓을 파고들었다.
      //   ⚠️ 피켓 위치는 아래 project() 가 **위·경도로 직접 계산**하므로 점이 없어도 그대로 작동한다.
      markers:[]
    });

    // ⚠️ 수정금지(승인필요) = **피켓 위치 계산**(CSS 앵커 대신).
    //   지구본 위 한 점이 화면 어디에 오는지를 구한다. cobe 가 안에서 쓰는 것과 같은 셈법이다.
    //   반환 = 지구본 상자 기준 백분율 x·y, 그리고 지금 앞면에 있는지(visible).
    function project(lat,lng,phi,theta){
      var la=lat*Math.PI/180, lo=lng*Math.PI/180-Math.PI, cl=Math.cos(la);
      // 위·경도 → 공 위의 점
      var x=-cl*Math.cos(lo), y=Math.sin(la), z=cl*Math.sin(lo);
      var r=0.8+0.02;                       // 공 반지름 + 점이 뜬 높이(markerElevation)
      x*=r; y*=r; z*=r;
      var cp=Math.cos(phi), sp=Math.sin(phi), ct=Math.cos(theta), st=Math.sin(theta);
      var sx=cp*x+sp*z;                     // 좌우
      var sy=sp*st*x+ct*y-cp*st*z;          // 위아래
      var sz=-sp*ct*x+st*y+cp*ct*z;         // 앞뒤(양수 = 앞면)
      return { x:(sx+1)/2*100, y:(1-sy)/2*100, visible: sz>=0 };
    }

    function frame(){
      if(disposed) return;
      if(!arrived){
        // 시간 기준 = 어느 기기에서도 같은 시간에 반 바퀴(프레임 기준은 느린 기기에서 줌인이 안 됐다)
        var p=Math.min(1,(Date.now()-startedAt)/ROT);
        phi=startPhi+Math.PI*p;
        if(p>=1){
          arrived=true;
          el('globe').style.transform='scale('+GZ+')';
          // 지구본 확대가 피켓에도 곱해지므로 역수로 상쇄 = PZ 가 곧 눈에 보이는 배율
          el('picketIn').style.transform='scale('+(PZ/GZ)+')';
        }
      }
      globe.update({phi:phi,theta:theta});

      // 피켓을 그 점 바로 위에 놓는다. 뒤로 넘어가면 흐려지며 사라진다(원본과 같은 느낌).
      var q=project(T.lat,T.lng,phi,theta), pk=el('picket');
      pk.style.left=q.x+'%';
      pk.style.top=q.y+'%';
      pk.style.opacity=q.visible?'1':'0';
      pk.style.filter=q.visible?'none':'blur(8px)';

      raf=requestAnimationFrame(frame);
    }
    frame();
    setTimeout(function(){ if(!disposed) canvas.style.opacity='1'; });
  }

  if(canvas.offsetWidth>0){ init(); }
  else {
    ro=new ResizeObserver(function(e){
      if(e[0]&&e[0].contentRect.width>0){ ro.disconnect(); init(); }
    });
    ro.observe(canvas);
  }
  window.addEventListener('pagehide',function(){
    disposed=true; if(ro)ro.disconnect(); if(raf)cancelAnimationFrame(raf); if(globe)globe.destroy();
  });
})();
</script>
</body></html>`;
}
