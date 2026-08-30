// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **지구본 인트로 = 웹·앱 1벌.**
import COBE_SRC from "./cobe-inline";

export type GlobeMarker = {
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
};

export type GlobeOptions = {
  target: GlobeMarker;
  rotateMs: number;
  globeZoom: number;
  picketZoom: number;
};

const BG = "#070514";

// ⚠️ 수정금지(승인필요) 2026-07-30 = 도시 이름·D-Day 를 화면 코드 안에 넣을 때의 **안전 처리.**
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
  /** ⚠️ 수정금지(승인필요) 2026-07-30 = 피켓 위치는 **자바스크립트가 직접 계산**한다. */
  #picket{position:absolute;left:0;top:0;transform:translate(-50%,-100%);
    pointer-events:none;opacity:0;transition:opacity .3s,filter .3s;}
     /** ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **회전 삼각뿔 장식 삭제** §19. */
  #picketIn{display:flex;flex-direction:column;align-items:center;
    transform-origin:center bottom;
    transition:transform 1.2s cubic-bezier(.33,0,.2,1);}
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

  var el=function(id){return document.getElementById(id)};
  el('l1').textContent=T.title;
  el('l2').textContent=T.sub;
  if(!T.sub) el('l2').style.display='none';
  el('l1').style.fontSize=(0.82/PZ)+'rem';
  el('l2').style.fontSize=(1.6/PZ)+'rem';
  el('label').style.padding=(9/PZ)+'px '+(16/PZ)+'px '+(7/PZ)+'px';
  el('label').style.maxWidth='calc((100vw - 24px) / '+PZ+')';

  var canvas=el('c'), globe=null, raf=0, ro=null, disposed=false;
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
      markerElevation:0.02,opacity:0.95,
      // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **도시 점 삭제** §19.
      markers:[]
    });

    // ⚠️ 수정금지(승인필요) = **피켓 위치 계산**(CSS 앵커 대신).
    function project(lat,lng,phi,theta){
      var la=lat*Math.PI/180, lo=lng*Math.PI/180-Math.PI, cl=Math.cos(la);
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
        var p=Math.min(1,(Date.now()-startedAt)/ROT);
        phi=startPhi+Math.PI*p;
        if(p>=1){
          arrived=true;
          el('globe').style.transform='scale('+GZ+')';
          el('picketIn').style.transform='scale('+(PZ/GZ)+')';
        }
      }
      globe.update({phi:phi,theta:theta});

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
