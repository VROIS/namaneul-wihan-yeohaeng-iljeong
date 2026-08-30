import type { Bi } from "./utils";

export const PRIVACY: Record<string, Bi> = {
  title: { ko: "개인 정보 처리 방침", en: "Privacy Policy" },
  intro: {
    ko: "TRIPIS는 여정 생성과 AI 해설 제공에 필요한 최소한의 정보만 수집하며, AI 데이터 처리 과정을 투명하게 안내합니다.",
    en: "TRIPIS collects only the minimum information needed to generate trips and provide AI narration, and explains our AI data handling transparently.",
  },
  h1: {
    ko: "1. 수집하는 개인 정보의 항목",
    en: "1. Personal Information We Collect",
  },
  b1_1: {
    ko: "• 필수: 소셜 로그인(Google·Kakao·Apple)으로 받는 이메일, 이름, 프로필 사진.",
    en: "• Required: Email, name, and profile photo received via social login (Google, Kakao, Apple).",
  },
  b1_2: {
    ko: "- 여정 생성 시: 목적지, 여행 날짜, 동행자 유형·인원, 여행 스타일 선택값.",
    en: "- When creating a trip: destination, travel dates, companion type and count, and selected travel style.",
  },
  b1_3: {
    ko: "- Tripis(해설) 이용 시: 촬영·업로드한 사진, GPS 위치정보, AI와 음성으로 대화할 때의 음성 데이터.",
    en: "- When using Tripis (narration): photos you capture or upload, GPS location data, and voice data from voice conversations with the AI.",
  },
  b1_4: {
    ko: "- 결제 시: Stripe를 통해 처리되는 결제 내역(카드 정보 자체는 저장하지 않음).",
    en: "- When making a payment: payment records processed via Stripe (we do not store card details ourselves).",
  },
  h2: {
    ko: "2. 개인 정보의 수집 및 이용 목적",
    en: "2. Purpose of Collecting and Using Personal Information",
  },
  b2_1: {
    ko: "• AI 여정 생성·해설 생성(Google Gemini API 활용).",
    en: "• Generating AI trips and narration (using the Google Gemini API).",
  },
  b2_2: {
    ko: "• 크레딧 차감·잔액 관리.",
    en: "• Deducting credits and managing your balance.",
  },
  b2_3: {
    ko: "• 회원 식별, '나의 여정'·'나의 TRIPIS' 보관함 동기화.",
    en: "• Identifying members and syncing your 'My Trips' and 'My TRIPIS' libraries.",
  },
  h3: {
    ko: "3. 개인 정보의 보유 및 이용 기간",
    en: "3. Retention and Use Period of Personal Information",
  },
  b3_1: {
    ko: "• 회원 정보: 탈퇴 시까지 보유하며, 탈퇴 요청 시 즉시 파기합니다.",
    en: "• Member information: retained until you withdraw your account, and deleted immediately upon your withdrawal request.",
  },
  b3_2: {
    ko: "• 생성한 여정·해설: 사용자가 직접 삭제(카드의 X)하기 전까지 보관됩니다.",
    en: "• Trips and narrations you create: retained until you delete them yourself (via the delete/X icon on the card).",
  },
  b3_3: {
    ko: "• 일별 여행 영상: 서비스 콘텐츠로 제작되므로, 프로필에서 숨겨도 서버에는 보관될 수 있습니다.",
    en: "• Daily trip videos: produced as service content, so even if hidden from your profile, they may remain stored on our server.",
  },
  h4: {
    ko: "4. 제3자 제공 및 위탁",
    en: "4. Third-Party Sharing and Outsourcing",
  },
  b4_1: {
    ko: "• AI 분석: Google(Gemini API) — 사진·텍스트 분석, 지도 표시.",
    en: "• AI analysis: Google (Gemini API) — photo and text analysis, map display.",
  },
  b4_2: {
    ko: "• 결제 대행: Stripe — 크레딧 충전 결제 처리.",
    en: "• Payment processing: Stripe — handles credit top-up payments.",
  },
  b4_3: {
    ko: "• 서버·데이터 보관: Supabase — 서버 운영, 이미지·영상 저장.",
    en: "• Server and data storage: Supabase — server operation, image and video storage.",
  },
  h5: { ko: "5. 이용자의 권리", en: "5. Your Rights" },
  rightsNotice: {
    ko: "언제든 개인정보 열람·수정·삭제(회원 탈퇴)를 요청할 수 있습니다. 열람·수정 문의는 {email} 로 보내주세요.",
    en: "You can request to view, correct, or delete your personal information (account withdrawal) at any time. For requests to view or correct your information, please contact {email}.",
  },
  withdrawNotice: {
    ko: "· 탈퇴하시면 로그아웃되고 목록에서 사라집니다. 6개월 안에 다시 로그인하시면 그대로 복구됩니다. 6개월이 지나면 회원 정보와 직접 찍으신 사진이 완전히 삭제됩니다.",
    en: "· Withdrawing logs you out and removes your account from the list. If you log back in within 6 months, it will be fully restored. After 6 months, your member information and any photos you personally took will be permanently deleted.",
  },
  extH: { ko: "외부 서비스 연결 해제", en: "Disconnecting External Services" },
  extIntro: {
    ko: "앱 안에서 로그아웃·탈퇴해도 소셜 서비스 쪽 연결은 남아있을 수 있습니다. 아래 방법으로 직접 해제할 수 있습니다.",
    en: "Logging out or withdrawing from the app may not disconnect your social login connection. You can disconnect it yourself using the methods below.",
  },
  extGoogle: {
    ko: "• Google: [Google 계정 > 데이터 및 개인정보 보호 > 내 계정에 액세스할 수 있는 앱]에서 해제.",
    en: "• Google: Disconnect via [Google Account > Data & Privacy > Apps with access to your account].",
  },
  extKakao: {
    ko: "• Kakao: [카카오톡 설정 > 카카오계정 > 연결된 서비스 관리]에서 해제.",
    en: "• Kakao: Disconnect via [KakaoTalk Settings > Kakao Account > Manage Connected Services].",
  },
  extApple: {
    ko: "• Apple: [설정 > Apple ID > 암호 및 보안 > Apple로 로그인을 사용하는 앱]에서 해제.",
    en: "• Apple: Disconnect via [Settings > Apple ID > Password & Security > Apps Using Apple Login].",
  },
};
