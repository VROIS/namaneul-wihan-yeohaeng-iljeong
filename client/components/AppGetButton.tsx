// ⚠️ 수정금지(승인필요) 2026-10-30 사장님 원문 "알약 버튼 그거 하나만" "PC도 필요 없다" "App로 써야하고" "답은 2번이야" "3D 느낌을 최대한 살려야 돼" = 지금 코드: 휴대폰 웹 메인 화면 머리줄 알약 1개(PC·앱 없음) · 글자 App · 파랑 입체 알약 + 숨 쉬듯 퍼지는 빛(움직임 줄이기 설정이면 멈춤) · 누르면 아이폰 App Store / 안드로이드 구글 플레이 TRIPIS 설치 화면 (정본 큰 일 4)
import React from "react";
import { Platform } from "react-native";

function phoneStore(): string | null {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
    return "https://apps.apple.com/app/id6760204083";
  if (/Android/i.test(ua))
    return "https://play.google.com/store/apps/details?id=com.sonanie.guide&referrer=utm_source%3Dweb_header";
  return null;
}

const STORE_URL = phoneStore();
export const HAS_APP_GET = STORE_URL != null;

const CSS = `
.tripis-app-get{position:absolute;right:0;top:50%;transform:translateY(-50%);--h:clamp(29px,calc(29px + (100vw - 320px) * .075),32px);height:var(--h);padding:0 clamp(7px,calc(7px + (100vw - 320px) * .2),15px);border-radius:calc(var(--h) / 2);
background:linear-gradient(180deg,#6FA8FF 0%,#3B82F6 45%,#1A73E8 100%);color:#fff;font-size:clamp(13px,calc(13px + (100vw - 320px) * .025),14px);font-weight:800;line-height:var(--h);
letter-spacing:.3px;text-decoration:none;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.25);
box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18),0 3px 0 #1557C0,0 5px 10px rgba(26,115,232,.35);
animation:tripisAppGlow 1.8s ease-out infinite}
.tripis-app-get:active{transform:translateY(calc(-50% + 2px));box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 0 #1557C0,0 2px 4px rgba(26,115,232,.3)}
@keyframes tripisAppGlow{0%{box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18),0 3px 0 #1557C0,0 5px 10px rgba(26,115,232,.35),0 0 0 0 rgba(59,130,246,.55)}
100%{box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18),0 3px 0 #1557C0,0 5px 10px rgba(26,115,232,.35),0 0 0 9px rgba(59,130,246,0)}}
@media (prefers-reduced-motion:reduce){.tripis-app-get{animation:none}}`;

export default function AppGetButton() {
  if (!STORE_URL) return null;
  return (
    <>
      <style>{CSS}</style>
      <a className="tripis-app-get" href={STORE_URL}>
        App
      </a>
    </>
  );
}
