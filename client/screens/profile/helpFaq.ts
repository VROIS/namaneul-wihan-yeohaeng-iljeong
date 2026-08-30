// 🌐 2026-08-14 사장님 승인 = 한/영 2벌 구조(비한국어권 전체 영어 공유) = privacyContent.ts 와 같은 패턴,
import type { Bi } from "./utils";

export const FAQ_HEADING: Bi = {
  ko: "자주 묻는 질문",
  en: "Frequently Asked Questions",
};

export const HELP_FAQ: { icon: string; q: Bi; a: Bi }[] = [
  {
    icon: "compass",
    q: {
      ko: "앱 하단 5개 버튼(여정 / AI 의견 / 전문가 검증 / 프로필 / Tripis)은 각각 뭔가요?",
      en: "What do the 5 buttons at the bottom of the app (Plan / AI Opinion / Expert / Profile / Tripis) do?",
    },
    // ⚠️ 2026-08-08 사장님 지시 = "회색으로" 삭제 §19. 실제 탭 라벨 색은 다른 탭과 같아(rgb(156,163,175)) 회색 처리가 없다.
    a: {
      ko: "[여정]에서 도시·날짜·스타일을 고르면 나만의 일정이 만들어져요. [AI 의견]과 [전문가 검증]은 만든 여정이 있어야 눌립니다(여정이 없으면 비활성화되는 게 정상이에요). [프로필]에서 내가 만든 여정·해설·영상을 다시 볼 수 있고, [Tripis]는 카메라로 여행지를 찍어 바로 해설을 받는 기능이에요.",
      en: "In [Plan], choose a city, dates, and style to build your own itinerary. [AI Opinion] and [Expert] only become active once you have a trip (it's normal for them to be disabled if you don't have one yet). In [Profile], you can revisit the trips, narrations, and videos you've created, and [Tripis] lets you snap a photo of a spot to get instant narration.",
    },
  },
  {
    icon: "dollar-sign",
    q: {
      ko: "크레딧은 어디에, 얼마나 쓰이나요?",
      en: "Where and how much are credits used?",
    },
    a: {
      ko: "기능별로 정해진 만큼만 차감돼요 — 여정 생성 5 · AI 의견 5 · Tripis 해설 5 · 전문가 검증 10 · 여행 영상 제작 60. 가입하면 50 크레딧을 무료로 드리고, 부족하면 프로필 > 결제 관리에서 충전(€10 = 140 크레딧)할 수 있어요.",
      en: "Each feature deducts a fixed amount — trip generation 5, AI opinion 5, Tripis narration 5, expert verification 10, and trip video creation 60. You get 50 free credits when you sign up, and if you run low, you can top up (€10 = 140 credits) from Profile > Payment.",
    },
  },
  {
    icon: "bot",
    q: {
      ko: '"AI 의견"과 "전문가 검증"의 차이가 뭔가요?',
      en: 'What\'s the difference between "AI Opinion" and "Expert"?',
    },
    a: {
      ko: "[AI 의견]은 AI가 내 여정을 보고 즉시 조언을 주는 기능이고, [전문가 검증]은 실제 현지 전문가에게 문의해 답변을 받는 기능이에요. 그래서 전문가 검증이 크레딧을 더 씁니다(10크레딧). 두 기능 모두 로그인과 여정 생성이 먼저 필요해요.",
      en: "[AI Opinion] has the AI review your trip and give instant advice, while [Expert] sends your question to an actual local expert and gets a real reply. That's why Expert costs more credits (10). Both require you to be logged in and to have created a trip first.",
    },
  },
  {
    icon: "book-open",
    q: {
      ko: '각 장소의 "해설 듣기" 버튼을 누르면 뭐가 나오나요?',
      en: 'What happens when I tap the "Audio guide" button for a place?',
    },
    a: {
      ko: "그 장소에 대한 AI 음성 해설이 재생돼요. 처음 듣는 장소라면 해설을 새로 만드는 데 약간의 시간이 걸릴 수 있고, 이미 만들어진 해설이 있으면 바로 재생됩니다. 프로필 > 설정 > 언어 설정에서 고른 언어(7개 언어 지원)로 나와요.",
      en: "It plays an AI voice narration about that place. If it's the first time anyone has requested narration for that spot, generating it may take a little while; if it's already been created, it plays right away. It's narrated in whichever language you've chosen under Profile > Settings > Language (7 languages supported).",
    },
  },
  {
    icon: "film",
    q: {
      ko: '하루 일정을 "여행 애니메이션"으로 만드는 기능은 뭔가요?',
      en: 'What does the "trip animation" feature for a day\'s itinerary do?',
    },
    a: {
      ko: "여정 화면 우측 상단의 영상 버튼을 누르면, 그 날 일정을 애니메이션 영상으로 만들 수 있어요(60크레딧, 약 4~5분 소요). 만드는 동안 앱을 나가거나 다른 화면을 봐도 괜찮아요 — 완성되면 하단 [Tripis] 탭에 빨간 알림이 뜨고, 눌러보면 완성된 영상이 프로필에 자동으로 올라와 있어요. 이미 만들어진 영상이 있는 날짜는 다시 만들 필요 없이 바로 감상하거나 [저장]으로 내 프로필에 담을 수 있어요.",
      en: "Tap the video button at the top right of the trip screen to turn that day's itinerary into an animated video (60 credits, takes about 4-5 minutes). You can leave the app or view other screens while it's being made — once it's done, a red badge appears on the [Tripis] tab at the bottom, and the finished video is automatically added to your profile. For a day that already has a video, you don't need to make it again — you can watch it right away or use [Save] to add it to your profile.",
    },
  },
  {
    icon: "camera",
    q: {
      ko: "Tripis(카메라 아이콘) 탭은 정확히 뭘 하는 기능인가요?",
      en: "What exactly does the Tripis (camera icon) tab do?",
    },
    a: {
      ko: "여행 중 궁금한 장소나 작품을 카메라로 찍으면 AI가 그 자리에서 해설을 만들어줘요(5크레딧). 사진과 함께 있는 이름표·간판 글자가 잘 보이게 찍으면 더 정확한 해설을 받을 수 있어요. 궁금한 점은 음성으로 바로 물어볼 수도 있습니다.",
      en: "When you're curious about a place or artwork while traveling, snap a photo of it and the AI generates narration on the spot (5 credits). Including any nearby name plates or signs clearly in the photo helps produce more accurate narration. You can also ask follow-up questions out loud right away.",
    },
  },
  {
    icon: "star",
    q: {
      ko: "도시 대표 카드에는 왜 내가 만든 여정이 안 뜨나요?",
      en: "Why doesn't my own trip appear on the city's featured card?",
    },
    a: {
      ko: "첫 화면의 도시 카드는 운영팀이 별 표시로 선정한 대표 여정만 보여줘요. 내가 만든 여정은 자동으로 대표가 되지 않지만, 프로필 > 나의 여정에서 언제든 다시 열어볼 수 있어요.",
      en: "The city cards on the home screen only show trips our team has starred as featured. Trips you create don't automatically become featured, but you can always revisit them under Profile > My Trips.",
    },
  },
  {
    icon: "map",
    q: {
      ko: "일정에 있는 [바로가기] · [바로 예약하기] 버튼은 뭔가요?",
      en: "What do the [Open route] and [Book now] buttons in the itinerary do?",
    },
    a: {
      ko: "[바로가기]를 누르면 그 날 전체 일정이 장소마다 구간별로 이어진 구글맵 경로가 바로 열려요. [바로 예약하기]는 그 날 일정을 함께할 드라이빙 가이드와 연결해 드립니다.",
      en: "Tapping [Open route] opens a Google Maps route that links every stop of that day's full itinerary leg by leg. [Book now] connects you with a driving guide to accompany you for that day's itinerary.",
    },
  },
  {
    icon: "share-2",
    q: {
      ko: "일정에 있는 [여정 공유] · [캘린더 저장] 버튼은 뭔가요?",
      en: "What do the [Share Trip] and [Save to Calendar] buttons in the itinerary do?",
    },
    a: {
      ko: "[여정 공유]는 완성된 여정을 링크로 만들어 카카오톡·문자 등으로 다른 사람에게 바로 보낼 수 있게 해줘요. [캘린더 저장]은 그 여정의 일정을 내 휴대폰 캘린더 앱에 등록해서 날짜별로 확인할 수 있게 해줘요. 두 기능 모두 로그인이 필요하고, 아직 저장 안 한 여정이면 자동으로 먼저 저장돼요.",
      en: "[Share Trip] turns your finished trip into a link you can send to others instantly via KakaoTalk, text, and more. [Save to Calendar] adds the trip's schedule to your phone's calendar app so you can check it by date. Both features require you to be logged in, and if the trip hasn't been saved yet, it's saved automatically first.",
    },
  },
  {
    icon: "user",
    q: {
      ko: "로그인은 어떤 방법으로 할 수 있나요?",
      en: "How can I log in?",
    },
    a: {
      ko: "Google, Kakao, Apple 3가지 소셜 로그인을 지원해요. 별도의 회원가입·비밀번호 없이 간편하게 시작할 수 있습니다.",
      en: "We support 3 social login options: Google, Kakao, and Apple. You can get started easily without a separate sign-up or password.",
    },
  },
];
