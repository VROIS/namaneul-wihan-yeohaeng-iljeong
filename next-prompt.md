---
page: bts-landing
---
BTS WORLD TOUR 'ARIRANG' 모바일 앱 랜딩 화면. 콘서트 입장 직전의 영화적 설렘, 한국 전통 유산과 현대 무대 에너지가 공존하는 "Sacred Modern" 미학. 3개의 아리랑 엠블럼이 순차적으로 붉게 빛나며 등장하는 몰입적 인트로.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Mobile, Mobile-first (React Native / Expo)
- Theme: Light default (한지 화이트), auto dark after 18:00 (콘서트 나이트)
- Background: Warm Paper White (#FAF8F5) with subtle hanji texture at opacity 0.02
- Dark Background: Concert Night (#0A0810) with subtle dangchomun pattern at opacity 0.03
- Primary Accent: Arirang Red (#C73E2D) for emblems, CTA buttons, glow effects
- Secondary Accent: Borahae Purple (#6C2DC7) for ARMY elements, selection rings
- Heritage Accent: Taegeuk Blue (#0047A0) for Korean heritage points
- Text Primary: Heritage Black (#1A1A1A) on light, Warm Ivory (#F5F0EB) on dark
- Text Secondary: (#6B7280) on light, (#9B95A8) on dark
- Title Font: Noto Serif KR Bold — Korean heritage weight, traditional serif
- Display Font: Playfair Display Bold — elegant serif for numbers and English
- Body Font: Pretendard — clean Korean sans-serif, Apple SF feel
- Buttons: 52px height, 14px radius, solid fill, touch feedback scale(0.97)
- Cards: 16px radius, subtle shadow (0,2,8,rgba(0,0,0,0.08))
- Animation: Spring-based (damping 15-20, stiffness 150-200), 200-400ms duration
- NO emojis, NO Inter/Roboto/Arial, NO heavy gradients, NO thick borders

**Page Structure:**

1. **Hero Section (upper 45% of screen):**
   - Full background: 한지 화이트 (#FAF8F5) with ultra-subtle paper grain texture
   - Faint traditional Korean 당초문 (Buddhist arabesque scroll) pattern overlay at opacity 0.03
   - **3 Arirang Emblems** centered horizontally with 24px gap:
     - Circle 1 (ㅇ): Outer circle stroke in Arirang Red, inner filled dot — like a seal stamp
     - Circle 2 (ㄹ): Outer circle stroke, two horizontal bars inside — referencing Taegeuk flag trigrams
     - Circle 3 (ㄹ): Outer circle stroke, cross grid pattern inside — referencing Taegeuk flag trigrams
     - Each emblem ~48px, with sequential red glow animation (0.3s stagger, spring entrance)
   - Below emblems: "BTS WORLD TOUR" in Noto Serif KR Bold 22px, Heritage Black, letter-spacing 2px
   - Below that: "'ARIRANG'" in Noto Serif KR Bold 32px, Arirang Red (#C73E2D), letter-spacing 3px
   - D-Day pill badge: "D-12" in Playfair Display Bold, white text on Arirang Red pill background
   - Stats line: "34 cities · 82 shows · 23 countries" — numbers in Playfair Display, text in Pretendard
   - Tagline: "아리랑 — 감정, 회복력, 하나됨의 영원한 상징" in Noto Serif KR Regular 13px
   - Bottom: smooth gradient fade from transparent to background color (40px height)

2. **Auth Section (lower 55% of screen):**
   - Clean, minimal authentication form — Apple-level polish
   - **OAuth Buttons** (pill-shaped, 52px height, full width with 24px horizontal padding):
     - Google: Outlined neutral, Google "G" icon left-aligned, "Google로 시작" text
     - Kakao: Solid filled #FEE500, Kakao speech bubble icon, "카카오로 시작" black text
     - Apple: Solid filled #000000, Apple logo icon, "Apple로 시작" white text (iOS only)
   - **Divider:** Thin horizontal line with "또는" text centered (standard Korean OAuth UX)
   - **Birth Date Input:** DD/MM/YYYY format, pill-shaped input field, numbers in Playfair Display
     - Placeholder: "생년월일 (필수)" in Pretendard Medium
     - Purpose: Character matching — subtle helper text below
   - **CTA Button:** "시작하기" in Arirang Red (#C73E2D), white text, full width, pill shape
     - Disabled state: muted opacity until birth date is complete
     - Press animation: scale(0.97) spring feedback
   - **Disclaimer:** Small text about location data and AI content agreement
   - Overall feel: spacious, breathable, Apple HIG spacing (16px base, 24px between sections)

**Key Animation Moments:**
- App open: Hero background fades in (600ms)
- Emblems appear sequentially with spring scale (0→1, damping 15, 300ms stagger)
- After emblems land: red glow ring pulses once then settles to subtle ambient glow
- Stats line fades in after emblems complete
- Auth section is immediately visible (no animation delay — user should be able to act fast)

**Critical Aesthetic Notes:**
- This must feel like a premium concert ticket app, NOT a generic login page
- The Korean heritage elements (한지 texture, 당초문 pattern, serif typography) create cultural gravitas
- The Arirang Red dominates — this is NOT a purple BTS app, red is the primary
- MZ generation target: "Instagram-screenshot-worthy" quality
- 3-second rule: User sees this and immediately knows "BTS Arirang Tour"
